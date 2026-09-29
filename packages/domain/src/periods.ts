import {
  addDays,
  addMonths,
  dayOfMonth,
  daysBetween,
  monthEnd,
  monthStart,
  yearMonthOf,
  type IsoDate
} from "./dates"
import type { SettingsRecord } from "./records"

/** Вид периода: календарный месяц или зарплатный период. */
export type PeriodMode = "month" | "pay"

export interface Period {
  readonly start: IsoDate
  /** Включительно. */
  readonly end: IsoDate
}

export const DEFAULT_PAYDAYS: ReadonlyArray<number> = [5, 20]

/** Дни зарплаты из настроек, по возрастанию; без настроек — 5 и 20. */
export const paydaysOf = (settings: SettingsRecord | undefined): ReadonlyArray<number> => {
  const days = settings && !settings.deleted ? settings.data.paydays : []
  return days.length > 0 ? [...days].sort((a, b) => a - b) : DEFAULT_PAYDAYS
}

/** Календарный месяц, сдвинутый на `offset` месяцев от месяца `today`. */
const monthPeriod = (today: IsoDate, offset: number): Period => {
  const ym = addMonths(yearMonthOf(today), offset)
  return { start: monthStart(ym), end: monthEnd(ym) }
}

/** Начала зарплатных периодов в `months` месяцах от `from`: дни зарплаты, 31-е в коротком месяце — последний день. */
const payStarts = (paydays: ReadonlyArray<number>, from: IsoDate, months: number): Array<IsoDate> => {
  const days = [...new Set(paydays)].sort((a, b) => a - b)
  const out = new Set<IsoDate>()
  for (let i = 0; i < months; i++) {
    const { year, month } = addMonths(yearMonthOf(from), i)
    for (const day of days) out.add(dayOfMonth(year, month, day))
  }
  return [...out].sort()
}

/**
 * Зарплатный период от дня зарплаты до дня накануне следующего, сдвинутый на `offset` периодов.
 * Дни зарплаты — числа месяца, не зависят от реальных поступлений.
 */
const payPeriod = (today: IsoDate, paydays: ReadonlyArray<number>, offset: number): Period => {
  if (paydays.length === 0) return monthPeriod(today, offset)
  const perMonth = new Set(paydays).size
  const reach = Math.ceil((Math.abs(offset) + 2) / perMonth) + 1
  const from = monthStart(addMonths(yearMonthOf(today), -reach))
  const starts = payStarts(paydays, from, reach * 2 + 1)
  let index = -1
  for (let i = 0; i < starts.length; i++) if (starts[i]! <= today) index = i
  const start = starts[index + offset]!
  const next = starts[index + offset + 1]!
  return { start, end: addDays(next, -1) }
}

/**
 * Период вида `mode`, в котором лежит `today`, сдвинутый на `offset` периодов:
 * 0 — текущий, −1 — предыдущий и т. д. Без дней зарплаты зарплатный период — календарный месяц.
 */
export const periodAt = (mode: PeriodMode, today: IsoDate, paydays: ReadonlyArray<number>, offset = 0): Period =>
  mode === "month" ? monthPeriod(today, offset) : payPeriod(today, paydays, offset)

export const inPeriod = (period: Period, date: IsoDate): boolean => date >= period.start && date <= period.end

/** Длина периода в днях, включая оба конца. */
export const periodLength = (period: Period): number => daysBetween(period.start, period.end) + 1
