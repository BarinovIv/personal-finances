import { describe, expect, it } from "vitest"
import { CATEGORY_ICONS, isCategoryEmoji } from "@fin/ledger"
import { categoryId, makeLedger } from "./support"

describe("эмодзи категорий", () => {
  it.each(["🐶", "👨‍👩‍👧‍👦", "👍🏽", "🇷🇺", "1️⃣", "#️⃣", "*️⃣", "❤️", "❤", "🏳️‍🌈", "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}"])(
    "сохраняет один эмодзи %s без изменения строки",
    async (icon) => {
      expect(isCategoryEmoji(icon)).toBe(true)
      const { ledger } = await makeLedger()
      const created = await ledger.addCategory("expense", "Хобби", { icon })
      if (!created.ok) throw new Error(created.problem)
      expect(created.category.icon).toBe(icon)
      expect(ledger.categories("expense").find((category) => category.id === created.category.id)?.icon).toBe(icon)
    }
  )

  it("эмодзи сохраняется после переименования, лимита, цвета, порядка, синхронизации и перезагрузки", async () => {
    const { ledger, reopen } = await makeLedger()
    const created = await ledger.addCategory("expense", "Хобби", { icon: "🐶" })
    if (!created.ok) throw new Error(created.problem)
    await ledger.setCategoryStyle(created.category.id, { icon: "👨‍👩‍👧‍👦" })
    await ledger.renameCategory(created.category.id, "Семья")
    await ledger.setCategoryLimit(created.category.id, 100000)
    await ledger.setCategoryStyle(created.category.id, { color: "purple" })
    const reordered = ledger.categories("expense").map((category) => category.id).reverse()
    await ledger.reorderCategories(reordered)

    const reloaded = await reopen()
    const { ledger: other, reopen: reopenOther } = await makeLedger()
    await other.sync.receive(reloaded.sync.pending(), 2)
    const otherReloaded = await reopenOther()
    for (const journal of [ledger, reloaded, other, otherReloaded]) {
      expect(journal.categories("expense").map((category) => category.id)).toEqual(reordered)
      expect(journal.categories("expense").find((category) => category.id === created.category.id)).toMatchObject({
        name: "Семья", icon: "👨‍👩‍👧‍👦", limit: 100000, color: "purple"
      })
    }
  })

  it("встроенная иконка меняется на эмодзи и обратно", async () => {
    const { ledger, reopen } = await makeLedger()
    const id = categoryId(ledger, "Кафе")
    await ledger.setCategoryStyle(id, { icon: "☕" })
    expect(ledger.categories("expense").find((category) => category.id === id)?.icon).toBe("☕")
    await ledger.setCategoryStyle(id, { icon: "cup" })
    const reloaded = await reopen()
    expect(reloaded.categories("expense").find((category) => category.id === id)?.icon).toBe("cup")
    for (const icon of CATEGORY_ICONS) expect(isCategoryEmoji(icon)).toBe(false)
  })

  it("отмена удаления возвращает эмодзи", async () => {
    const { ledger } = await makeLedger()
    const id = categoryId(ledger, "Кафе")
    await ledger.setCategoryStyle(id, { icon: "☕" })
    const deleted = await ledger.deleteCategory(id)
    if (!deleted.ok) throw new Error(deleted.problem)
    expect(await deleted.undo()).toEqual({ ok: true })
    expect(ledger.categories("expense").find((category) => category.id === id)?.icon).toBe("☕")
  })

  it.each([
    "", " ", "текст", "dog", "https://example.com/icon.png", "data:image/png;base64,YQ==",
    "🐶🐱", "🐶 dog", " 🐶", "🐶 ", "🐶\n", "1", "#", "*", "🇷", "🏽", "🐶\u0301", "🐶‍"
  ])("неподдерживаемая строка заменяется прежней иконкой по умолчанию (%#)", async (icon) => {
    expect(isCategoryEmoji(icon)).toBe(false)
    const { ledger } = await makeLedger()
    const created = await ledger.addCategory("income", "Хобби", { icon })
    if (!created.ok) throw new Error(created.problem)
    expect(created.category.icon).toBe("wallet")

    const id = categoryId(ledger, "Прочее")
    await ledger.setCategoryStyle(id, { icon })
    expect(ledger.categories("expense").find((category) => category.id === id)?.icon).toBe("dots")
  })
})
