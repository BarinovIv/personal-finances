import { describe, expect, it } from "vitest"
import type { Ledger, MovementInput } from "@fin/ledger"
import { makeLedger, testClock } from "./support"

const on29th = () => makeLedger({ clock: testClock("2026-09-29T12:00:00+03:00") })

/** Сохраняет долг или погашение; падает, если не сохранилось. */
const move = async (ledger: Ledger, input: MovementInput) => {
  const result = await ledger.addMovement(input)
  if (!result.ok) throw new Error(`${input.kind} не сохранилась: ${result.problem}`)
  return result.operation
}

describe("долги по людям", () => {
  it("одолжил Пете 2 000 и занял у Пети 500 → Петя должен мне 1 500", async () => {
    const { ledger } = await on29th()
    await move(ledger, { kind: "lent", person: "петя", amount: 200000, date: "2026-09-20" })
    await move(ledger, { kind: "borrowed", person: "Петя", amount: 50000, date: "2026-09-25" })

    const { people } = ledger.debts()
    expect(people).toMatchObject([{ name: "Петя", balance: 150000 }])
    expect(people[0]!.open.map((d) => [d.operation.kind, d.remaining])).toEqual([
      ["borrowed", 50000],
      ["lent", 200000]
    ])
  })

  it("занял у Маши 5 000 → я должен Маше 5 000; люди по алфавиту", async () => {
    const { ledger } = await on29th()
    await move(ledger, { kind: "borrowed", person: "Маша", amount: 500000 })
    await move(ledger, { kind: "lent", person: "Аня", amount: 30000 })
    expect(ledger.debts().people.map((p) => [p.name, p.balance])).toEqual([
      ["Аня", 30000],
      ["Маша", -500000]
    ])
  })

  it("регистр, пробелы и «ё» не различают людей; имя — как в последнем введённом долге", async () => {
    const { ledger } = await on29th()
    await move(ledger, { kind: "lent", person: "Пётр", amount: 100000, date: "2026-09-28" })
    await move(ledger, { kind: "lent", person: "  петр ", amount: 100000, date: "2026-09-29" })
    // введён последним, хотя датой раньше
    await move(ledger, { kind: "lent", person: "ПЕТР", amount: 100000, date: "2026-09-01" })
    expect(ledger.debts().people).toMatchObject([{ name: "ПЕТР", balance: 300000 }])
    expect(ledger.debtPeople()).toEqual(["ПЕТР"])
  })

  it("погашения уменьшают сальдо; погашенный полностью долг уходит в закрытые", async () => {
    const { ledger } = await on29th()
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 200000, date: "2026-09-20" })
    const borrowed = await move(ledger, { kind: "borrowed", person: "Петя", amount: 50000, date: "2026-09-21" })
    await move(ledger, { kind: "repaid-to-me", debtId: lent.id, amount: 50000 })
    expect(ledger.debts().people).toMatchObject([{ name: "Петя", balance: 100000 }])

    await move(ledger, { kind: "repaid-by-me", debtId: borrowed.id })
    const { people, closed } = ledger.debts()
    expect(people).toMatchObject([{ name: "Петя", balance: 150000, open: [{ repaid: 50000, remaining: 150000 }] }])
    expect(closed).toMatchObject([{ operation: { id: borrowed.id, person: "Петя" }, repaid: 50000, remaining: 0 }])

    await move(ledger, { kind: "repaid-to-me", debtId: lent.id })
    expect(ledger.debts().people).toEqual([])
    expect(ledger.debts().closed.map((d) => d.operation.id)).toEqual([borrowed.id, lent.id])
  })

  it("взаимные долги поровну — человек в расчёте, но долги не закрыты", async () => {
    const { ledger } = await on29th()
    await move(ledger, { kind: "lent", person: "Петя", amount: 50000 })
    await move(ledger, { kind: "borrowed", person: "Петя", amount: 50000 })
    expect(ledger.debts()).toMatchObject({ people: [{ name: "Петя", balance: 0 }], closed: [] })
    expect(ledger.debts().people[0]!.open).toHaveLength(2)
  })

  it("удалённый долг пропадает вместе с погашениями; «Отменить» возвращает", async () => {
    const { ledger } = await on29th()
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 200000 })
    await move(ledger, { kind: "repaid-to-me", debtId: lent.id, amount: 50000 })
    const undo = await ledger.deleteOperation(lent.id)
    expect(ledger.debts()).toEqual({ people: [], closed: [] })
    expect(ledger.debtPeople()).toEqual([])
    await undo()
    expect(ledger.debts().people).toMatchObject([{ name: "Петя", balance: 150000 }])
  })

  it("правка человека в долге переносит его к другому человеку", async () => {
    const { ledger } = await on29th()
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 200000 })
    await move(ledger, { kind: "lent", person: "Маша", amount: 10000 })
    await ledger.updateOperation(lent.id, { person: "маша" })
    expect(ledger.debts().people).toMatchObject([{ name: "Маша", balance: 210000 }])
  })
})

describe("подсказки людей", () => {
  it("все встречавшиеся в долгах люди, включая закрытые, сначала недавние", async () => {
    const { ledger } = await on29th()
    expect(ledger.debtPeople()).toEqual([])
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 100 })
    await move(ledger, { kind: "borrowed", person: "Маша", amount: 100 })
    await move(ledger, { kind: "repaid-to-me", debtId: lent.id })
    await move(ledger, { kind: "lent", person: "Аня", amount: 100 })
    await move(ledger, { kind: "lent", person: "маша", amount: 100 })
    expect(ledger.debtPeople()).toEqual(["маша", "Аня", "Петя"])
  })
})

describe("синхронизация долгов", () => {
  it("долг и погашение с другого устройства видны в сальдо", async () => {
    const { ledger } = await on29th()
    const lent = await move(ledger, { kind: "lent", person: "Петя", amount: 200000 })
    await move(ledger, { kind: "repaid-to-me", debtId: lent.id, amount: 50000 })

    const other = await on29th()
    await other.ledger.sync.receive(ledger.pendingChanges(), 2)
    expect(other.ledger.debts().people).toMatchObject([{ name: "Петя", balance: 150000 }])
    expect(other.ledger.debtPeople()).toEqual(["Петя"])
  })
})
