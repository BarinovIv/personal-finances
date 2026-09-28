import {
  addDays,
  addMonths,
  dateParts,
  dayOfMonth,
  daysBetween,
  monthEnd,
  monthStart,
  yearMonthOf,
  type IsoDate
} from "@fin/domain"
import { MONTHS_GENITIVE, MONTHS_NOMINATIVE, MONTHS_SHORT } from "./format"

export type PeriodMode = "month" | "pay"

export interface Period {
  readonly start: IsoDate
  /** Включительно. */
  readonly end: IsoDate
}

/** Календарный месяц, сдвинутый на `offset` месяцев от месяца `today`. */
export const monthPeriod = (today: IsoDate, offset: number): Period => {
  const ym = addMonths(yearMonthOf(today), offset)
  return { start: monthStart(ym), end: monthEnd(ym) }
}

/** Начала зарплатных периодов в месяцах [from, to]: дни зарплаты, 31-е в коротком месяце — последний день. */
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
export const payPeriod = (today: IsoDate, paydays: ReadonlyArray<number>, offset: number): Period => {
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

export const shiftPeriod = (mode: PeriodMode, today: IsoDate, paydays: ReadonlyArray<number>, offset: number) =>
  mode === "month" ? monthPeriod(today, offset) : payPeriod(today, paydays, offset)

export const contains = (period: Period, date: IsoDate) => date >= period.start && date <= period.end

export const periodLength = (period: Period) => daysBetween(period.start, period.end) + 1

/** «Сентябрь 2026» или «20 сентября – 4 октября». */
export const periodLabel = (mode: PeriodMode, period: Period, today: IsoDate): string => {
  const s = dateParts(period.start)
  if (mode === "month") return `${MONTHS_NOMINATIVE[s.month - 1]} ${s.year}`
  const e = dateParts(period.end)
  const thisYear = dateParts(today).year
  const withYear = s.year !== e.year || s.year !== thisYear
  const part = (p: { day: number; month: number; year: number }) =>
    `${p.day} ${MONTHS_GENITIVE[p.month - 1]}${withYear ? ` ${p.year}` : ""}`
  return `${part(s)} – ${part(e)}`
}

/** Подпись столбика на графике: «сен» или «20 сен». */
export const trendLabel = (mode: PeriodMode, period: Period): string => {
  const s = dateParts(period.start)
  return mode === "month" ? MONTHS_SHORT[s.month - 1]! : `${s.day} ${MONTHS_SHORT[s.month - 1]}`
}

/** «1–28 августа», «20 августа – 3 сентября»; целый месяц — «весь август». */
export const rangeLabel = (mode: PeriodMode, range: Period, whole: boolean): string => {
  const s = dateParts(range.start)
  const e = dateParts(range.end)
  if (whole && mode === "month") return `весь ${MONTHS_NOMINATIVE[s.month - 1]!.toLowerCase()}`
  if (s.month === e.month && s.year === e.year) {
    return s.day === e.day ? `${s.day} ${MONTHS_GENITIVE[s.month - 1]}` : `${s.day}–${e.day} ${MONTHS_GENITIVE[s.month - 1]}`
  }
  return `${s.day} ${MONTHS_GENITIVE[s.month - 1]} – ${e.day} ${MONTHS_GENITIVE[e.month - 1]}`
}
