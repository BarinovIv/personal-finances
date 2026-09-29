import { describe, expect, it } from "vitest"
import { add, categoryId, makeLedger, testClock } from "./support"

/** 29 сентября: зарплатный период 20.09–04.10, до его конца 6 дней, включая сегодня. */
const on29th = () => makeLedger({ clock: testClock("2026-09-29T12:00:00+03:00") })

const current = (ledger: Awaited<ReturnType<typeof on29th>>["ledger"], mode: "pay" | "month" = "pay") =>
  ledger.dashboard({ mode, offset: 0 }).allowance

describe("можно тратить в день", () => {
  it("доходы 60 000, расходы до сегодня 30 000, предстоящие списания 6 000 → на день 4 000; потратил сегодня 1 500 → осталось 2 500", async () => {
    const { ledger } = await on29th()
    await add(ledger, "+зарплата 60000", { date: "2026-09-20" })
    await add(ledger, "продукты 30000", { date: "2026-09-25" })
    const internet = await ledger.addRecurring({
      kind: "expense",
      description: "Интернет",
      amount: 600000,
      categoryId: categoryId(ledger, "Подписки"),
      dayOfMonth: 1
    })
    expect(internet.ok).toBe(true)
    expect(current(ledger)).toEqual({ kind: "daily", free: 2400000, daysLeft: 6, perDay: 400000, leftToday: 400000 })

    await add(ledger, "обед 1500")
    expect(current(ledger)).toEqual({ kind: "daily", free: 2250000, daysLeft: 6, perDay: 400000, leftToday: 250000 })
  })

  it("доход, пришедший сегодня, сразу увеличивает сумму на день", async () => {
    const { ledger } = await on29th()
    await add(ledger, "+зарплата 60000", { date: "2026-09-20" })
    expect(current(ledger)).toMatchObject({ perDay: 1000000 })
    await add(ledger, "+подработка 6000")
    expect(current(ledger)).toMatchObject({ perDay: 1100000, leftToday: 1100000 })
  })

  it("возврат увеличивает свободные деньги в периоде даты возврата", async () => {
    const { ledger } = await on29th()
    await add(ledger, "+зарплата 60000", { date: "2026-09-20" })
    const jacket = await add(ledger, "куртка 12000", { date: "2026-09-10" })
    expect(current(ledger)).toMatchObject({ free: 6000000 })
    await ledger.addRefund(jacket.id, { date: "2026-09-21" })
    expect(current(ledger)).toMatchObject({ free: 7200000, perDay: 1200000 })
    expect(ledger.dashboard({ mode: "pay", offset: -1 }).expenses).toBe(1200000)
  })

  it("свободных денег нет — перерасход с суммой", async () => {
    const { ledger } = await on29th()
    await add(ledger, "+зарплата 20000", { date: "2026-09-20" })
    await add(ledger, "телефон 23000", { date: "2026-09-22" })
    expect(current(ledger)).toEqual({ kind: "overspent", free: -300000, daysLeft: 6, overspent: 300000 })
  })

  it("«сегодня осталось» уходит в минус — превышение за сегодня", async () => {
    const { ledger } = await on29th()
    await add(ledger, "+зарплата 60000", { date: "2026-09-20" })
    await add(ledger, "наушники 15000")
    expect(current(ledger)).toMatchObject({ kind: "daily", perDay: 1000000, leftToday: -500000 })
  })

  it("в календарном месяце — до конца месяца", async () => {
    const { ledger } = await on29th()
    await add(ledger, "+зарплата 60000", { date: "2026-09-05" })
    expect(current(ledger, "month")).toMatchObject({ daysLeft: 2, perDay: 3000000 })
  })

  it("для прошлых периодов цифр нет", async () => {
    const { ledger } = await on29th()
    await add(ledger, "+зарплата 60000", { date: "2026-09-05" })
    expect(ledger.dashboard({ mode: "pay", offset: -1 }).allowance).toBeNull()
    expect(ledger.dashboard({ mode: "month", offset: -1 }).allowance).toBeNull()
  })
})
