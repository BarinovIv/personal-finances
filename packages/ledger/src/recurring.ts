import {
  addDays,
  inPeriod,
  pendingOccurrences,
  upcomingCharges,
  type CategoryKind,
  type IsoDate,
  type Period,
  type RecurringData,
  type RecurringStatus
} from "@fin/domain"
import type { LedgerContext } from "./context"
import type { RecordOf } from "./records"
import type { MakeRecurringResult, RecurringProblem } from "./types"
import { writeUndoable, type Undo } from "./undo"
import type { CategoryView } from "./views"

export interface RecurringView {
  readonly id: string
  readonly kind: CategoryKind
  readonly description: string
  /** Копейки. */
  readonly amount: number
  readonly category: CategoryView
  readonly dayOfMonth: number
  readonly status: RecurringStatus
  readonly startDate: IsoDate
  /** Когда появится следующая операция; для паузы и завершённой — null. */
  readonly nextDate: IsoDate | null
}

export interface RecurringInput {
  readonly kind: CategoryKind
  readonly description: string
  readonly amount: number
  readonly categoryId: string
  readonly dayOfMonth: number
}

export type RecurringResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly problem: RecurringProblem }

export type DeleteRecurringResult =
  | { readonly ok: true; readonly undo: Undo }
  | { readonly ok: false; readonly problem: "not-found" }

export interface UpcomingItem {
  readonly templateId: string
  readonly description: string
  readonly date: IsoDate
  readonly amount: number
  readonly category: CategoryView
}

export interface Upcoming {
  readonly items: ReadonlyArray<UpcomingItem>
  readonly total: number
}

const STATUS_ORDER: Record<RecurringStatus, number> = { active: 0, paused: 1, ended: 2 }

/** Есть ли уже операция, в том числе удалённая. */
const hasOperation = (ctx: LedgerContext) => (id: string) => ctx.records.get("operations", id) !== undefined

const toView = (ctx: LedgerContext, record: RecordOf<"recurring">): RecurringView => {
  const { data } = record
  const today = ctx.today()
  const next =
    data.status === "active"
      ? (pendingOccurrences(record.id, data, hasOperation(ctx), today, addDays(today, 366))[0]?.date ?? null)
      : null
  return {
    id: record.id,
    kind: data.kind,
    description: data.description,
    amount: data.amount,
    category: ctx.categoryOf(data.categoryId, data.kind),
    dayOfMonth: data.dayOfMonth,
    status: data.status,
    startDate: data.startDate,
    nextDate: next
  }
}

/** Порядок, заданный пользователем; без него — действующие, на паузе, завершённые, по числу месяца. */
const ordered = (records: ReadonlyArray<RecordOf<"recurring">>) =>
  [...records].sort(
    (a, b) =>
      (a.data.position ?? Infinity) - (b.data.position ?? Infinity) ||
      STATUS_ORDER[a.data.status] - STATUS_ORDER[b.data.status] ||
      a.data.dayOfMonth - b.data.dayOfMonth
  )

export const listRecurring = (ctx: LedgerContext): Array<RecurringView> =>
  ordered(ctx.records.live("recurring")).map((r) => toView(ctx, r))

const validate = (ctx: LedgerContext, input: RecurringInput): RecurringProblem | null => {
  if (!Number.isInteger(input.amount) || input.amount <= 0) return "bad-amount"
  if (!input.description.trim()) return "no-description"
  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 31) return "bad-day"
  if (!ctx.allowed(input.categoryId, input.kind)) return "bad-category"
  return null
}

/** Новая регулярная операция начинает действовать сегодня; операции создаёт сервер (ADR-0002). */
export const addRecurring = async (ctx: LedgerContext, input: RecurringInput): Promise<RecurringResult> => {
  const problem = validate(ctx, input)
  if (problem) return { ok: false, problem }
  const id = ctx.newId()
  // места у новой нет — она встаёт после упорядоченных перетаскиванием
  const data: RecurringData = {
    ...input,
    description: input.description.trim(),
    startDate: ctx.today(),
    status: "active"
  }
  await ctx.records.write([{ collection: "recurring", id, data }])
  return { ok: true, id }
}

