import { describe, expect, it } from "vitest"
import { add, categoryId, makeLedger } from "./support"

describe("бывшие команды — обычные описания расходов", () => {
  it("слова долгов, целей и возврата сохраняет как расходы с категорией", async () => {
    const { ledger, reopen } = await makeLedger()
    const category = categoryId(ledger, "Прочее")
    const descriptions = [
      "одолжил Петя", "занял Петя", "мне вернули Петя", "я вернул Петя", "вернул Петя",
      "отложить отпуск", "отложил отпуск", "снять отпуск", "снял отпуск", "возврат шаурма", "возврат"
    ]
    for (const description of descriptions) {
      expect(ledger.preview(`${description} 500`, { categoryId: category })).toMatchObject({
        kind: "expense", description, categoryId: category, problems: []
      })
      const operation = await add(ledger, `вчера ${description} 500`, { categoryId: category })
      expect(operation).toMatchObject({
        kind: "expense", description, amount: 50000, category: { name: "Прочее" }, date: "2026-09-27",
        person: null, goalId: null, repaymentOf: null, refundOf: null
      })
      expect((await reopen()).operation(operation.id)).toMatchObject({ kind: "expense", description })
    }
    expect(ledger.dashboard({ mode: "month", offset: 0 })).toMatchObject({ expenses: descriptions.length * 50000, income: 0 })
  })

  it("слово возврата не связывает расход даже при совпадении названия", async () => {
    const { ledger } = await makeLedger()
    const expense = await add(ledger, "шаурма 300")
    const operation = await add(ledger, "возврат шаурма 500")
    expect(operation).toMatchObject({ kind: "expense", description: "возврат шаурма", refundOf: null })
    expect(ledger.refunds(expense.id)).toMatchObject({ remaining: 30000, items: [] })
  })

  it("недописанные описания требуют только сумму при выбранной категории", async () => {
    const { ledger } = await makeLedger()
    for (const description of ["одолжил", "мне", "я", "мне вернули", "отложить", "возврат"]) {
      expect(ledger.preview(description, { categoryId: categoryId(ledger, "Прочее") })).toMatchObject({
        kind: "expense", description, problems: ["no-amount"]
      })
    }
  })

  it("не сохраняет нулевые, округлившиеся до нуля и слишком большие суммы", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "шаурма 300")
    const before = ledger.pendingChanges()
    for (const description of ["одолжил Петя", "мне вернули Петя", "возврат шаурма", "отложил отпуск"]) {
      for (const amount of ["000 000", "0,000001к", "9".repeat(307), "90 071 992 547 410"]) {
        const result = await ledger.submit(`${description} ${amount}`, { categoryId: categoryId(ledger, "Прочее") })
        expect(result).toEqual({ ok: false, problems: ["no-amount"] })
      }
    }
    expect(ledger.pendingChanges()).toEqual(before)
  })

  it("сохраняет смешанную строку атомарно, а отмена удаляет все новые расходы и доходы", async () => {
    const { ledger } = await makeLedger()
    const expense = await add(ledger, "шаурма 340")
    let notifications = 0
    ledger.subscribe(() => { notifications++ })
    const result = await ledger.submitEntries("вчера отложил отпуск 3к мне вернули Петя 500 возврат шаурма 150 кофе 250 +зарплата 5к", {
      categoryIds: [categoryId(ledger, "Прочее"), categoryId(ledger, "Прочее")]
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.operations.map((o) => o.kind)).toEqual(["expense", "expense", "expense", "expense", "income"])
    expect(result.operations.every((o) => o.date === "2026-09-27" && o.refundOf === null)).toBe(true)
    expect(notifications).toBe(1)
    expect(ledger.refunds(expense.id)?.remaining).toBe(34000)
    expect(await result.undo()).toEqual({ ok: true })
    expect(result.operations.every((o) => ledger.operation(o.id) === undefined)).toBe(true)
  })
})
