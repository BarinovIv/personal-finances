import {
  addDays,
  occurrencesBetween,
  recurringOperationId,
  type CategoryKind,
  type IsoDate,
  type RecurringData,
  type RecurringStatus
} from "@fin/domain"
import type { LedgerContext } from "./context"
import type { Period } from "./periods"
import type { RecordOf } from "./records"
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

export type RecurringProblem = "not-found" | "bad-amount" | "no-description" | "bad-category" | "bad-day"

export type RecurringResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly problem: RecurringProblem }

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

/** Ещё не созданная операция шаблона: дата не раньше `from` и ещё нет операции за этот месяц. */
const pendingOccurrences = (ctx: LedgerContext, record: RecordOf<"recurring">, from: IsoDate, to: IsoDate) =>
  occurrencesBetween(record.data, from, to).filter(
    (o) => !ctx.records.get("operations", recurringOperationId(record.id, o.month))
  )

const toView = (ctx: LedgerContext, record: RecordOf<"recurring">): RecurringView => {
  const { data } = record
  const today = ctx.today()
  const next =
    data.status === "active" ? (pendingOccurrences(ctx, record, today, addDays(today, 366))[0]?.date ?? null) : null
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

export const listRecurring = (ctx: LedgerContext): Array<RecurringView> =>
  ctx.records
    .live("recurring")
    .map((r) => toView(ctx, r))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.dayOfMonth - b.dayOfMonth)

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
  const data: RecurringData = {
    ...input,
    description: input.description.trim(),
    startDate: ctx.today(),
    status: "active"
  }
  await ctx.records.write([{ collection: "recurring", id, data }])
  return { ok: true, id }
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

/** Предстоящие списания: регулярные расходы, которые ещё появятся до конца текущего периода. */
export const upcomingIn = (ctx: LedgerContext, period: Period): Upcoming => {
  const today = ctx.today()
  if (today < period.start || today > period.end) return { items: [], total: 0 }
  const items: Array<UpcomingItem> = []
  for (const record of ctx.records.live("recurring")) {
    if (record.data.status !== "active" || record.data.kind !== "expense") continue
    for (const o of pendingOccurrences(ctx, record, today, period.end)) {
      items.push({
        templateId: record.id,
        description: record.data.description,
        date: o.date,
        amount: record.data.amount,
        category: ctx.categoryOf(record.data.categoryId, "expense")
      })
    }
  }
  items.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1))
  return { items, total: items.reduce((sum, i) => sum + i.amount, 0) }
}
