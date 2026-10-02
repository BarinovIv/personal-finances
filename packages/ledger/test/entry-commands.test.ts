import { describe, expect, it } from "vitest"
import { add, addGoal, categoryId, makeLedger } from "./support"

describe("команды в журнале", () => {
  it("создаёт долги с новым человеком без категории и без обучения категорий", async () => {
    const { ledger, reopen } = await makeLedger()
    const lent = await add(ledger, "вчера одолжил  Пётр  Иванов 2к", { categoryId: categoryId(ledger, "Кафе") })
    const borrowed = await add(ledger, "занял петя 1к")
    expect(lent).toMatchObject({ kind: "lent", person: "Пётр Иванов", category: null, date: "2026-09-27" })
    expect(borrowed).toMatchObject({ kind: "borrowed", person: "петя", category: null })
    expect(ledger.preview("Пётр Иванов 200").problems).toEqual(["no-category"])
    expect((await reopen()).operation(lent.id)).toMatchObject({ person: "Пётр Иванов" })
    expect(ledger.dashboard({ mode: "month", offset: 0 })).toMatchObject({ expenses: 0, income: 0 })
  })

  it("связывает погашение с долгом нужного вида, нормализует человека и проверяет остаток", async () => {
    const { ledger } = await makeLedger()
    const lent = await add(ledger, "одолжил Пётр Иванов 2к")
    const borrowed = await add(ledger, "занял Пётр Иванов 1к")
    expect(ledger.preview("мне вернули петр  иванов 500")).toMatchObject({
      kind: "repaid-to-me", repaymentOf: lent.id, person: "Пётр Иванов", categoryId: null, problems: []
    })
    const repayment = await add(ledger, "мне вернули петр иванов 500")
    expect(repayment).toMatchObject({ repaymentOf: lent.id, category: null, person: "Пётр Иванов" })
    expect((await add(ledger, "я вернул петр иванов 500")).repaymentOf).toBe(borrowed.id)
    expect((await add(ledger, "вернул петр иванов 500")).repaymentOf).toBe(borrowed.id)
    expect(await ledger.submit("мне вернули Пётр Иванов 1501")).toEqual({ ok: false, problems: ["too-much"] })
    expect(await ledger.submit("вернул Пётр Иванов 1")).toEqual({ ok: false, problems: ["no-debt"] })
    expect(await ledger.submit("мне вернули Неизвестный 10")).toEqual({ ok: false, problems: ["no-debt"] })
  })

  it("не выбирает произвольный долг из нескольких, принимает явный выбор в его области", async () => {
    const { ledger } = await makeLedger()
    const first = await add(ledger, "одолжил Петя 2к", { date: "2026-09-20" })
    const second = await add(ledger, "одолжил петя 1к")
    const other = await add(ledger, "занял Петя 1к")
    const preview = ledger.preview("мне вернули ПЕТЯ 500")
    expect(preview.problems).toEqual(["choose-target"])
    expect(preview.repaymentOf).toBeNull()
    expect(preview.targets).toEqual([
      { id: second.id, label: "петя", date: "2026-09-28", remaining: 100000 },
      { id: first.id, label: "Петя", date: "2026-09-20", remaining: 200000 }
    ])
    expect((await add(ledger, "мне вернули Петя 500", { targetId: first.id })).repaymentOf).toBe(first.id)
    expect(ledger.preview("мне вернули Петя 500", { targetId: other.id }).problems).toEqual(["choose-target"])
    expect(ledger.repayments(second.id)?.remaining).toBe(100000)
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

  it("цели выбираются по имени, поддерживают архив и допускают больше целевой суммы", async () => {
    const { ledger } = await makeLedger()
    const goal = await addGoal(ledger, { name: "Лётний отпуск", target: 100000 })
    await ledger.archiveGoal(goal.id, true)
    const saved = await add(ledger, "отложить летний отпуск 3к")
    expect(saved).toMatchObject({ kind: "saved", goalId: goal.id, category: null })
    const withdrawn = await add(ledger, "снять ЛЁТНИЙ ОТПУСК 1к")
    expect(withdrawn).toMatchObject({ kind: "withdrawn", goalId: goal.id, category: null })
    expect(ledger.goalSavings(goal.id)).toBe(200000)
    expect(await ledger.submit("снять летний отпуск 2001")).toEqual({ ok: false, problems: ["too-much"] })
    expect(await ledger.submit("отложил неизвестная 100")).toEqual({ ok: false, problems: ["no-goal"] })
    const duplicate = await addGoal(ledger, { name: "летний отпуск", target: 100000 })
    expect(ledger.preview("отложил летний отпуск 100").problems).toEqual(["choose-target"])
    expect((await add(ledger, "отложил летний отпуск 100", { targetId: duplicate.id })).goalId).toBe(duplicate.id)
  })

  it("недописанные команды требуют человека, цель или расход, а выбор восполняет имя", async () => {
    const { ledger } = await makeLedger()
    expect(await ledger.submit("одолжил 500")).toEqual({ ok: false, problems: ["no-person"] })
    const debt = await add(ledger, "одолжил Петя 500")
    const goal = await addGoal(ledger, { name: "отпуск", target: 100000 })
    const expense = await add(ledger, "шаурма 300")
    expect(ledger.preview("мне вернули 100").problems).toEqual(["no-person"])
    expect((await add(ledger, "мне вернули 100", { targetId: debt.id })).repaymentOf).toBe(debt.id)
    expect((await add(ledger, "отложить 100", { targetId: goal.id })).goalId).toBe(goal.id)
    expect((await add(ledger, "возврат 100", { targetId: expense.id })).refundOf).toBe(expense.id)
    expect(ledger.preview("одолжил").problems).toEqual(["no-amount", "no-person"])
  })

  it("ноль с разрядами и округлившиеся до нуля суммы не создают движение денег", async () => {
    const { ledger } = await makeLedger()
    await addGoal(ledger, { name: "отпуск", target: 100000 })
    await add(ledger, "одолжил Петя 500")
    await add(ledger, "шаурма 300")
    const before = ledger.pendingChanges()
    for (const command of ["одолжил Петя", "мне вернули Петя", "возврат шаурма", "отложил отпуск"]) {
      for (const amount of ["000 000", "0,000001к"]) {
        const result = await ledger.submit(`${command} ${amount}`)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.problems).toContain("no-amount")
      }
    }
    expect(ledger.pendingChanges()).toEqual(before)
  })
})

describe("смешанные строки команд сохраняются атомарно", () => {
  it("сохраняет всю строку одним изменением хранилища и одним отменяет все операции", async () => {
    const { ledger } = await makeLedger()
    const goal = await addGoal(ledger, { name: "отпуск", target: 500000 })
    const expense = await add(ledger, "шаурма 340")
    const debt = await add(ledger, "одолжил Петя 2к")
    let notifications = 0
    ledger.subscribe(() => { notifications++ })
    const result = await ledger.submitEntries("вчера отложил отпуск 3к снять отпуск 1к мне вернули Петя 500 возврат шаурма 150 кофе 250 +зарплата 5к")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.operations.map((o) => o.kind)).toEqual(["saved", "withdrawn", "repaid-to-me", "refund", "expense", "income"])
    expect(result.operations.every((o) => o.date === "2026-09-27")).toBe(true)
    expect(notifications).toBe(1)
    expect(ledger.goalSavings(goal.id)).toBe(200000)
    expect(ledger.repayments(debt.id)?.remaining).toBe(150000)
    expect(ledger.refunds(expense.id)?.remaining).toBe(19000)
    expect(await result.undo()).toEqual({ ok: true })
    expect(ledger.goalSavings(goal.id)).toBe(0)
    expect(ledger.repayments(debt.id)?.remaining).toBe(200000)
    expect(ledger.refunds(expense.id)?.remaining).toBe(34000)
    expect(result.operations.every((o) => ledger.operation(o.id) === undefined)).toBe(true)
  })

  it.each(["repayment", "refund", "withdrawal"])("проверяет общий остаток для %s до любого сохранения", async (kind) => {
    const { ledger } = await makeLedger()
    let line: string
    if (kind === "repayment") {
      await add(ledger, "одолжил Петя 1к")
      line = "кофе 10 мне вернули Петя 600 мне вернули Петя 500"
    } else if (kind === "refund") {
      await add(ledger, "шаурма 1к")
      line = "кофе 10 возврат шаурма 600 возврат шаурма 500"
    } else {
      const goal = await addGoal(ledger, { name: "отпуск", target: 200000 })
      await ledger.addMovement({ kind: "saved", goalId: goal.id, amount: 100000 })
      line = "кофе 10 снять отпуск 600 снять отпуск 500"
    }
    const before = ledger.pendingChanges()
    expect(ledger.previewEntries(line)[2]!.problems).toEqual(["too-much"])
    expect(await ledger.submitEntries(line)).toEqual({ ok: false, index: 2, problems: ["too-much"] })
    expect(ledger.pendingChanges()).toEqual(before)
  })

  it("массив явных целей выбирает разные долги в строке", async () => {
    const { ledger } = await makeLedger()
    const first = await add(ledger, "одолжил Петя 1к")
    const second = await add(ledger, "одолжил Петя 1к")
    const result = await ledger.submitEntries("мне вернули Петя 1к мне вернули Петя 1к", { targetIds: [first.id, second.id] })
    expect(result).toMatchObject({ ok: true, operations: [{ repaymentOf: first.id }, { repaymentOf: second.id }] })
  })
})
