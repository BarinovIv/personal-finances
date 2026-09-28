import type { IsoDate } from "@fin/domain"
import type { LedgerContext } from "./context"
import { dayLabel } from "./format"
import type { DayGroup, OperationView } from "./views"

/** Операции по дням: сначала новые дни, внутри дня — новые операции. */
export const listDays = (ctx: LedgerContext): Array<DayGroup> => {
  const byDate = new Map<IsoDate, Array<OperationView>>()
  for (const record of ctx.operations()) {
    const list = byDate.get(record.data.date) ?? []
    list.push(ctx.toView(record))
    byDate.set(record.data.date, list)
  }
  const today = ctx.today()
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, items]) => {
      items.sort((a, b) => b.createdAt - a.createdAt)
      let expenseTotal = 0
      let incomeTotal = 0
      for (const op of items) {
        if (op.kind === "expense") expenseTotal += op.amount
        if (op.kind === "refund") expenseTotal -= op.amount
        if (op.kind === "income") incomeTotal += op.amount
      }
      return { date, label: dayLabel(date, today), expenseTotal, incomeTotal, items }
    })
}
