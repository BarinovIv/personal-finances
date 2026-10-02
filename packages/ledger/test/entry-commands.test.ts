import { describe, expect, it } from "vitest"
import { add, categoryId, makeLedger } from "./support"

describe("команды в журнале", () => {
  it("слова долгов и целей сохраняет как обычные расходы с категорией", async () => {
    const { ledger, reopen } = await makeLedger()
    const category = categoryId(ledger, "Прочее")
    for (const description of ["одолжил Петя", "занял Петя", "мне вернули Петя", "я вернул Петя", "вернул Петя", "отложить отпуск", "отложил отпуск", "снять отпуск", "снял отпуск"]) {
      expect(ledger.preview(`${description} 500`)).toMatchObject({ kind: "expense", description, targets: [] })
      const operation = await add(ledger, `вчера ${description} 500`, { categoryId: category, targetId: "unused" })
      expect(operation).toMatchObject({
        kind: "expense", description, amount: 50000, category: { name: "Прочее" }, date: "2026-09-27",
        person: null, goalId: null, repaymentOf: null, refundOf: null
      })
      expect((await reopen()).operation(operation.id)).toMatchObject({ kind: "expense", description })
    }
    expect(ledger.dashboard({ mode: "month", offset: 0 })).toMatchObject({ expenses: 450000, income: 0 })
  })

  it("возврат ссылается на расход и наследует его категорию", async () => {
    const { ledger } = await makeLedger()
    const expense = await add(ledger, "Шаурма 340", { categoryId: categoryId(ledger, "Прочее") })
    await add(ledger, "+Шаурма 500", { categoryId: categoryId(ledger, "Подработка") })
    const refund = await add(ledger, "вчера возврат шаурма 150", { categoryId: categoryId(ledger, "Кафе") })
    expect(refund).toMatchObject({
      kind: "refund", refundOf: expense.id, description: "Шаурма", category: { name: "Прочее" }, date: "2026-09-27"
    })
    expect(await ledger.submit("возврат шаурма 191")).toEqual({ ok: false, problems: ["too-much"] })
    expect(await ledger.submit("возврат другое 150")).toEqual({ ok: false, problems: ["no-expense"] })
    const duplicate = await add(ledger, "шаурма 200")
    expect(ledger.preview("возврат шаурма 50").problems).toEqual(["choose-target"])
    expect((await add(ledger, "возврат шаурма 200", { targetId: duplicate.id })).refundOf).toBe(duplicate.id)
    expect(ledger.preview("возврат шаурма 50").refundOf).toBe(expense.id)
  })

  it("недописанный возврат требует расход, а выбор восполняет описание", async () => {
    const { ledger } = await makeLedger()
    const expense = await add(ledger, "шаурма 300")
    expect(ledger.preview("возврат 100").problems).toEqual(["no-expense"])
    expect((await add(ledger, "возврат 100", { targetId: expense.id })).refundOf).toBe(expense.id)
    expect(ledger.preview("возврат").problems).toEqual(["no-amount", "no-expense"])
    for (const description of ["одолжил", "мне", "я", "мне вернули", "отложить"]) {
      expect(ledger.preview(description, { categoryId: categoryId(ledger, "Прочее") })).toMatchObject({
        kind: "expense", description, problems: ["no-amount"]
      })
    }
  })

  it("ноль с разрядами и округлившиеся до нуля суммы не создают операции", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "шаурма 300")
    const before = ledger.pendingChanges()
    for (const description of ["одолжил Петя", "мне вернули Петя", "возврат шаурма", "отложил отпуск"]) {
      for (const amount of ["000 000", "0,000001к"]) {
        const result = await ledger.submit(`${description} ${amount}`)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.problems).toContain("no-amount")
      }
    }
    expect(ledger.pendingChanges()).toEqual(before)
  })
})

describe("смешанные строки сохраняются атомарно", () => {
  it("сохраняет всю строку одним изменением хранилища и одним отменяет все операции", async () => {
    const { ledger } = await makeLedger()
    const expense = await add(ledger, "шаурма 340")
    let notifications = 0
    ledger.subscribe(() => { notifications++ })
    const result = await ledger.submitEntries("вчера отложил отпуск 3к мне вернули Петя 500 возврат шаурма 150 кофе 250 +зарплата 5к", {
      categoryIds: [categoryId(ledger, "Прочее"), categoryId(ledger, "Прочее")]
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.operations.map((o) => o.kind)).toEqual(["expense", "expense", "refund", "expense", "income"])
    expect(result.operations.every((o) => o.date === "2026-09-27")).toBe(true)
    expect(notifications).toBe(1)
    expect(ledger.refunds(expense.id)?.remaining).toBe(19000)
    expect(await result.undo()).toEqual({ ok: true })
    expect(ledger.refunds(expense.id)?.remaining).toBe(34000)
    expect(result.operations.every((o) => ledger.operation(o.id) === undefined)).toBe(true)
  })

  it("проверяет общий остаток возвратов до любого сохранения", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "шаурма 1к")
    const line = "кофе 10 возврат шаурма 600 возврат шаурма 500"
    const before = ledger.pendingChanges()
    expect(ledger.previewEntries(line)[2]!.problems).toEqual(["too-much"])
    expect(await ledger.submitEntries(line)).toEqual({ ok: false, index: 2, problems: ["too-much"] })
    expect(ledger.pendingChanges()).toEqual(before)
  })

  it("массив явных расходов выбирает разные покупки с одинаковым названием", async () => {
    const { ledger } = await makeLedger()
    const first = await add(ledger, "шаурма 1к")
    const second = await add(ledger, "шаурма 1к")
    const result = await ledger.submitEntries("возврат шаурма 1к возврат шаурма 1к", { targetIds: [first.id, second.id] })
    expect(result).toMatchObject({ ok: true, operations: [{ refundOf: first.id }, { refundOf: second.id }] })
  })
})
