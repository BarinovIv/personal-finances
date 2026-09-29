import { monthlyContribution, type GoalData, type IsoDate } from "@fin/domain"
import type { LedgerContext } from "./context"
import { CATEGORY_ICONS } from "./icons"
import { byDateDesc, goalSavings } from "./movements"
import type { RecordOf } from "./records"
import { writeUndoable, type Undo } from "./undo"
import type { OperationView } from "./views"

export interface GoalView {
  readonly id: string
  readonly name: string
  readonly icon: string
  /** Целевая сумма, копейки. */
  readonly target: number
  readonly deadline: IsoDate | null
  readonly archived: boolean
  /** Накоплено: отложено − снято, копейки. */
  readonly saved: number
  /** Сколько процентов цели накоплено, целое, не больше 100. */
  readonly percent: number
  /** Накоплено не меньше цели. */
  readonly reached: boolean
  /** Сколько откладывать в месяц, чтобы успеть к сроку; без срока, после срока и у достигнутой цели — null. */
  readonly perMonth: number | null
  /** Срок прошёл, а цель не достигнута. */
  readonly overdue: boolean
}

/** Что задаёт пользователь: название, иконка, целевая сумма, необязательный срок. */
export interface GoalInput {
  readonly name: string
  readonly icon?: string
  /** Копейки. */
  readonly target: number
  readonly deadline?: IsoDate | null
}

export type GoalProblem = "not-found" | "empty-name" | "bad-target" | "bad-deadline"

export type GoalResult = { readonly ok: true; readonly goal: GoalView } | { readonly ok: false; readonly problem: GoalProblem }

/** `has-savings` — на цели что-то накоплено: сначала «Снять». */
export type DeleteGoalProblem = "not-found" | "has-savings"

/** `undo` возвращает удалённую цель. */
export type DeleteGoalResult =
  | { readonly ok: true; readonly undo: Undo }
  | { readonly ok: false; readonly problem: DeleteGoalProblem }

/** Иконка цели по умолчанию и вместо неизвестной. */
const DEFAULT_GOAL_ICON = "star"

const goalIcon = (raw: string | undefined) => (raw !== undefined && CATEGORY_ICONS.includes(raw) ? raw : DEFAULT_GOAL_ICON)

const toView = (ctx: LedgerContext, record: RecordOf<"goals">): GoalView => {
  const { data } = record
  const saved = goalSavings(ctx, record.id)
  const today = ctx.today()
  const reached = saved >= data.target
  return {
    id: record.id,
    name: data.name,
    icon: goalIcon(data.icon),
    target: data.target,
    deadline: data.deadline,
    archived: data.archived,
    saved,
    percent: Math.min(100, Math.max(0, Math.floor((saved * 100) / data.target))),
    reached,
    perMonth: monthlyContribution(data.target, saved, data.deadline, today),
    overdue: !reached && data.deadline !== null && data.deadline < today
  }
}

/** Живая цель; удалённой нет. */
export const goalOf = (ctx: LedgerContext, id: string): GoalView | undefined => {
  const record = ctx.records.get("goals", id)
  return record && !record.deleted ? toView(ctx, record) : undefined
}

/**
 * Живые цели: сначала действующие, потом архивные, внутри — в порядке создания.
 * `archived: false` — только действующие (блок «Цели» на дашборде).
 */
export const listGoals = (ctx: LedgerContext, filter: { readonly archived?: boolean } = {}): Array<GoalView> =>
  ctx.records
    .live("goals")
    .filter((r) => filter.archived === undefined || r.data.archived === filter.archived)
    .sort((a, b) => Number(a.data.archived) - Number(b.data.archived) || a.data.createdAt - b.data.createdAt)
    .map((r) => toView(ctx, r))

/** Операции «Отложено» и «Снято» цели, сначала новые. */
export const goalHistory = (ctx: LedgerContext, id: string): Array<OperationView> =>
  ctx
    .operations()
    .filter((r) => r.data.goalId === id)
    .sort((a, b) => byDateDesc(a.data, b.data))
    .map((r) => ctx.toView(r))

const validate = (data: GoalData): GoalProblem | null => {
  if (!data.name) return "empty-name"
  if (!Number.isInteger(data.target) || data.target <= 0) return "bad-target"
  if (data.deadline !== null && !/^\d{4}-\d{2}-\d{2}$/.test(data.deadline)) return "bad-deadline"
  return null
}

const save = async (ctx: LedgerContext, id: string, data: GoalData): Promise<GoalResult> => {
  const problem = validate(data)
  if (problem) return { ok: false, problem }
  await ctx.records.write([{ collection: "goals", id, data }])
  return { ok: true, goal: goalOf(ctx, id)! }
}

export const addGoal = (ctx: LedgerContext, input: GoalInput): Promise<GoalResult> =>
  save(ctx, ctx.newId(), {
    name: input.name.trim(),
    icon: goalIcon(input.icon),
    target: input.target,
    deadline: input.deadline ?? null,
    archived: false,
    createdAt: ctx.records.stamp()
  })

const change = (ctx: LedgerContext, id: string, update: (data: GoalData) => GoalData): Promise<GoalResult> => {
  const record = ctx.records.get("goals", id)
  if (!record || record.deleted) return Promise.resolve({ ok: false, problem: "not-found" })
  return save(ctx, id, update(record.data))
}

/** Правка названия, иконки, целевой суммы и срока; `deadline: null` убирает срок. */
export const updateGoal = (ctx: LedgerContext, id: string, patch: Partial<GoalInput>): Promise<GoalResult> =>
  change(ctx, id, (data) => ({
    ...data,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.icon !== undefined ? { icon: goalIcon(patch.icon) } : {}),
    ...(patch.target !== undefined ? { target: patch.target } : {}),
    ...(patch.deadline !== undefined ? { deadline: patch.deadline } : {})
  }))

/** Убрать цель в архив или вернуть из архива. */
export const archiveGoal = (ctx: LedgerContext, id: string, archived: boolean): Promise<GoalResult> =>
  change(ctx, id, (data) => ({ ...data, archived }))

/**
 * Удалить можно только цель, на которой ничего не накоплено. Её операции остаются в ленте:
 * запись цели удаляется мягко (ADR-0001), и название по ней по-прежнему видно.
 */
export const deleteGoal = async (ctx: LedgerContext, id: string): Promise<DeleteGoalResult> => {
  const record = ctx.records.get("goals", id)
  if (!record || record.deleted) return { ok: false, problem: "not-found" }
  if (goalSavings(ctx, id) !== 0) return { ok: false, problem: "has-savings" }
  const undo = await writeUndoable(ctx.records, [{ collection: "goals", id, data: record.data, deleted: true }])
  return { ok: true, undo }
}
