import { describe, expect, it } from "vitest"
import { add, categoryId, makeLedger } from "./support"

describe("свои категории", () => {
  it("порядок категорий меняется и сохраняется после правки", async () => {
    const { ledger } = await makeLedger()
    const before = ledger.categories("expense")
    const ids = before.map((category) => category.id)
    const reordered = [ids.at(-1)!, ...ids.slice(0, -1)]

    await ledger.reorderCategories(reordered)
    expect(ledger.categories("expense").map((category) => category.id)).toEqual(reordered)

    await ledger.renameCategory(reordered[0]!, "Последняя стала первой")
    expect(ledger.categories("expense").map((category) => category.id)).toEqual(reordered)
  })

  it("порядок категорий синхронизируется", async () => {
    const { ledger } = await makeLedger()
    const reordered = ledger.categories("income").map((category) => category.id).reverse()
    await ledger.reorderCategories(reordered)

    const { ledger: other } = await makeLedger()
    await other.sync.receive(ledger.sync.pending(), 2)
    expect(other.categories("income").map((category) => category.id)).toEqual(reordered)
  })

  it("новая категория доступна при выборе и на дашборде", async () => {
    const { ledger } = await makeLedger()
    const result = await ledger.addCategory("expense", "  Хобби ")
    if (!result.ok) throw new Error(result.problem)
    expect(result.category).toMatchObject({ kind: "expense", name: "Хобби" })
    expect(ledger.categories("expense").map((c) => c.name)).toContain("Хобби")
    expect(ledger.categories("income").map((c) => c.name)).not.toContain("Хобби")

    await add(ledger, "пряжа 900", { categoryId: result.category.id })
    expect(ledger.dashboard({ mode: "month", offset: 0 }).categories).toMatchObject([{ name: "Хобби", amount: 90000 }])
  })

  it("имя не пустое и не повторяется внутри вида", async () => {
    const { ledger } = await makeLedger()
    expect(await ledger.addCategory("expense", " ")).toEqual({ ok: false, problem: "empty-name" })
    expect(await ledger.addCategory("expense", "кафе")).toEqual({ ok: false, problem: "duplicate" })
    expect(await ledger.addCategory("income", "Кафе")).toMatchObject({ ok: true })
  })

  it("переименование меняет название везде, операции не затрагивает", async () => {
    const { ledger } = await makeLedger()
    const op = await add(ledger, "кофе 250")
    await ledger.sync.acknowledge(ledger.sync.pending())
    expect(await ledger.renameCategory(categoryId(ledger, "Кафе"), "Кофейни")).toEqual({ ok: true })
    expect(ledger.operation(op.id)!.category?.name).toBe("Кофейни")
    expect(ledger.dashboard({ mode: "month", offset: 0 }).categories[0]!.name).toBe("Кофейни")
    expect(ledger.sync.pending().map((r) => r.collection)).toEqual(["categories"])
    expect(await ledger.renameCategory(categoryId(ledger, "Кофейни"), "Продукты")).toEqual({
      ok: false,
      problem: "duplicate"
    })
  })

  it("пустая категория удаляется сразу", async () => {
    const { ledger } = await makeLedger()
    expect(ledger.categoryUsage(categoryId(ledger, "Подарки"))).toBe(0)
    expect(await ledger.deleteCategory(categoryId(ledger, "Подарки"))).toMatchObject({ ok: true })
    expect(ledger.categories("expense").map((c) => c.name)).not.toContain("Подарки")
  })

  it("непустую категорию без переноса удалить нельзя", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "футболка 1500")
    expect(ledger.categoryUsage(categoryId(ledger, "Одежда"))).toBe(1)
    expect(await ledger.deleteCategory(categoryId(ledger, "Одежда"))).toEqual({ ok: false, problem: "needs-target" })
    expect(await ledger.deleteCategory(categoryId(ledger, "Одежда"), { moveTo: categoryId(ledger, "Зарплата") })).toEqual({
      ok: false,
      problem: "bad-target"
    })
  })

  it("удаление с переносом: операции и подстановка переходят в выбранную категорию", async () => {
    const { ledger, clock } = await makeLedger()
    const hobby = await ledger.addCategory("expense", "Гардероб")
    if (!hobby.ok) throw new Error()
    const tishka = await add(ledger, "тишка 10500", { categoryId: categoryId(ledger, "Одежда") })
    const jeans = await add(ledger, "джинсы 4000")
    await ledger.addRefund(jeans.id, { amount: 100000 })
    clock.advance(1000)

    expect(await ledger.deleteCategory(categoryId(ledger, "Одежда"), { moveTo: hobby.category.id })).toMatchObject({ ok: true })
    expect(ledger.operation(tishka.id)!.category?.name).toBe("Гардероб")
    expect(ledger.preview("тишка 500").categoryId).toBe(hobby.category.id)
    expect(ledger.dashboard({ mode: "month", offset: 0 }).categories).toMatchObject([
      { name: "Гардероб", amount: 1050000 + 400000 - 100000 }
    ])
    expect(ledger.categories("expense").map((c) => c.name)).not.toContain("Одежда")
  })

  it("удаление стартовой категории с переносом можно отменить", async () => {
    const { ledger } = await makeLedger()
    const clothes = categoryId(ledger, "Одежда")
    const gifts = categoryId(ledger, "Подарки")
    const operation = await add(ledger, "футболка 1500")

    const result = await ledger.deleteCategory(clothes, { moveTo: gifts })
    if (!result.ok) throw new Error(result.problem)
    expect(ledger.operation(operation.id)?.category?.id).toBe(gifts)

    expect(await result.undo()).toEqual({ ok: true })
    expect(ledger.categories("expense").map((category) => category.id)).toContain(clothes)
    expect(ledger.operation(operation.id)?.category?.id).toBe(clothes)
  })

  it("категории синхронизируются", async () => {
    const { ledger } = await makeLedger()
    const created = await ledger.addCategory("expense", "Хобби")
    await ledger.deleteCategory(categoryId(ledger, "Подарки"))
    const { ledger: other } = await makeLedger()
    await other.sync.receive(ledger.sync.pending(), 2)
    expect(other.categories("expense").map((c) => c.name)).toContain("Хобби")
    expect(other.categories("expense").map((c) => c.name)).not.toContain("Подарки")
    expect(created.ok && other.categories("expense").find((c) => c.name === "Хобби")!.id).toBe(
      created.ok && created.category.id
    )
  })

  it("последнюю категорию вида удалить нельзя", async () => {
    const { ledger } = await makeLedger()
    await ledger.deleteCategory(categoryId(ledger, "Подработка"))
    await ledger.deleteCategory(categoryId(ledger, "Прочие доходы"))
    expect(await ledger.deleteCategory(categoryId(ledger, "Зарплата"))).toEqual({ ok: false, problem: "last-category" })
  })
})
