import { dateParts, daysInMonth } from "./dates"
import { periodLength, type Period } from "./periods"
import type { CategoryData, CategoryRecord, OperationRecord } from "./records"
import { periodTotals } from "./totals"

export interface LimitUsage {
  readonly categoryId: string
  /** Лимит на период (см. `periodLimit`), копейки. */
  readonly limit: number
  /** Расходы минус возвраты за период, копейки. Может уйти в минус. */
  readonly spent: number
}

/** Лимит категории в месяц, если он есть: только у категорий расходов. */
export const monthlyLimit = (category: CategoryData): number | null =>
  category.kind === "expense" && category.limit !== undefined && category.limit > 0 ? category.limit : null

/**
 * Лимит на период. Отдельных лимитов для двух видов периода нет: лимит в месяц умножается на долю
 * дней периода от дней месяца, в котором период начинается, и округляется до рубля.
 * Календарному месяцу достаётся весь лимит.
 */
export const periodLimit = (monthly: number, period: Period): number => {
  const { year, month } = dateParts(period.start)
  const days = periodLength(period)
  const monthDays = daysInMonth(year, month)
  return days === monthDays ? monthly : Math.round((monthly * days) / monthDays / 100) * 100
}

/**
 * Использованный лимит за период — по живым категориям расходов с лимитом, в порядке `categories`.
 * `categories` — записи категорий как есть (удалённые и без лимита пропускаются); `operations` — живые
 * операции (см. `liveOperations`): возврат уменьшает потраченное в периоде своей даты, как в `periodTotals`.
 */
export const limitUsage = (
  categories: ReadonlyArray<CategoryRecord>,
  operations: ReadonlyArray<OperationRecord>,
  period: Period
): Array<LimitUsage> => {
  const spent = new Map(periodTotals(operations, period).categories.map((c) => [c.categoryId, c.amount]))
  const out: Array<LimitUsage> = []
  for (const record of categories) {
    const monthly = record.deleted ? null : monthlyLimit(record.data)
    if (monthly === null) continue
    out.push({ categoryId: record.id, limit: periodLimit(monthly, period), spent: spent.get(record.id) ?? 0 })
  }
  return out
}
