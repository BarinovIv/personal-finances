import { describe, expect, it } from "vitest"
import type { Ledger, MovementInput } from "@fin/ledger"
import { add, makeLedger, testClock } from "./support"

/** 29 сентября: зарплатный период 20.09–04.10, до его конца 6 дней, включая сегодня. */
const on29th = () => makeLedger({ clock: testClock("2026-09-29T12:00:00+03:00") })

/** Сохраняет операцию вне расходов и доходов; падает, если не сохранилась. */
const move = async (ledger: Ledger, input: MovementInput) => {
  const result = await ledger.addMovement(input)
  if (!result.ok) throw new Error(`${input.kind} не сохранилась: ${result.problem}`)
  return result.operation
}

describe("операции вне расходов и доходов", () => {
  it("«Одолжил 2 000» в периоде → расходы, доходы, баланс и категории не изменились, свободные деньги −2 000", async () => {
    const { ledger } = await on29th()
    await add(ledger, "+зарплата 60000", { date: "2026-09-20" })
    await add(ledger, "продукты 3000", { date: "2026-09-21" })
    const before = ledger.dashboard({ mode: "pay", offset: 0 })

    const lent = await ledger.addMovement({ kind: "lent", person: "Петя", amount: 200000, date: "2026-09-25" })
    expect(lent).toMatchObject({ ok: true, operation: { kind: "lent", person: "Петя", category: null, amount: 200000 } })

    const after = ledger.dashboard({ mode: "pay", offset: 0 })
    expect(after.expenses).toBe(before.expenses)
    expect(after.income).toBe(before.income)
    expect(after.balance).toBe(before.balance)
    expect(after.categories).toEqual(before.categories)
    expect(after.free).toBe(before.free - 200000)
    expect(after.free).toBe(5500000)
  })

  it("«Снято 10 000» → свободные деньги в периоде её даты +10 000, другие периоды не меняются", async () => {
    const { ledger } = await on29th()
    await move(ledger, { kind: "saved", goalId: "vacation", amount: 3000000, date: "2026-08-10" })
    await add(ledger, "+зарплата 50000", { date: "2026-09-05" })
    const previous = () => ledger.dashboard({ mode: "pay", offset: -1 })
    const current = () => ledger.dashboard({ mode: "pay", offset: 0 })
    expect(previous().free).toBe(5000000)

    await move(ledger, { kind: "withdrawn", goalId: "vacation", amount: 1000000, date: "2026-09-10" })
    expect(previous().free).toBe(6000000)
    expect(previous().income).toBe(5000000)
    expect(previous().expenses).toBe(0)
    expect(current().free).toBe(0)
    expect(ledger.goalSavings("vacation")).toBe(2000000)
  })

  it("отложено и одолжил уменьшают, снято, занял и мне вернули увеличивают, я вернул уменьшает свободные деньги", async () => {
    const { ledger } = await on29th()
    const free = () => ledger.dashboard({ mode: "pay", offset: 0 }).free
    await add(ledger, "+зарплата 100000", { date: "2026-09-20" })
    await move(ledger, { kind: "saved", goalId: "car", amount: 3000000, date: "2026-09-21" })
    expect(free()).toBe(7000000)
    await move(ledger, { kind: "withdrawn", goalId: "car", amount: 500000, date: "2026-09-22" })
    expect(free()).toBe(7500000)
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 200000, date: "2026-09-23" })
    expect(free()).toBe(7300000)
    await move(ledger, { kind: "repaid-to-me", debtId: lent.id, amount: 50000, date: "2026-09-24" })
    expect(free()).toBe(7350000)
    const borrowed = await move(ledger, { kind: "borrowed", person: "Маша", amount: 500000, date: "2026-09-24" })
    expect(free()).toBe(7850000)
    await move(ledger, { kind: "repaid-by-me", debtId: borrowed.id, amount: 100000, date: "2026-09-25" })
    expect(free()).toBe(7750000)
    expect(ledger.dashboard({ mode: "pay", offset: 0 })).toMatchObject({ expenses: 0, income: 10000000, balance: 10000000 })
  })

  it("сегодняшняя операция вне расходов и доходов сразу меняет сумму на день, а не «сегодня осталось»", async () => {
    const { ledger } = await on29th()
    await add(ledger, "+зарплата 60000", { date: "2026-09-20" })
    expect(ledger.dashboard({ mode: "pay", offset: 0 }).allowance).toMatchObject({ perDay: 1000000, leftToday: 1000000 })
    await move(ledger, { kind: "saved", goalId: "car", amount: 1200000 })
    expect(ledger.dashboard({ mode: "pay", offset: 0 }).allowance).toMatchObject({ perDay: 800000, leftToday: 800000 })
    await move(ledger, { kind: "borrowed", person: "Маша", amount: 600000 })
    expect(ledger.dashboard({ mode: "pay", offset: 0 }).allowance).toMatchObject({ perDay: 900000, leftToday: 900000 })
  })

  it("видны в ленте в своём дне; в итоги дня как расходы и доходы не входят", async () => {
    const { ledger } = await on29th()
    await add(ledger, "кофе 250", { date: "2026-09-27" })
    await move(ledger, { kind: "lent", person: "Петя", amount: 200000, date: "2026-09-27", description: "на билеты" })
    await move(ledger, { kind: "saved", goalId: "car", amount: 500000 })

    const [today, before] = ledger.days()
    expect(today).toMatchObject({ date: "2026-09-29", expenseTotal: 0, incomeTotal: 0 })
    expect(today!.items).toMatchObject([{ kind: "saved", goalId: "car", category: null, amount: 500000 }])
    expect(before).toMatchObject({ date: "2026-09-27", expenseTotal: 25000, incomeTotal: 0 })
    expect(before!.items.map((o) => [o.kind, o.description, o.person, o.category?.name ?? null])).toEqual([
      ["lent", "на билеты", "Петя", null],
      ["expense", "кофе", null, "Кафе"]
    ])
  })

  it("находятся поиском по человеку, виду и сумме; итоги поиска не считают их расходами", async () => {
    const { ledger } = await on29th()
    await add(ledger, "такси 500")
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 200000 })
    await move(ledger, { kind: "repaid-to-me", debtId: lent.id, amount: 50000 })

    const byPerson = ledger.search("петя")
    expect(byPerson.count).toBe(2)
    expect(byPerson.total).toBe(0)
    expect(byPerson.days[0]!.items.map((o) => o.kind)).toEqual(["repaid-to-me", "lent"])
    expect(ledger.search("одолжил").count).toBe(1)
    expect(ledger.search("2000").days[0]!.items.map((o) => o.kind)).toEqual(["lent"])
    expect(ledger.search("")).toMatchObject({ count: 3, total: 50000 })
    // у них нет категории — поиск по категориям их не находит
    expect(ledger.search("", ["transport"]).count).toBe(1)
  })

  it("не имеют категории; автокатегоризация на них не учится", async () => {
    const { ledger } = await on29th()
    await move(ledger, { kind: "lent", person: "Петя", amount: 50000, description: "такси" })
    expect(ledger.preview("такси 300")).toMatchObject({ categoryId: "transport", categorySource: "dictionary" })
    expect(ledger.categoryUsage("transport")).toBe(0)
  })

  it("человек и цель обязательны, сумма — положительная в копейках", async () => {
    const { ledger } = await on29th()
    expect(await ledger.addMovement({ kind: "lent", person: "  ", amount: 100 })).toEqual({ ok: false, problem: "no-person" })
    expect(await ledger.addMovement({ kind: "saved", goalId: "", amount: 100 })).toEqual({ ok: false, problem: "no-goal" })
    expect(await ledger.addMovement({ kind: "borrowed", person: "Маша", amount: 0 })).toEqual({ ok: false, problem: "bad-amount" })
    expect(await ledger.addMovement({ kind: "borrowed", person: "Маша", amount: 10.5 })).toEqual({
      ok: false,
      problem: "bad-amount"
    })
    expect(ledger.days()).toEqual([])
  })

  it("снять с цели больше накопленного нельзя", async () => {
    const { ledger } = await on29th()
    expect(await ledger.addMovement({ kind: "withdrawn", goalId: "car", amount: 100 })).toEqual({ ok: false, problem: "too-much" })
    await move(ledger, { kind: "saved", goalId: "car", amount: 300000 })
    await move(ledger, { kind: "saved", goalId: "flat", amount: 900000 })
    expect(await ledger.addMovement({ kind: "withdrawn", goalId: "car", amount: 300001 })).toEqual({ ok: false, problem: "too-much" })
    await move(ledger, { kind: "withdrawn", goalId: "car", amount: 300000 })
    expect(ledger.goalSavings("car")).toBe(0)
    expect(ledger.goalSavings("flat")).toBe(900000)
  })

  it("операция «Отменить» после создания удаляет её", async () => {
    const { ledger } = await on29th()
    const result = await ledger.addMovement({ kind: "borrowed", person: "Маша", amount: 500000 })
    if (!result.ok) throw new Error()
    expect(await result.undo()).toEqual({ ok: true })
    expect(ledger.days()).toEqual([])
  })
})

