import { formatMoney, limitUsage, periodAt, type IsoDate, type OperationRecord, type Period } from "@fin/domain"
import type { LedgerContext } from "./context"
import { dashboardMode } from "./settings"

export interface LimitWarning {
  /** «near» — операция перешла 80% лимита, «over» — трата сверх лимита. */
  readonly kind: "near" | "over"
  readonly categoryId: string
  /** «Кафе: 80% лимита», «Кафе: лимит превышен на 1 200 ₽». */
  readonly text: string
}

/** 80% лимита: 5 × потрачено ≥ 4 × лимит — без дробей. */
const nearLimit = (spent: number, limit: number) => spent * 5 >= limit * 4

/**
 * Предупреждения после сохранения операций с датами `dates`: `before` — живые операции до сохранения.
 * Лимит считается за период даты операции в выбранном на устройстве виде дашборда.
 * О 80% предупреждает только операция, которая перешла порог; о превышении — каждая, что добавила трату сверх лимита.
 */
export const limitWarnings = (
  ctx: LedgerContext,
  before: ReadonlyArray<OperationRecord>,
  dates: ReadonlyArray<IsoDate>
): Array<LimitWarning> => {
  const mode = dashboardMode(ctx)
  const paydays = ctx.paydays()
  const periods = new Map<string, Period>()
  for (const date of dates) {
    const period = periodAt(mode, date, paydays)
    periods.set(period.start, period)
  }
  const categories = ctx.records.all("categories")
  const warnings: Array<LimitWarning> = []
  for (const period of periods.values()) {
    const was = new Map(limitUsage(categories, before, period).map((u) => [u.categoryId, u.spent]))
    for (const { categoryId, limit, spent } of limitUsage(categories, ctx.operations(), period)) {
      const previous = was.get(categoryId) ?? 0
      if (spent <= previous) continue
      const name = ctx.categoryOf(categoryId, "expense").name
      if (spent > limit) {
        warnings.push({ kind: "over", categoryId, text: `${name}: лимит превышен на ${formatMoney(spent - limit)}` })
      } else if (nearLimit(spent, limit) && !nearLimit(previous, limit)) {
        warnings.push({ kind: "near", categoryId, text: `${name}: 80% лимита` })
      }
    }
  }
  return warnings
}