/** Расход становится регулярным; повторения начинаются после сегодня, без второго расхода за этот день. */
export const makeRecurring = async (
  ctx: LedgerContext,
  expenseId: string,
  input: Omit<RecurringInput, "kind">
): Promise<MakeRecurringResult> => {
  const expense = ctx.records.get("operations", expenseId)
  if (!expense || expense.deleted) return { ok: false, problem: "not-found" }
  if (expense.data.kind !== "expense") return { ok: false, problem: "not-expense" }
  if (expense.data.recurringId) return { ok: false, problem: "already-recurring" }
  const problem = validate(ctx, { ...input, kind: "expense" })
  if (problem) return { ok: false, problem }
  const id = ctx.newId()
  const data: RecurringData = {
    ...input,
    kind: "expense",
    description: input.description.trim(),
    startDate: addDays(ctx.today(), 1),
    status: "active"
  }
  const undo = await writeUndoable(ctx.records, [
    { collection: "recurring", id, data },
    { collection: "operations", id: expenseId, data: { ...expense.data, recurringId: id } }
  ])
  return { ok: true, id, undo }
}

const change = async (
  ctx: LedgerContext,
  id: string,
  update: (data: RecurringData) => RecurringData
): Promise<RecurringResult> => {
  const record = ctx.records.get("recurring", id)
  if (!record || record.deleted) return { ok: false, problem: "not-found" }
  const data = update(record.data)
  const problem = validate(ctx, data)
  if (problem) return { ok: false, problem }
  await ctx.records.write([{ collection: "recurring", id, data }])
  return { ok: true, id }
}

/** Правка шаблона не затрагивает уже созданные операции. */
export const updateRecurring = (ctx: LedgerContext, id: string, patch: Partial<Omit<RecurringInput, "kind">>) =>
  change(ctx, id, (data) => ({
    ...data,
    ...patch,
    ...(patch.description !== undefined ? { description: patch.description.trim() } : {})
  }))

export const pauseRecurring = (ctx: LedgerContext, id: string) => change(ctx, id, (data) => ({ ...data, status: "paused" }))

/** После паузы шаблон действует с сегодняшнего дня: пропущенное на паузе не догоняется. */
export const resumeRecurring = (ctx: LedgerContext, id: string) =>
  change(ctx, id, (data) => ({ ...data, status: "active", startDate: ctx.today() }))

export const endRecurring = (ctx: LedgerContext, id: string) => change(ctx, id, (data) => ({ ...data, status: "ended" }))

/** Удаление шаблона не трогает уже созданные по нему операции; новых он больше не создаёт. */
export const deleteRecurring = async (ctx: LedgerContext, id: string): Promise<DeleteRecurringResult> => {
  const record = ctx.records.get("recurring", id)
  if (!record || record.deleted) return { ok: false, problem: "not-found" }
  const undo = await writeUndoable(ctx.records, [{ collection: "recurring", id, data: record.data, deleted: true }])
  return { ok: true, undo }
}

/**
 * Новый порядок списка — после перетаскивания. `ids` — все регулярные операции в нужном порядке;
 * записываются только те, чьё место изменилось. Незнакомые и удалённые id пропускаются.
 */
export const reorderRecurring = async (ctx: LedgerContext, ids: ReadonlyArray<string>): Promise<void> => {
  const changes = ids.flatMap((id, index) => {
    const record = ctx.records.get("recurring", id)
    if (!record || record.deleted || record.data.position === index + 1) return []
    return [{ collection: "recurring" as const, id, data: { ...record.data, position: index + 1 } }]
  })
  if (changes.length > 0) await ctx.records.write(changes)
}

/** Предстоящие списания: будущие появления и ожидающие подтверждения расходы текущего периода. */
export const upcomingIn = (ctx: LedgerContext, period: Period): Upcoming => {
  if (!inPeriod(period, ctx.today())) return { items: [], total: 0 }
  const items = upcomingCharges(ctx.records.live("recurring"), hasOperation(ctx), period, ctx.today()).map(
    ({ template, date }): UpcomingItem => ({
      templateId: template.id,
      description: template.data.description,
      date,
      amount: template.data.amount,
      category: ctx.categoryOf(template.data.categoryId, "expense")
    })
  )
  for (const record of ctx.operations()) {
    const { data } = record
    if (!data.pending || data.kind !== "expense" || !data.recurringId || !inPeriod(period, data.date)) continue
    items.push({
      templateId: data.recurringId,
      description: data.description,
      date: data.date,
      amount: data.amount,
      category: ctx.categoryOf(data.categoryId, "expense")
    })
  }
  items.sort((a, b) => a.date.localeCompare(b.date))
  return { items, total: items.reduce((sum, i) => sum + i.amount, 0) }
}
