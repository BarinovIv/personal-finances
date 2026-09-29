import { addDays, dateParts, type IsoDate, type OperationKind } from "@fin/domain"

export const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря"
]

export const MONTHS_NOMINATIVE = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь"
]

export const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]

/** «26 сентября», а для другого года — «30 декабря 2025». */
export const dayMonth = (date: IsoDate, today: IsoDate): string => {
  const { year, month, day } = dateParts(date)
  const base = `${day} ${MONTHS_GENITIVE[month - 1]}`
  return year === dateParts(today).year ? base : `${base} ${year}`
}

/** Вид операции словами, со строчной буквы: для CSV, поиска и подписей в ленте. */
export const OPERATION_KIND_TEXT: Record<OperationKind, string> = {
  expense: "расход",
  income: "доход",
  refund: "возврат",
  saved: "отложено",
  withdrawn: "снято",
  lent: "одолжил",
  borrowed: "занял",
  "repaid-to-me": "мне вернули",
  "repaid-by-me": "я вернул"
}

/** «Сегодня», «Вчера» или дата. */
export const dayLabel = (date: IsoDate, today: IsoDate): string => {
  if (date === today) return "Сегодня"
  if (date === addDays(today, -1)) return "Вчера"
  return dayMonth(date, today)
}
