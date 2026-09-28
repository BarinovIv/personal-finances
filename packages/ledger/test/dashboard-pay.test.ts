import { describe, expect, it } from "vitest"
import { add, makeLedger, testClock } from "./support"

const on = (iso: string) => makeLedger({ clock: testClock(`${iso}T12:00:00+03:00`) })

describe("дашборд: зарплатный период", () => {
  it("по умолчанию дни зарплаты 5 и 20: сегодня 28-е → 20–4, день 9 из 15, до зарплаты 7 дней", async () => {
    const { ledger } = await on("2026-09-28")
    expect(ledger.settings().paydays).toEqual([5, 20])
    const d = ledger.dashboard({ mode: "pay", offset: 0 })
    expect(d.period).toMatchObject({ start: "2026-09-20", end: "2026-10-04", label: "20 сентября – 4 октября" })
    expect(d.progress).toBe("День 9 из 15 · до зарплаты 7 дней")
  })

  it("навигация по периодам", async () => {
    const { ledger } = await on("2026-09-28")
    expect(ledger.dashboard({ mode: "pay", offset: -1 }).period).toMatchObject({ start: "2026-09-05", end: "2026-09-19" })
    expect(ledger.dashboard({ mode: "pay", offset: -2 }).period).toMatchObject({ start: "2026-08-20", end: "2026-09-04" })
    expect(ledger.dashboard({ mode: "pay", offset: 1 }).period).toMatchObject({ start: "2026-10-05", end: "2026-10-19" })
    expect(ledger.dashboard({ mode: "pay", offset: -7 }).period).toMatchObject({ start: "2026-06-05", end: "2026-06-19" })
  })

  it("период через границу месяца и года", async () => {
    const { ledger } = await on("2026-12-25")
    expect(ledger.dashboard({ mode: "pay", offset: 0 }).period).toEqual({
      start: "2026-12-20",
      end: "2027-01-04",
      label: "20 декабря 2026 – 4 января 2027"
    })
    expect(ledger.dashboard({ mode: "pay", offset: 1 }).period).toMatchObject({ start: "2027-01-05", end: "2027-01-19" })

    const { ledger: january } = await on("2027-01-02")
    expect(january.dashboard({ mode: "pay", offset: 0 }).period).toMatchObject({ start: "2026-12-20", end: "2027-01-04" })
    expect(january.dashboard({ mode: "pay", offset: 0 }).progress).toBe("День 14 из 16 · до зарплаты 3 дня")
  })

  it("31-е в коротком месяце → последний день месяца", async () => {
    const { ledger } = await on("2026-02-27")
    await ledger.setPaydays([31])
    expect(ledger.dashboard({ mode: "pay", offset: 0 }).period).toMatchObject({ start: "2026-01-31", end: "2026-02-27" })
    expect(ledger.dashboard({ mode: "pay", offset: 1 }).period).toMatchObject({ start: "2026-02-28", end: "2026-03-30" })
    expect(ledger.dashboard({ mode: "pay", offset: 0 }).progress).toBe("День 28 из 28 · до зарплаты 1 день")
  })

  it("сравнение с тем же днём предыдущего периода", async () => {
    const { ledger } = await on("2026-09-28")
    await add(ledger, "кофе 100", { date: "2026-09-05" })
    await add(ledger, "кофе 200", { date: "2026-09-13" })
    await add(ledger, "кофе 400", { date: "2026-09-14" })
    await add(ledger, "кофе 600", { date: "2026-09-21" })
    const d = ledger.dashboard({ mode: "pay", offset: 0 })
    expect(d.comparison).toEqual({ current: 60000, previous: 30000, label: "5–13 сентября", change: 100 })
    expect(d.expenses).toBe(60000)
  })

  it("график по зарплатным периодам", async () => {
    const { ledger } = await on("2026-09-28")
    await add(ledger, "кофе 100", { date: "2026-08-21" })
    await add(ledger, "кофе 300", { date: "2026-09-25" })
    const d = ledger.dashboard({ mode: "pay", offset: 0 })
    expect(d.trend.map((t) => [t.label, t.amount])).toEqual([
      ["5 июл", 0],
      ["20 июл", 0],
      ["5 авг", 0],
      ["20 авг", 10000],
      ["5 сен", 0],
      ["20 сен", 30000]
    ])
  })

  it("дни зарплаты проверяются", async () => {
    const { ledger } = await on("2026-09-28")
    expect(await ledger.setPaydays([])).toEqual({ ok: false })
    expect(await ledger.setPaydays([0])).toEqual({ ok: false })
    expect(await ledger.setPaydays([32])).toEqual({ ok: false })
    expect(await ledger.setPaydays([25, 10, 10])).toEqual({ ok: true })
    expect(ledger.settings().paydays).toEqual([10, 25])
  })

  it("дни зарплаты синхронизируются", async () => {
    const { ledger } = await on("2026-09-28")
    await ledger.setPaydays([10, 25])
    expect(ledger.sync.pending()).toEqual([
      expect.objectContaining({ collection: "settings", id: "settings", data: { paydays: [10, 25] } })
    ])

    const { ledger: other } = await on("2026-09-28")
    await other.sync.receive(ledger.sync.pending(), 1)
    expect(other.dashboard({ mode: "pay", offset: 0 }).period).toMatchObject({ start: "2026-09-25", end: "2026-10-09" })
  })

  it("выбранный режим запоминается", async () => {
    const { ledger, reopen } = await on("2026-09-28")
    expect(ledger.dashboardMode()).toBe("pay")
    await ledger.setDashboardMode("month")
    expect((await reopen()).dashboardMode()).toBe("month")
    // режим — настройка устройства, не синхронизируется
    expect(ledger.sync.pending()).toEqual([])
  })
})
