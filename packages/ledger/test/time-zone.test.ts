import { describe, expect, it } from "vitest"
import { add, makeLedger, testClock } from "./support"

describe("часовой пояс пользователя", () => {
  it("смена пояса на стыке суток меняет сегодняшнюю дату новой операции", async () => {
    const clock = testClock("2026-09-30T22:00:00+03:00")
    const { ledger, reopen } = await makeLedger({ clock })
    expect(ledger.settings().timeZone).toBe("Europe/Moscow")
    expect(ledger.today()).toBe("2026-09-30")
    expect(await ledger.setTimeZone("Asia/Novosibirsk")).toEqual({ ok: true })
    expect(ledger.today()).toBe("2026-10-01")
    expect((await add(ledger, "кофе 100")).date).toBe("2026-10-01")
    expect((await reopen()).settings().timeZone).toBe("Asia/Novosibirsk")
  })

  it("месяц, предстоящие списания и дневная сумма используют локальную дату", async () => {
    const { ledger } = await makeLedger({ clock: testClock("2026-09-29T22:00:00+03:00") })
    await add(ledger, "+зарплата 60000", { date: "2026-09-05" })
    await add(ledger, "кофе 100", { date: "2026-09-29" })
    await ledger.addRecurring({ kind: "expense", description: "Интернет", amount: 600000, categoryId: "subscriptions", dayOfMonth: 29 })
    expect(ledger.dashboard({ mode: "month", offset: 0 }).allowance).toEqual({ kind: "daily", free: 5390000, daysLeft: 2, perDay: 2700000, leftToday: 2690000 })

    await ledger.setTimeZone("Asia/Novosibirsk")
    const dashboard = ledger.dashboard({ mode: "month", offset: 0 })
    expect(dashboard.upcoming.total).toBe(0)
    expect(dashboard.allowance).toEqual({ kind: "daily", free: 5990000, daysLeft: 1, perDay: 5990000, leftToday: 5990000 })

    const { ledger: nextMonth } = await makeLedger({ clock: testClock("2026-09-30T22:00:00+03:00") })
    await nextMonth.setTimeZone("Asia/Novosibirsk")
    expect(nextMonth.dashboard({ mode: "month", offset: 0 }).period).toMatchObject({ start: "2026-10-01", end: "2026-10-31" })
  })

  it("изменение дней зарплаты сохраняет пояс, некорректный пояс не сохраняется", async () => {
    const { ledger } = await makeLedger()
    await ledger.setTimeZone("Asia/Novosibirsk")
    await ledger.setPaydays([10, 25])
    expect(await ledger.setTimeZone("Wrong/Zone")).toEqual({ ok: false })
    expect(ledger.settings()).toEqual({ paydays: [10, 25], timeZone: "Asia/Novosibirsk" })
  })

  it("полученная настройка сразу меняет сегодня другого устройства", async () => {
    const clock = testClock("2026-09-30T22:00:00+03:00")
    const { ledger: phone } = await makeLedger({ clock })
    const { ledger: computer } = await makeLedger({ clock })
    await phone.setTimeZone("Asia/Novosibirsk")
    await computer.sync.receive(phone.sync.pending(), 1)
    expect(computer.settings().timeZone).toBe("Asia/Novosibirsk")
    expect(computer.today()).toBe("2026-10-01")
  })
})
