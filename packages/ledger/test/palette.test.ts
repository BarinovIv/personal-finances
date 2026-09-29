import { describe, expect, it } from "vitest"
import { makeLedger } from "./support"

describe("цвет и иконка категории (ADR-0004)", () => {
  it("новая категория хранит выбранные цвет и иконку", async () => {
    const { ledger } = await makeLedger()
    const result = await ledger.addCategory("expense", "Хобби", { color: "purple", icon: "book" })
    if (!result.ok) throw new Error(result.problem)
    expect(result.category.color).toBe("purple")
    expect(result.category.icon).toBe("book")
  })

  it("без выбора цвет назначается по кругу, а иконка — по умолчанию для вида", async () => {
    const { ledger } = await makeLedger()
    const result = await ledger.addCategory("income", "Хобби-доход")
    if (!result.ok) throw new Error(result.problem)
    expect(result.category.color).toBeTruthy()
    expect(result.category.icon).toBe("wallet")
  })

  it("старый hex при чтении заменяется ближайшим названием из палитры, а не хранится как есть", async () => {
    const { ledger } = await makeLedger()
    await ledger.sync.receive(
      [
        {
          collection: "categories",
          id: "legacy",
          updatedAt: 1,
          deleted: false,
          data: { kind: "expense", name: "Легаси", color: "#2F5B8A" }
        }
      ],
      1
    )
    const legacy = ledger.categories("expense").find((c) => c.name === "Легаси")
    expect(legacy?.color).toBe("blue")
    // старой записи ещё не досталось поля icon — подставляется значение по умолчанию для расхода
    expect(legacy?.icon).toBe("dots")
  })

  it("неизвестный цвет или иконка не ломают чтение категории", async () => {
    const { ledger } = await makeLedger()
    await ledger.sync.receive(
      [
        {
          collection: "categories",
          id: "broken",
          updatedAt: 1,
          deleted: false,
          data: { kind: "income", name: "Странная", color: "not-a-color", icon: "unknown-icon" }
        }
      ],
      1
    )
    const broken = ledger.categories("income").find((c) => c.name === "Странная")
    expect(broken?.color).toBe("gray")
    expect(broken?.icon).toBe("wallet")
  })

  it("правка стиля меняет цвет и/или иконку, не трогая название", async () => {
    const { ledger } = await makeLedger()
    const created = await ledger.addCategory("expense", "Хобби", { color: "red", icon: "star" })
    if (!created.ok) throw new Error()
    expect(await ledger.setCategoryStyle(created.category.id, { color: "teal" })).toEqual({ ok: true })
    const updated = ledger.categories("expense").find((c) => c.id === created.category.id)
    expect(updated).toMatchObject({ name: "Хобби", color: "teal", icon: "star" })
  })
})
