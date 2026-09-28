import type { IsoDate, OperationData } from "@fin/domain"
import type { LedgerContext } from "./context"

export interface OperationPatch {
  /** Копейки. */
  readonly amount?: number
  readonly description?: string
  readonly categoryId?: string
  readonly date?: IsoDate
}

export type UpdateProblem = "not-found" | "bad-amount" | "no-description" | "bad-category" | "below-refunds"

export type UpdateResult = { readonly ok: true } | { readonly ok: false; readonly problem: UpdateProblem }

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
  await ctx.records.write([{ collection: "operations", id, data: next }])
  return { ok: true }
}

/** Удаление — тоже правка: запись помечается удалённой (ADR-0001). Вместе с расходом удаляются его возвраты. */
export const deleteOperation = async (ctx: LedgerContext, id: string): Promise<void> => {
  const record = ctx.records.get("operations", id)
  if (!record || record.deleted) return
  const refunds = ctx.records.live("operations").filter((r) => r.data.refundOf === id)
  await ctx.records.write(
    [record, ...refunds].map((r) => ({ collection: "operations" as const, id: r.id, data: r.data, deleted: true }))
  )
}

/** «Отменить» удаление: операция и возвраты, удалённые вместе с ней, возвращаются. */
export const restoreOperation = async (ctx: LedgerContext, id: string): Promise<void> => {
  const record = ctx.records.get("operations", id)
  if (!record || !record.deleted) return
  const deletedTogether = ctx.records
    .all("operations")
    .filter((r) => r.deleted && r.data.refundOf === id && r.updatedAt === record.updatedAt)
  await ctx.records.write(
    [record, ...deletedTogether].map((r) => ({ collection: "operations" as const, id: r.id, data: r.data }))
  )
}
