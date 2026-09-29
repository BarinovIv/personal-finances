import { dateParts, type IsoDate, type Period, type PeriodMode } from "@fin/domain"
import { MONTHS_GENITIVE, MONTHS_NOMINATIVE, MONTHS_SHORT } from "./format"

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
