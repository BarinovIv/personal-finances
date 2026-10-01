import { describe, expect, it } from "vitest"
import { add, categoryId, makeLedger } from "./support"

describe("лимиты категорий", () => {
  it("лимит 15 000 в календарном месяце — «из 15 000»; в зарплатном 20.09–04.10 — «из 7 500»", async () => {
    const { ledger } = await makeLedger()
    const cafe = categoryId(ledger, "Кафе")
    expect(await ledger.setCategoryLimit(cafe, 1500000)).toEqual({ ok: true })
    await add(ledger, "кофе 3200")
    expect(ledger.categories("expense").find((c) => c.id === cafe)!.limit).toBe(1500000)
    expect(ledger.dashboard({ mode: "month", offset: 0 }).categories).toMatchObject([
      { name: "Кафе", amount: 320000, limit: 1500000 }
    ])
    expect(ledger.dashboard({ mode: "pay", offset: 0 }).categories).toMatchObject([
      { name: "Кафе", amount: 320000, limit: 750000 }
    ])
  })

  it("категория с лимитом без трат в периоде не видна на дашборде", async () => {
    const { ledger } = await makeLedger()
    const cafe = categoryId(ledger, "Кафе")
    await ledger.setCategoryLimit(cafe, 1500000)
    await add(ledger, "такси 500")
    expect(ledger.dashboard({ mode: "month", offset: 0 }).categories).toMatchObject([
      { name: "Транспорт", amount: 50000, limit: null }
    ])
  })

  it("лимит — часть категории и синхронизируется вместе с ней; переименование и стиль его не теряют", async () => {
    const { ledger, reopen } = await makeLedger()
    const cafe = categoryId(ledger, "Кафе")
    await ledger.setCategoryLimit(cafe, 1500000)
    expect(ledger.sync.pending()).toMatchObject([
      { collection: "categories", id: cafe, data: { kind: "expense", name: "Кафе", limit: 1500000 } }
    ])
    await ledger.renameCategory(cafe, "Кофейни")
    await ledger.setCategoryStyle(cafe, { color: "red" })
    expect((await reopen()).categories("expense").find((c) => c.id === cafe)).toMatchObject({
      name: "Кофейни",
      color: "red",
      limit: 1500000
    })
  })

  it("лимит можно убрать: категория снова без лимита, в записи поля нет", async () => {
    const { ledger } = await makeLedger()
    const cafe = categoryId(ledger, "Кафе")
    await ledger.setCategoryLimit(cafe, 1500000)
    expect(await ledger.setCategoryLimit(cafe, null)).toEqual({ ok: true })
    await add(ledger, "кофе 3200")
    expect(ledger.categories("expense").find((c) => c.id === cafe)!.limit).toBeNull()
    expect(ledger.dashboard({ mode: "month", offset: 0 }).categories[0]!.limit).toBeNull()
    expect(ledger.sync.pending().find((r) => r.id === cafe)!.data).not.toHaveProperty("limit")
  })

  it("категории без лимита — как раньше, в том числе записи с другого устройства без этого поля", async () => {
    const { ledger } = await makeLedger()
    await ledger.sync.receive(
      [{ collection: "categories", id: "hobby", updatedAt: 1, deleted: false, data: { kind: "expense", name: "Хобби", color: "teal" } }],
      1
    )
    await add(ledger, "пряжа 900", { categoryId: "hobby" })
    expect(ledger.categories("expense").find((c) => c.id === "hobby")!.limit).toBeNull()
    expect(ledger.dashboard({ mode: "month", offset: 0 }).categories).toMatchObject([{ name: "Хобби", limit: null }])
  })

  it("у категорий доходов лимита нет; лимит — положительная сумма", async () => {
    const { ledger } = await makeLedger()
    expect(await ledger.setCategoryLimit(categoryId(ledger, "Зарплата"), 1500000)).toEqual({
      ok: false,
      problem: "income"
    })
    expect(await ledger.setCategoryLimit(categoryId(ledger, "Кафе"), 0)).toEqual({ ok: false, problem: "bad-limit" })
    expect(await ledger.setCategoryLimit(categoryId(ledger, "Кафе"), 99.5)).toEqual({ ok: false, problem: "bad-limit" })
    expect(await ledger.setCategoryLimit("unknown", 100000)).toEqual({ ok: false, problem: "not-found" })
    expect(ledger.categories("income").every((c) => c.limit === null)).toBe(true)
  })

  it("возвраты уменьшают использованный лимит в периоде своей даты", async () => {
    const { ledger } = await makeLedger()
    await ledger.setCategoryLimit(categoryId(ledger, "Кафе"), 1500000)
    const dinner = await add(ledger, "ужин 5000", { date: "2026-09-19" })
    await add(ledger, "кофе 3000")
    await ledger.addRefund(dinner.id, { amount: 200000 })
    expect(ledger.dashboard({ mode: "pay", offset: 0 }).categories).toMatchObject([{ amount: 100000, limit: 750000 }])
    expect(ledger.dashboard({ mode: "pay", offset: -1 }).categories).toMatchObject([{ amount: 500000, limit: 750000 }])
  })
})

