import "fake-indexeddb/auto"
import { describe, expect, it } from "vitest"
import { indexedDbStore } from "@fin/ledger"
import { add, categoryId, makeLedger } from "./support"

describe("ввод операции строкой", () => {
  it("стартовые наборы категорий расходов и доходов", async () => {
    const { ledger } = await makeLedger()
    expect(ledger.categories("expense").map((c) => c.name)).toEqual([
      "Продукты",
      "Кафе",
      "Транспорт",
      "Одежда",
      "Дом",
      "Здоровье",
      "Развлечения",
      "Подписки",
      "Подарки",
      "Прочее"
    ])
    expect(ledger.categories("income").map((c) => c.name)).toEqual(["Зарплата", "Подработка", "Прочие доходы"])
  })

  it("предпросмотр показывает, что распознано", async () => {
    const { ledger } = await makeLedger()
    expect(ledger.preview("вчера такси 450", { categoryId: categoryId(ledger, "Транспорт") })).toMatchObject({
      kind: "expense",
      amount: 45000,
      description: "такси",
      date: "2026-09-27",
      categoryId: categoryId(ledger, "Транспорт"),
      problems: []
    })
    expect(ledger.preview("+подработка 12000", { categoryId: categoryId(ledger, "Подработка") })).toMatchObject({
      kind: "income",
      amount: 1200000,
      date: "2026-09-28"
    })
  })

  it("сохраняет расход и доход, список по дням с итогом дня по расходам", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "кофе 250", { categoryId: categoryId(ledger, "Кафе") })
    await add(ledger, "+подработка 12000", { categoryId: categoryId(ledger, "Подработка") })
    await add(ledger, "молоко 99,90", { categoryId: categoryId(ledger, "Продукты") })
    await add(ledger, "вчера такси 450", { categoryId: categoryId(ledger, "Транспорт") })
    await add(ledger, "футболка 1500", { categoryId: categoryId(ledger, "Одежда"), date: "2026-09-26" })

    const days = ledger.days()
    expect(days.map((d) => [d.label, d.expenseTotal])).toEqual([
      ["Сегодня", 34990],
      ["Вчера", 45000],
      ["26 сентября", 150000]
    ])
    // внутри дня — сначала новые
    expect(days[0]!.items.map((o) => [o.kind, o.description, o.amount, o.category.name])).toEqual([
      ["expense", "молоко", 9990, "Продукты"],
      ["income", "подработка", 1200000, "Подработка"],
      ["expense", "кофе", 25000, "Кафе"]
    ])
  })

  it("дата прошлого года подписывается с годом", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "ёлка 3000", { categoryId: categoryId(ledger, "Дом"), date: "2025-12-30" })
    expect(ledger.days()[0]!.label).toBe("30 декабря 2025")
  })

  it("без суммы, описания или категории операция не сохраняется, и понятно почему", async () => {
    const { ledger } = await makeLedger()
    expect(await ledger.submit("футболка", { categoryId: categoryId(ledger, "Одежда") })).toEqual({
      ok: false,
      problems: ["no-amount"]
    })
    expect(await ledger.submit("1500", { categoryId: categoryId(ledger, "Одежда") })).toEqual({
      ok: false,
      problems: ["no-description"]
    })
    expect(await ledger.submit("непонятное 1500")).toEqual({ ok: false, problems: ["no-category"] })
    expect(ledger.days()).toEqual([])
  })

  it("категория другого вида не подходит", async () => {
    const { ledger } = await makeLedger()
    expect(ledger.preview("+премия 5000", { categoryId: categoryId(ledger, "Кафе") }).problems).toEqual(["no-category"])
  })

  it("у операции есть время последней правки и признак удаления", async () => {
    const { ledger } = await makeLedger()
    const op = await add(ledger, "кофе 250", { categoryId: categoryId(ledger, "Кафе") })
    expect(ledger.pendingChanges()).toEqual([
      expect.objectContaining({
        collection: "operations",
        id: op.id,
        updatedAt: Date.parse("2026-09-28T12:00:00+03:00"),
        deleted: false
      })
    ])
  })

  it("данные переживают перезагрузку", async () => {
    const { ledger, reopen } = await makeLedger()
    await add(ledger, "кофе 250", { categoryId: categoryId(ledger, "Кафе") })
    const again = await reopen()
    expect(again.days()[0]!.items.map((o) => o.description)).toEqual(["кофе"])
  })

  it("данные переживают перезагрузку в IndexedDB", async () => {
    const name = `ledger-${Math.random()}`
    const { ledger } = await makeLedger({ store: indexedDbStore(name) })
    await add(ledger, "кофе 250", { categoryId: categoryId(ledger, "Кафе") })
    await add(ledger, "+подработка 12000", { categoryId: categoryId(ledger, "Подработка") })
    const { ledger: again } = await makeLedger({ store: indexedDbStore(name) })
    expect(again.days()[0]!.items.map((o) => o.description)).toEqual(["подработка", "кофе"])
    expect(again.pendingChanges()).toHaveLength(2)
  })
})
