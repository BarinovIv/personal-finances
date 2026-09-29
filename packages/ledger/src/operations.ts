import type { IsoDate, OperationData } from "@fin/domain"
import type { LedgerContext } from "./context"
import { writeUndoable, type Undo } from "./undo"
import type { OperationView } from "./views"

export interface OperationPatch {
  /** Копейки. */
  readonly amount?: number
  readonly description?: string
  readonly categoryId?: string
  readonly date?: IsoDate
}

export type UpdateProblem = "not-found" | "bad-amount" | "no-description" | "bad-category" | "below-refunds"

/** `undo` возвращает прежние сумму, описание, категорию и дату — и подстановку по истории, как до правки. */
export type UpdateResult =
  | { readonly ok: true; readonly undo: Undo }
  | { readonly ok: false; readonly problem: UpdateProblem }

/** Сумма живых возвратов расхода, копейки. `except` — возврат, который сейчас правят. */
export const refundedAmount = (ctx: LedgerContext, expenseId: string, except?: string): number =>
  ctx.records
    .live("operations")
    .filter((r) => r.data.refundOf === expenseId && r.id !== except)
    .reduce((sum, r) => sum + r.data.amount, 0)

/** Правка операции. Правка — это новая версия записи с новым временем (ADR-0001). */
export const updateOperation = async (ctx: LedgerContext, id: string, patch: OperationPatch): Promise<UpdateResult> => {
  const record = ctx.records.get("operations", id)
  if (!record || record.deleted) return { ok: false, problem: "not-found" }
  const current = record.data
  const next: OperationData = {
    ...current,
    ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
    ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
    ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
    ...(patch.date !== undefined ? { date: patch.date } : {})
  }
  if (!Number.isInteger(next.amount) || next.amount <= 0) return { ok: false, problem: "bad-amount" }
  if (!next.description) return { ok: false, problem: "no-description" }
  const stamp = ctx.records.stamp()
  // выбор категории — отдельное событие для истории подстановок
  const data = next.categoryId === current.categoryId ? next : { ...next, categorizedAt: stamp }

  if (current.kind === "refund") {
    // у возврата меняются только сумма и дата; категория — всегда категория исходного расхода
    if (next.categoryId !== current.categoryId || next.description !== current.description) {
      return { ok: false, problem: "bad-category" }
    }
    const original = current.refundOf ? ctx.records.get("operations", current.refundOf) : undefined
    if (original && next.amount + refundedAmount(ctx, original.id, id) > original.data.amount) {
      return { ok: false, problem: "bad-amount" }
    }
  } else {
    if (!ctx.allowed(next.categoryId, current.kind)) return { ok: false, problem: "bad-category" }
    if (current.kind === "expense" && next.amount < refundedAmount(ctx, id)) {
      return { ok: false, problem: "below-refunds" }
    }
  }
  const undo = await writeUndoable(ctx.records, [{ collection: "operations", id, data }], stamp)
  return { ok: true, undo }
}

/**
 * Удаление — тоже правка: запись помечается удалённой (ADR-0001). Вместе с расходом удаляются его возвраты.
 * `undo` возвращает операцию вместе с возвратами, удалёнными вместе с ней.
 */
export const deleteOperation = async (ctx: LedgerContext, id: string): Promise<Undo> => {
  const record = ctx.records.get("operations", id)
  if (!record || record.deleted) return async () => ({ ok: false })
  const refunds = ctx.records.live("operations").filter((r) => r.data.refundOf === id)
  return writeUndoable(
    ctx.records,
    [record, ...refunds].map((r) => ({ collection: "operations" as const, id: r.id, data: r.data, deleted: true }))
  )
}

export type RefundProblem = "not-refundable" | "bad-amount" | "too-much"

export type RefundResult =
  /** `undo` удаляет этот возврат. */
  | { readonly ok: true; readonly operation: OperationView; readonly undo: Undo }
  | { readonly ok: false; readonly problem: RefundProblem }

export interface RefundsInfo {
  /** Уже возвращено, копейки. */
  readonly refunded: number
  /** Ещё можно вернуть. Ноль — кнопка «Возврат» скрыта. */
  readonly remaining: number
  /** Сначала новые. */
  readonly items: ReadonlyArray<OperationView>
}

export const refundsOf = (ctx: LedgerContext, expenseId: string): RefundsInfo | undefined => {
  const record = ctx.records.get("operations", expenseId)
  if (!record || record.deleted || record.data.kind !== "expense") return undefined
  const items = ctx
    .operations()
    .filter((r) => r.data.refundOf === expenseId)
    .sort((a, b) => (a.data.date === b.data.date ? b.data.createdAt - a.data.createdAt : a.data.date < b.data.date ? 1 : -1))
    .map((r) => ctx.toView(r))
  const refunded = items.reduce((sum, r) => sum + r.amount, 0)
  return { refunded, remaining: record.data.amount - refunded, items }
}

/** Возврат по расходу: по умолчанию вся ещё не возвращённая сумма, сегодня. */
export const addRefund = async (
  ctx: LedgerContext,
  expenseId: string,
  options: { readonly amount?: number; readonly date?: IsoDate } = {}
): Promise<RefundResult> => {
  const info = refundsOf(ctx, expenseId)
  const original = ctx.records.get("operations", expenseId)
  if (!info || !original) return { ok: false, problem: "not-refundable" }
  const amount = options.amount ?? info.remaining
  if (info.remaining <= 0 || amount > info.remaining) return { ok: false, problem: "too-much" }
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, problem: "bad-amount" }
  const id = ctx.newId()
  const stamp = ctx.records.stamp()
  const data: OperationData = {
    kind: "refund",
    amount,
    description: original.data.description,
    categoryId: original.data.categoryId,
    date: options.date ?? ctx.today(),
    createdAt: stamp,
    categorizedAt: stamp,
    refundOf: expenseId,
    recurringId: null
  }
  const undo = await writeUndoable(ctx.records, [{ collection: "operations", id, data }], stamp)
  return { ok: true, operation: ctx.toView(ctx.records.get("operations", id)!), undo }
}
