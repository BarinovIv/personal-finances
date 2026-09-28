import { describe, expect, it } from "vitest"
import { add, categoryId, makeLedger, testClock } from "./support"

const september = async () => {
  const { ledger, clock } = await makeLedger()
  const at = (date: string) => ({ date })
  await add(ledger, "пятёрочка 2000", at("2026-09-27"))
  await add(ledger, "вкусвилл 1000", at("2026-09-02"))
  await add(ledger, "кофе 250", at("2026-09-28"))
  await add(ledger, "футболка 1500", at("2026-09-26"))
  await add(ledger, "+зарплата 100000", at("2026-09-05"))
  await add(ledger, "+подработка 12000", at("2026-09-27"))
  // август: 1–28 и после 28-го
  await add(ledger, "пятёрочка 3000", at("2026-08-10"))
  await add(ledger, "кофе 1000", at("2026-08-28"))
  await add(ledger, "такси 5000", at("2026-08-29"))
  // раньше
  await add(ledger, "пятёрочка 7000", at("2026-05-15"))
  await add(ledger, "пятёрочка 9000", at("2026-03-15"))
  return { ledger, clock }
}

describe("дашборд: календарный месяц", () => {
  it("расходы, доходы и разница", async () => {
    const { ledger } = await september()
    const d = ledger.dashboard({ mode: "month", offset: 0 })
    expect(d.period).toMatchObject({ start: "2026-09-01", end: "2026-09-30", label: "Сентябрь 2026" })
    expect(d.progress).toBe("День 28 из 30")
    expect(d.expenses).toBe(475000)
    expect(d.income).toBe(11200000)
    expect(d.balance).toBe(11200000 - 475000)
  })

  it("категории с суммой и долей, по убыванию; доходы в них не входят", async () => {
    const { ledger } = await september()
    const d = ledger.dashboard({ mode: "month", offset: 0 })
    expect(d.categories.map((c) => [c.name, c.amount, Math.round(c.share! * 100)])).toEqual([
      ["Продукты", 300000, 63],
      ["Одежда", 150000, 32],
      ["Кафе", 25000, 5]
    ])
    expect(d.categories[0]!.operations.map((o) => [o.description, o.date])).toEqual([
      ["пятёрочка", "2026-09-27"],
      ["вкусвилл", "2026-09-02"]
    ])
  })

  it("сегодня 28-е → сравнение с 1–28 числами прошлого месяца", async () => {
    const { ledger } = await september()
    const d = ledger.dashboard({ mode: "month", offset: 0 })
    expect(d.comparison).toEqual({
      previous: 400000,
      current: 475000,
      label: "1–28 августа",
      change: 19
    })
  })

  it("если в прошлом месяце нет такого числа, берётся его последний день", async () => {
    const clock = testClock("2026-03-31T12:00:00+03:00")
    const { ledger } = await makeLedger({ clock })
    await add(ledger, "пятёрочка 1000", { date: "2026-02-28" })
    await add(ledger, "пятёрочка 2000", { date: "2026-03-31" })
    const d = ledger.dashboard({ mode: "month", offset: 0 })
    expect(d.comparison).toMatchObject({ previous: 100000, current: 200000, label: "1–28 февраля", change: 100 })
  })

  it("прошлый месяц целиком сравнивается с позапрошлым целиком", async () => {
    const { ledger } = await september()
    const d = ledger.dashboard({ mode: "month", offset: -1 })
    expect(d.period.label).toBe("Август 2026")
    expect(d.isCurrent).toBe(false)
    expect(d.progress).toBe("")
    expect(d.expenses).toBe(900000)
    expect(d.comparison).toMatchObject({ previous: 0, current: 900000, label: "весь июль", change: null })
  })

  it("график расходов за 6 месяцев", async () => {
    const { ledger } = await september()
    const d = ledger.dashboard({ mode: "month", offset: 0 })
    expect(d.trend.map((t) => [t.label, t.amount, t.current])).toEqual([
      ["апр", 0, false],
      ["май", 700000, false],
      ["июн", 0, false],
      ["июл", 0, false],
      ["авг", 900000, false],
      ["сен", 475000, true]
    ])
  })

  it("переключение между месяцами через границу года", async () => {
    const { ledger } = await september()
    expect(ledger.dashboard({ mode: "month", offset: -9 }).period).toMatchObject({
      start: "2025-12-01",
      end: "2025-12-31",
      label: "Декабрь 2025"
    })
    expect(ledger.dashboard({ mode: "month", offset: 4 }).period.label).toBe("Январь 2027")
  })

  it("новая категория и операции без категорий в месяце", async () => {
    const { ledger } = await makeLedger()
    const d = ledger.dashboard({ mode: "month", offset: 0 })
    expect(d.categories).toEqual([])
    expect(d.expenses).toBe(0)
    expect(d.comparison.change).toBeNull()
    expect(categoryId(ledger, "Кафе")).toBe("cafe")
  })
})