describe("погашения долгов", () => {
  it("по умолчанию гасится весь остаток, сегодня; у погашения — человек его долга", async () => {
    const { ledger } = await on29th()
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 200000, date: "2026-09-20" })
    expect(await ledger.addMovement({ kind: "repaid-to-me", debtId: lent.id, amount: 50000 })).toMatchObject({ ok: true })
    expect(ledger.repayments(lent.id)).toMatchObject({ repaid: 50000, remaining: 150000 })
    const rest = await move(ledger, { kind: "repaid-to-me", debtId: lent.id })
    expect(rest).toMatchObject({ kind: "repaid-to-me", amount: 150000, date: "2026-09-29", person: "Петя", repaymentOf: lent.id })
    expect(ledger.repayments(lent.id)).toMatchObject({ repaid: 200000, remaining: 0, items: [{ amount: 150000 }, { amount: 50000 }] })
  })

  it("погасить больше остатка нельзя", async () => {
    const { ledger } = await on29th()
    const borrowed = await move(ledger, { kind: "borrowed", person: "Маша", amount: 500000 })
    expect(await ledger.addMovement({ kind: "repaid-by-me", debtId: borrowed.id, amount: 500001 })).toEqual({
      ok: false,
      problem: "too-much"
    })
    await move(ledger, { kind: "repaid-by-me", debtId: borrowed.id })
    expect(await ledger.addMovement({ kind: "repaid-by-me", debtId: borrowed.id })).toEqual({ ok: false, problem: "too-much" })
  })

  it("«Мне вернули» — только по «Одолжил», «Я вернул» — только по «Занял»", async () => {
    const { ledger } = await on29th()
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 200000 })
    const coffee = await add(ledger, "кофе 250")
    expect(await ledger.addMovement({ kind: "repaid-by-me", debtId: lent.id })).toEqual({ ok: false, problem: "not-a-debt" })
    expect(await ledger.addMovement({ kind: "repaid-to-me", debtId: coffee.id })).toEqual({ ok: false, problem: "not-a-debt" })
    expect(ledger.repayments(coffee.id)).toBeUndefined()
  })

  it("удаление долга удаляет его погашения; «Отменить» возвращает всё", async () => {
    const { ledger } = await on29th()
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 200000 })
    await move(ledger, { kind: "repaid-to-me", debtId: lent.id, amount: 50000 })
    const undo = await ledger.deleteOperation(lent.id)
    expect(ledger.days()).toEqual([])
    expect(ledger.dashboard({ mode: "pay", offset: 0 }).free).toBe(0)
    expect(await undo()).toEqual({ ok: true })
    expect(ledger.repayments(lent.id)).toMatchObject({ repaid: 50000, remaining: 150000 })
  })
})

