import type { CsvExportPreset } from "./types"

export const CSV_EXPORT_PRESETS: ReadonlyArray<{ value: CsvExportPreset; label: string }> = [
  { value: "current-month", label: "Текущий месяц" },
  { value: "previous-month", label: "Прошлый месяц" },
  { value: "two-months", label: "Текущий и прошлый месяцы" },
  { value: "custom", label: "Выбрать даты" },
  { value: "all-time", label: "Всё время" }
]