describe("предупреждения о лимите после сохранения", () => {
  /** Кафе с лимитом 2 000 в месяц: в зарплатном периоде 20.09–04.10 — 1 000. */
  const withCafeLimit = async () => {
    const made = await makeLedger()
    await made.ledger.setCategoryLimit(categoryId(made.ledger, "Кафе"), 200000)
    return made
  }
  /** Текст предупреждений; неразрывные пробелы суммы — обычными. */
  const texts = (list: ReadonlyArray<{ text: string }>) => list.map((w) => w.text.replace(/\s/g, " "))
  const warnings = async (ledger: Awaited<ReturnType<typeof makeLedger>>["ledger"], line: string, date?: string) => {
    const result = await ledger.submit(line, date ? { date } : {})
    if (!result.ok) throw new Error(line)
    return texts(result.warnings)
  }

  it("80% — один раз, операцией, которая перешла порог; сверх лимита — при каждой операции", async () => {
    const { ledger } = await withCafeLimit()
    expect(await warnings(ledger, "кофе 700")).toEqual([])
    expect(await warnings(ledger, "кофе 150")).toEqual(["Кафе: 80% лимита"])
    expect(await warnings(ledger, "кофе 100")).toEqual([])
    expect(await warnings(ledger, "кофе 50")).toEqual([])
    expect(await warnings(ledger, "кофе 1200")).toEqual(["Кафе: лимит превышен на 1 200 ₽"])
    expect(await warnings(ledger, "кофе 100")).toEqual(["Кафе: лимит превышен на 1 300 ₽"])
    expect(await warnings(ledger, "+зарплата 100000")).toEqual([])
  })

  it("без лимита и в других категориях — без предупреждений", async () => {
    const { ledger } = await withCafeLimit()
    expect(await warnings(ledger, "футболка 5000")).toEqual([])
    await ledger.setCategoryLimit(categoryId(ledger, "Кафе"), null)
    expect(await warnings(ledger, "кофе 5000")).toEqual([])
  })

  it("считается по периоду даты операции в выбранном виде дашборда", async () => {
    const { ledger } = await withCafeLimit()
    await add(ledger, "кофе 900", { date: "2026-09-19" })
    expect(await warnings(ledger, "кофе 900")).toEqual(["Кафе: 80% лимита"])
    await ledger.setDashboardMode("month")
    expect(await warnings(ledger, "кофе 300")).toEqual(["Кафе: лимит превышен на 100 ₽"])
  })

  it("строка с несколькими операциями — одно предупреждение на категорию", async () => {
    const { ledger } = await withCafeLimit()
    const result = await ledger.submitEntries("кофе 500 шаурма 700 футболка 300")
    if (!result.ok) throw new Error("не сохранилась")
    expect(texts(result.warnings)).toEqual(["Кафе: лимит превышен на 200 ₽"])
  })

  it("правка операции тоже предупреждает, а уменьшение траты сверх лимита — нет", async () => {
    const { ledger } = await withCafeLimit()
    const coffee = await add(ledger, "кофе 500")
    const edited = await ledger.updateOperation(coffee.id, { amount: 90000 })
    expect(edited.ok && texts(edited.warnings)).toEqual(["Кафе: 80% лимита"])
    const over = await ledger.updateOperation(coffee.id, { amount: 150000 })
    expect(over.ok && texts(over.warnings)).toEqual(["Кафе: лимит превышен на 500 ₽"])
    const less = await ledger.updateOperation(coffee.id, { amount: 120000 })
    expect(less.ok && less.warnings).toEqual([])
  })
})