describe("правка операций вне расходов и доходов", () => {
  it("меняются сумма, дата, описание (может быть пустым) и человек; категории нет", async () => {
    const { ledger } = await on29th()
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 200000, description: "билеты" })
    expect(await ledger.updateOperation(lent.id, { amount: 300000, description: "", person: " Пётр ", date: "2026-09-28" })).toMatchObject({
      ok: true
    })
    expect(ledger.operation(lent.id)).toMatchObject({ amount: 300000, description: "", person: "Пётр", date: "2026-09-28", category: null })
    expect(await ledger.updateOperation(lent.id, { categoryId: "food" })).toEqual({ ok: false, problem: "bad-category" })
    expect(await ledger.updateOperation(lent.id, { person: "" })).toEqual({ ok: false, problem: "no-person" })
  })

  it("погашений не больше долга, долг не меньше погашенного, с цели не снято больше накопленного", async () => {
    const { ledger } = await on29th()
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 200000 })
    const repaid = await move(ledger, { kind: "repaid-to-me", debtId: lent.id, amount: 150000 })
    expect(await ledger.updateOperation(lent.id, { amount: 100000 })).toEqual({ ok: false, problem: "below-repayments" })
    expect(await ledger.updateOperation(repaid.id, { amount: 200001 })).toEqual({ ok: false, problem: "bad-amount" })
    expect(await ledger.updateOperation(repaid.id, { amount: 200000 })).toMatchObject({ ok: true })

    const saved = await move(ledger, { kind: "saved", goalId: "car", amount: 300000 })
    const withdrawn = await move(ledger, { kind: "withdrawn", goalId: "car", amount: 200000 })
    expect(await ledger.updateOperation(saved.id, { amount: 199999 })).toEqual({ ok: false, problem: "bad-amount" })
    expect(await ledger.updateOperation(withdrawn.id, { amount: 300001 })).toEqual({ ok: false, problem: "bad-amount" })
    expect(await ledger.updateOperation(withdrawn.id, { amount: 300000 })).toMatchObject({ ok: true })
    expect(ledger.goalSavings("car")).toBe(0)
  })
})

describe("синхронизация операций вне расходов и доходов", () => {
  it("уходят в очередь на сервер и приходят с другого устройства", async () => {
    const { ledger } = await on29th()
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 200000, date: "2026-09-25" })
    expect(ledger.pendingChanges()).toMatchObject([
      {
        collection: "operations",
        id: lent.id,
        data: { kind: "lent", person: "Петя", amount: 200000, categoryId: "", refundOf: null, recurringId: null }
      }
    ])

    const other = await on29th()
    await other.ledger.sync.receive(ledger.pendingChanges(), 1)
    expect(other.ledger.operation(lent.id)).toMatchObject({ kind: "lent", person: "Петя", category: null })
    expect(other.ledger.dashboard({ mode: "pay", offset: 0 }).free).toBe(-200000)
  })

  it("погашение удалённого на другом устройстве долга не живое", async () => {
    const { ledger } = await on29th()
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 200000 })
    await move(ledger, { kind: "repaid-to-me", debtId: lent.id, amount: 50000 })
    const debt = ledger.pendingChanges().find((r) => r.id === lent.id)!
    await ledger.sync.receive([{ ...debt, updatedAt: debt.updatedAt + 1000, deleted: true }], 1)
    expect(ledger.days()).toEqual([])
    expect(ledger.dashboard({ mode: "pay", offset: 0 }).free).toBe(0)
  })
})
