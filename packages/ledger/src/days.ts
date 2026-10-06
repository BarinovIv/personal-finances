import type { IsoDate } from "@fin/domain"
import type { LedgerContext } from "./context"
import { dayLabel } from "./format"
import type { RecordOf } from "./records"
import type { DayGroup } from "./views"

/** Группирует операции по дням: сначала новые дни, внутри дня — новые операции. */
export const groupByDay = (ctx: LedgerContext, records: ReadonlyArray<RecordOf<"operations">>): Array<DayGroup> => {
  const byDate = new Map<IsoDate, Array<RecordOf<"operations">>>()
  for (const record of records) {
    const list = byDate.get(record.data.date) ?? []
    list.push(record)
    byDate.set(record.data.date, list)
  }
  const today = ctx.today()
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, group]) => {
      group.sort((a, b) => b.data.createdAt - a.data.createdAt)
      const items = group.map((r) => ctx.toView(r))
      let expenseTotal = 0
      let incomeTotal = 0
      for (const op of items) {
        if (op.pending) continue
        if (op.kind === "expense") expenseTotal += op.amount
        if (op.kind === "refund") expenseTotal -= op.amount
        if (op.kind === "income") incomeTotal += op.amount
      }
      return { date, label: dayLabel(date, today), expenseTotal, incomeTotal, items }
    })
}

/** Операции по дням: сначала новые дни, внутри дня — новые операции. */
export const listDays = (ctx: LedgerContext): Array<DayGroup> => groupByDay(ctx, ctx.operations())
