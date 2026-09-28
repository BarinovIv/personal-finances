/** Дата без времени в формате `YYYY-MM-DD`. */
export type IsoDate = string

/** Все даты приложения считаются по московскому времени. */
export const APP_TIME_ZONE = "Europe/Moscow"

const pad = (n: number, width = 2) => String(n).padStart(width, "0")

export const isoDate = (year: number, month: number, day: number): IsoDate =>
  `${pad(year, 4)}-${pad(month)}-${pad(day)}`

export interface DateParts {
  readonly year: number
  /** 1–12 */
  readonly month: number
  readonly day: number
}

export const dateParts = (date: IsoDate): DateParts => {
  const [y, m, d] = date.split("-").map(Number)
  return { year: y!, month: m!, day: d! }
}

const toUtc = (date: IsoDate) => {
  const { year, month, day } = dateParts(date)
  return Date.UTC(year, month - 1, day)
}

const fromUtc = (ms: number): IsoDate => {
  const d = new Date(ms)
  return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Календарная дата момента `now` в часовом поясе `timeZone`. */
export const todayIn = (now: number, timeZone: string = APP_TIME_ZONE): IsoDate => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(now))
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  return isoDate(get("year"), get("month"), get("day"))
}

export const addDays = (date: IsoDate, days: number): IsoDate => fromUtc(toUtc(date) + days * DAY_MS)

/** Сколько дней от `from` до `to` (`to - from`). */
export const daysBetween = (from: IsoDate, to: IsoDate): number => Math.round((toUtc(to) - toUtc(from)) / DAY_MS)

export const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** Число месяца, которого может не быть (31 февраля), превращается в последний день месяца. */
export const dayOfMonth = (year: number, month: number, day: number): IsoDate =>
  isoDate(year, month, Math.min(day, daysInMonth(year, month)))

export interface YearMonth {
  readonly year: number
  /** 1–12 */
  readonly month: number
}

export const addMonths = ({ year, month }: YearMonth, months: number): YearMonth => {
  const index = year * 12 + (month - 1) + months
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export const yearMonthOf = (date: IsoDate): YearMonth => {
  const { year, month } = dateParts(date)
  return { year, month }
}

export const monthKey = ({ year, month }: YearMonth): string => `${pad(year, 4)}-${pad(month)}`

export const monthStart = ({ year, month }: YearMonth): IsoDate => isoDate(year, month, 1)

export const monthEnd = ({ year, month }: YearMonth): IsoDate => isoDate(year, month, daysInMonth(year, month))
