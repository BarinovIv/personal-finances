import {
  addMonths,
  dayOfMonth,
  monthKey,
  yearMonthOf,
  type IsoDate,
  type YearMonth
} from "./dates"
import type { RecurringData } from "./records"

/**
 * Идентификатор операции, созданной по регулярной операции: шаблон + месяц (ADR-0002).
 * Повторная генерация даёт тот же id и ничего не задваивает.
 */
export const recurringOperationId = (templateId: string, month: YearMonth) => `rec:${templateId}:${monthKey(month)}`

export interface Occurrence {
  readonly month: YearMonth
  readonly date: IsoDate
}

/** Дата регулярной операции в месяце: 31-е в феврале — последний день месяца. */
export const occurrenceIn = (template: Pick<RecurringData, "dayOfMonth">, month: YearMonth): Occurrence => ({
  month,
  date: dayOfMonth(month.year, month.month, template.dayOfMonth)
})

/** Все даты шаблона в отрезке [from, to], не раньше его начала. */
export const occurrencesBetween = (
  template: Pick<RecurringData, "dayOfMonth" | "startDate">,
  from: IsoDate,
  to: IsoDate
): Array<Occurrence> => {
  const out: Array<Occurrence> = []
  const lower = from > template.startDate ? from : template.startDate
  if (lower > to) return out
  let month = yearMonthOf(lower)
  const last = yearMonthOf(to)
  while (month.year * 12 + month.month <= last.year * 12 + last.month) {
    const occurrence = occurrenceIn(template, month)
    if (occurrence.date >= lower && occurrence.date <= to) out.push(occurrence)
    month = addMonths(month, 1)
  }
  return out
}
