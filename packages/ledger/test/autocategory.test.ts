import { describe, expect, it } from "vitest"
import { add, categoryId, makeLedger } from "./support"

describe("автокатегоризация", () => {
  it.each([
    ["футболка 1500", "Одежда"],
    ["футболку 1500", "Одежда"],
    ["Футболки 1500", "Одежда"],
    ["футболка для сына 1500", "Одежда"],
    ["шаверма 350", "Кафе"],
    ["шаверму 350", "Кафе"],
    ["такса 500", "Транспорт"],
    ["такси 500", "Транспорт"],
    ["Пятёрочка 1200", "Продукты"],
    ["пятерочка 1200", "Продукты"],
    ["в пятёрочке 1200", "Продукты"],
    ["ВкусВилл 800", "Продукты"],
    ["Яндекс Go 400", "Транспорт"],
    ["яндекс го 400", "Транспорт"],
    ["Яндекс Плюс 399", "Подписки"],
    ["ёлка 3000", "Дом"],
    ["аптека 700", "Здоровье"],
    ["кино 800", "Развлечения"],
    ["+зарплата 150000", "Зарплата"],
    ["+аванс 50000", "Зарплата"],
    ["+кешбэк 350", "Прочие доходы"],
    ["+фриланс 12000", "Подработка"]
  ])("«%s» → %s по словарю", async (line, category) => {
    const { ledger } = await makeLedger()
    expect(ledger.preview(line).categoryId).toBe(categoryId(ledger, category))
  })

  it("незнакомое слово: Enter не сохраняет, а просит выбрать; выбор запоминается", async () => {
    const { ledger } = await makeLedger()
    expect(ledger.preview("тишка 10500").problems).toEqual(["no-category"])
    expect(await ledger.submit("тишка 10500")).toEqual({ ok: false, problems: ["no-category"] })

    await add(ledger, "тишка 10500", { categoryId: categoryId(ledger, "Одежда") })
    expect(ledger.preview("тишка 500")).toMatchObject({ categoryId: categoryId(ledger, "Одежда"), problems: [] })
    const saved = await ledger.submit("тишка 500")
    expect(saved.ok && saved.operation.category.name).toBe("Одежда")
  })

  it("история узнаёт формы слова и отдельные слова", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "тишка 10500", { categoryId: categoryId(ledger, "Одежда") })
    expect(ledger.preview("тишку 500").categoryId).toBe(categoryId(ledger, "Одежда"))
    expect(ledger.preview("тишка для сына 500").categoryId).toBe(categoryId(ledger, "Одежда"))
  })

  it("история важнее словаря", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "кофе в зёрнах 900", { categoryId: categoryId(ledger, "Продукты") })
    expect(ledger.preview("кофе в зернах 900").categoryId).toBe(categoryId(ledger, "Продукты"))
    // по отдельному слову тоже история, а не словарь «кофе → Кафе»
    expect(ledger.preview("кофе 250").categoryId).toBe(categoryId(ledger, "Продукты"))
  })

  it("при противоречии побеждает последний выбор", async () => {
    const { ledger, clock } = await makeLedger()
    await add(ledger, "тишка 10500", { categoryId: categoryId(ledger, "Одежда") })
    clock.advance(60_000)
    await add(ledger, "тишка 2000", { categoryId: categoryId(ledger, "Подарки") })
    expect(ledger.preview("тишка 500").categoryId).toBe(categoryId(ledger, "Подарки"))
  })

  it("подставленную категорию можно сменить", async () => {
    const { ledger } = await makeLedger()
    const op = await add(ledger, "футболка 1500", { categoryId: categoryId(ledger, "Подарки") })
    expect(op.category.name).toBe("Подарки")
    expect(ledger.preview("футболка 700").categoryId).toBe(categoryId(ledger, "Подарки"))
  })

  it("удалил единственную операцию — приложение её забыло", async () => {
    const { ledger } = await makeLedger()
    const op = await add(ledger, "тишка 10500", { categoryId: categoryId(ledger, "Одежда") })
    await ledger.deleteOperation(op.id)
    expect(ledger.preview("тишка 500").problems).toEqual(["no-category"])
  })

  it("категория дохода не подставляется в расход, и наоборот", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "+тишка 5000", { categoryId: categoryId(ledger, "Подработка") })
    expect(ledger.preview("тишка 500").categoryId).toBeNull()
    expect(ledger.preview("+кофе 100").categoryId).toBeNull()
    expect(ledger.preview("зарплата 100").categoryId).toBeNull()
  })

  it("предпросмотр говорит, откуда категория", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "тишка 10500", { categoryId: categoryId(ledger, "Одежда") })
    expect(ledger.preview("тишка 1").categorySource).toBe("history")
    expect(ledger.preview("футболка 1").categorySource).toBe("dictionary")
    expect(ledger.preview("футболка 1", { categoryId: categoryId(ledger, "Подарки") }).categorySource).toBe("manual")
    expect(ledger.preview("абракадабра 1").categorySource).toBeNull()
  })
})
