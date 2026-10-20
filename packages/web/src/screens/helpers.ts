import { dateParts, daysInMonth, periodAt, type IsoDate, type Period } from "@fin/domain"
import type { CsvExportPeriodResult, CsvExportPreset } from "./types"

/** Detect contents rather than relying on the filename; trimStart also removes a UTF-8 BOM. */
export const importFormat = (text: string): "json" | "csv" => {
  const content = text.trimStart()
  return content.startsWith("{") || content.startsWith("[") ? "json" : "csv"
}
const validCsvDate = (date: IsoDate): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const { year, month, day } = dateParts(date)
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

/** Готовые периоды — календарные месяцы относительно сегодняшней даты пользователя. */
export const csvExportPeriod = (preset: CsvExportPreset, today: IsoDate, custom: Period): CsvExportPeriodResult => {
  if (preset === "all-time") return { ok: true, period: undefined }
  if (preset === "custom") {
    if (!validCsvDate(custom.start) || !validCsvDate(custom.end)) return { ok: false, problem: "Укажите обе даты периода." }
    if (custom.start > custom.end) return { ok: false, problem: "Дата начала должна быть не позже даты окончания." }
    return { ok: true, period: custom }
  }
  const current = periodAt("month", today, [])
  if (preset === "current-month") return { ok: true, period: current }
  const previous = periodAt("month", today, [], -1)
  return { ok: true, period: preset === "previous-month" ? previous : { start: previous.start, end: current.end } }
}
