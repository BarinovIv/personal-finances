import { describe, expect, it } from "vitest"
import { inPeriod, paydaysOf, periodAt, periodLength, SETTINGS_ID, type SettingsRecord } from "@fin/domain"

describe("периоды: календарный месяц", () => {
  it("с 1-го по последнее число месяца, сдвиг — на целые месяцы", () => {
    expect(periodAt("month", "2026-09-28", [5, 20])).toEqual({ start: "2026-09-01", end: "2026-09-30" })
    expect(periodAt("month", "2026-09-28", [5, 20], -1)).toEqual({ start: "2026-08-01", end: "2026-08-31" })
    expect(periodAt("month", "2026-12-31", [5, 20], 2)).toEqual({ start: "2027-02-01", end: "2027-02-28" })
  })
})

describe("периоды: зарплатный период", () => {
  it("от дня зарплаты до дня накануне следующего: при 5 и 20 это 5–19 и 20–4", () => {
    expect(periodAt("pay", "2026-09-28", [5, 20])).toEqual({ start: "2026-09-20", end: "2026-10-04" })
    expect(periodAt("pay", "2026-10-04", [5, 20])).toEqual({ start: "2026-09-20", end: "2026-10-04" })
    expect(periodAt("pay", "2026-10-05", [5, 20])).toEqual({ start: "2026-10-05", end: "2026-10-19" })
  })

  it("сдвиг — на целые зарплатные периоды, в том числе через границу года", () => {
    expect(periodAt("pay", "2026-09-28", [5, 20], -1)).toEqual({ start: "2026-09-05", end: "2026-09-19" })
    expect(periodAt("pay", "2026-09-28", [5, 20], -7)).toEqual({ start: "2026-06-05", end: "2026-06-19" })
    expect(periodAt("pay", "2026-12-25", [5, 20], 1)).toEqual({ start: "2027-01-05", end: "2027-01-19" })
    expect(periodAt("pay", "2027-01-02", [5, 20])).toEqual({ start: "2026-12-20", end: "2027-01-04" })
  })

  it("31-е в коротком месяце — последний день месяца", () => {
    expect(periodAt("pay", "2026-02-27", [31])).toEqual({ start: "2026-01-31", end: "2026-02-27" })
    expect(periodAt("pay", "2026-02-27", [31], 1)).toEqual({ start: "2026-02-28", end: "2026-03-30" })
  })

  it("без дней зарплаты — календарный месяц", () => {
    expect(periodAt("pay", "2026-09-28", [])).toEqual({ start: "2026-09-01", end: "2026-09-30" })
  })
})

describe("границы периода", () => {
  const period = { start: "2026-09-20", end: "2026-10-04" }

  it("оба конца входят в период", () => {
    expect(inPeriod(period, "2026-09-20")).toBe(true)
    expect(inPeriod(period, "2026-10-04")).toBe(true)
    expect(inPeriod(period, "2026-09-19")).toBe(false)
    expect(inPeriod(period, "2026-10-05")).toBe(false)
  })

  it("длина — в днях, включая оба конца", () => {
    expect(periodLength(period)).toBe(15)
    expect(periodLength({ start: "2026-09-28", end: "2026-09-28" })).toBe(1)
  })
})

describe("дни зарплаты из настроек", () => {
  const settings = (paydays: Array<number>, deleted = false): SettingsRecord => ({
    collection: "settings",
    id: SETTINGS_ID,
    updatedAt: 1,
    deleted,
    data: { paydays }
  })

  it("по возрастанию", () => {
    expect(paydaysOf(settings([25, 10]))).toEqual([10, 25])
  })

  it("без настроек, с пустыми или удалёнными — 5 и 20", () => {
    expect(paydaysOf(undefined)).toEqual([5, 20])
    expect(paydaysOf(settings([]))).toEqual([5, 20])
    expect(paydaysOf(settings([10], true))).toEqual([5, 20])
  })
})
