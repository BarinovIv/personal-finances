import { describe, expect, it } from "vitest"
import { csvExportPeriod, type CsvExportPreset } from "../index"

describe("период CSV", () => {
  const custom = { start: "2026-09-07", end: "2026-09-22" }
  const presets: ReadonlyArray<{ preset: CsvExportPreset; today: string; start: string; end: string }> = [
    { preset: "current-month", today: "2026-09-28", start: "2026-09-01", end: "2026-09-30" },
    { preset: "previous-month", today: "2026-09-28", start: "2026-08-01", end: "2026-08-31" },
    { preset: "two-months", today: "2026-09-28", start: "2026-08-01", end: "2026-09-30" },
    { preset: "previous-month", today: "2026-01-01", start: "2025-12-01", end: "2025-12-31" },
    { preset: "two-months", today: "2026-01-31", start: "2025-12-01", end: "2026-01-31" },
    { preset: "current-month", today: "2028-02-29", start: "2028-02-01", end: "2028-02-29" }
  ]

  it.each(presets)("$preset от $today использует полные календарные месяцы", ({ preset, today, start, end }) => {
    expect(csvExportPeriod(preset, today, custom)).toEqual({ ok: true, period: { start, end } })
  })

  it("весь период не ограничивает выгрузку даже при незаполненных произвольных датах", () => {
    expect(csvExportPeriod("all-time", "2026-09-28", { start: "", end: "" })).toEqual({ ok: true, period: undefined })
  })

  it("произвольный период сохраняет выбранные даты включительно", () => {
    expect(csvExportPeriod("custom", "2026-09-28", custom)).toEqual({ ok: true, period: { start: "2026-09-07", end: "2026-09-22" } })
  })

  it("период может состоять из одного дня", () => {
    expect(csvExportPeriod("custom", "2026-09-28", { start: "2026-09-07", end: "2026-09-07" })).toEqual({
      ok: true, period: { start: "2026-09-07", end: "2026-09-07" }
    })
  })

  it.each([
    { start: "", end: "2026-09-22" },
    { start: "2026-09-07", end: "" },
    { start: "2026-09-23", end: "2026-09-22" },
    { start: "2026-02-30", end: "2026-03-01" },
    { start: "2026-09-07", end: "2026-13-01" },
    { start: "07.09.2026", end: "2026-09-22" }
  ])("не выгружает некорректный произвольный период $start–$end", (period) => {
    expect(csvExportPeriod("custom", "2026-09-28", period)).toMatchObject({ ok: false })
  })
})
