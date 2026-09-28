import { describe, expect, it } from "vitest"
import { addDays, addMonths, daysBetween, dayOfMonth, todayIn } from "@fin/domain"

describe("даты", () => {
  it("«сегодня» считается по Москве", () => {
    // 22:30 UTC 27 сентября — в Москве уже 28-е
    expect(todayIn(Date.parse("2026-09-27T22:30:00Z"))).toBe("2026-09-28")
    expect(todayIn(Date.parse("2026-09-27T20:59:00Z"))).toBe("2026-09-27")
  })

  it.each([
    [2026, 2, 31, "2026-02-28"],
    [2028, 2, 31, "2028-02-29"],
    [2026, 4, 31, "2026-04-30"],
    [2026, 1, 31, "2026-01-31"]
  ])("число %i-%i-%i без такого дня → последний день месяца", (y, m, d, expected) => {
    expect(dayOfMonth(y, m, d)).toBe(expected)
  })

  it("арифметика дат через границу года", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(daysBetween("2026-12-20", "2027-01-04")).toBe(15)
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
  })
})
