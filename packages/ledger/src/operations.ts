import type { LedgerContext } from "./context"

/** Удаление — тоже правка: запись помечается удалённой (ADR-0001). Вместе с расходом удаляются его возвраты. */
export const deleteOperation = async (ctx: LedgerContext, id: string): Promise<void> => {
  const record = ctx.records.get("operations", id)
  if (!record || record.deleted) return
  const refunds = ctx.records.live("operations").filter((r) => r.data.refundOf === id)
  await ctx.records.write(
    [record, ...refunds].map((r) => ({ collection: "operations" as const, id: r.id, data: r.data, deleted: true }))
  )
}
