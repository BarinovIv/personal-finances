import { describe, expect, it } from "vitest"
import { add, categoryId, makeLedger } from "./support"

describe("поиск по ленте", () => {
  it("пустой запрос возвращает всю ленту, сгруппированную по дням", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "футболка 1500")
    await add(ledger, "кофе 250")
    const result = ledger.search("")
    expect(result.count).toBe(2)
    expect(result.total).toBe(150000 + 25000)
    expect(result.days).toHaveLength(1)
  })

  it("находит по подстроке в описании, без учёта регистра", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "футболка 1500")
    await add(ledger, "кофе 250")
    const result = ledger.search("ФУТБОЛ")
    expect(result.count).toBe(1)
    expect(result.days[0]!.items[0]!.description).toBe("футболка")
  })

  it("находит по сумме в рублях, в том числе частичным совпадением", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "футболка 1500")
    await add(ledger, "кофе 250")
    expect(ledger.search("1500").count).toBe(1)
    expect(ledger.search("150").count).toBe(1)
    expect(ledger.search("999").count).toBe(0)
  })

  it("сужает поиск до категории", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "футболка 1500")
    await add(ledger, "куртка 3000", { categoryId: categoryId(ledger, "Одежда") })
    await add(ledger, "кофе 250")
    const result = ledger.search("", [categoryId(ledger, "Одежда")])
    expect(result.count).toBe(2)
    expect(result.total).toBe(150000 + 300000)
  })

  it("ищет сразу в нескольких категориях, пустой список — во всех", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "футболка 1500")
    await add(ledger, "кофе 250")
    await add(ledger, "такси 450")
    const clothes = categoryId(ledger, "Одежда")
    const cafe = categoryId(ledger, "Кафе")
    expect(ledger.search("", [clothes, cafe]).count).toBe(2)
    expect(ledger.search("", [clothes, cafe]).total).toBe(150000 + 25000)
    expect(ledger.search("кофе", [clothes, cafe]).count).toBe(1)
    expect(ledger.search("", []).count).toBe(3)
  })

  it("описание и сумма ищутся вместе", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "футболка 1500")
    const result = ledger.search("футболка 1500")
    expect(result.count).toBe(1)
  })
})
