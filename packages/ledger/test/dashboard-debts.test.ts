import { describe, expect, it } from "vitest"
import type { Ledger, MovementInput } from "@fin/ledger"
import { makeLedger, testClock } from "./support"

const move = async (ledger: Ledger, input: MovementInput) => {
  const result = await ledger.addMovement(input)
  if (!result.ok) { throw new Error(result.problem) }
  return result.operation
}

const october = () => makeLedger({ clock: testClock("2026-10-15T12:00:00+03:00") })

describe("долги на дашборде", () => {
  it("сохраняет, меняет и очищает необязательную дату возврата с отменой", async () => {
    const { ledger } = await october()
    const debt = await move(ledger, { kind: "borrowed", person: "Петя", amount: 100000 })
    expect(debt.dueDate).toBeNull()
    const result = await ledger.updateOperation(debt.id, { dueDate: "2026-10-31" })
    expect(result.ok).toBe(true)
    expect(ledger.operation(debt.id)?.dueDate).toBe("2026-10-31")
    const cleared = await ledger.updateOperation(debt.id, { dueDate: null })
    expect(ledger.operation(debt.id)?.dueDate).toBeNull()
    if (cleared.ok) { await cleared.undo() }
    expect(ledger.operation(debt.id)?.dueDate).toBe("2026-10-31")
  })

  it("создаёт долг со сроком и отвергает некорректный срок", async () => {
    const { ledger } = await october()
    const debt = await move(ledger, { kind: "lent", person: "Петя", amount: 100000, dueDate: "2026-11-01" })
    expect(debt.dueDate).toBe("2026-11-01")
    expect(await ledger.addMovement({ kind: "borrowed", person: "Петя", amount: 100, dueDate: "2026-02-30" }))
      .toEqual({ ok: false, problem: "bad-due-date" })
    expect(await ledger.updateOperation(debt.id, { dueDate: "tomorrow" })).toEqual({ ok: false, problem: "bad-due-date" })
    const repayment = await move(ledger, { kind: "repaid-to-me", debtId: debt.id, amount: 100 })
    expect(await ledger.updateOperation(repayment.id, { dueDate: "2026-10-31" })).toEqual({ ok: false, problem: "bad-due-date" })
  })

  it("резервирует только собственный остаток до конца текущего периода без двойного вычета", async () => {
    const { ledger } = await october()
    const debt = await move(ledger, { kind: "borrowed", person: "Кредитка", amount: 2000000, date: "2026-09-01", dueDate: "2026-10-31" })
    await ledger.submit("+зарплата 50000")
    const before = ledger.dashboard({ mode: "month", offset: 0 })
    expect(before.debts.reserve).toBe(2000000)
    expect(before.free).toBe(3000000)
    expect(before.allowance?.free).toBe(3000000)
    await move(ledger, { kind: "repaid-by-me", debtId: debt.id, amount: 500000 })
    const after = ledger.dashboard({ mode: "month", offset: 0 })
    expect(after.debts.reserve).toBe(1500000)
    expect(after.free).toBe(3000000)
    expect(after.allowance?.free).toBe(3000000)
    await ledger.updateOperation(debt.id, { dueDate: "2026-11-01" })
    expect(ledger.dashboard({ mode: "month", offset: 0 }).debts.reserve).toBe(0)
    await ledger.updateOperation(debt.id, { dueDate: null })
    expect(ledger.dashboard({ mode: "month", offset: 0 }).free).toBe(4500000)
  })

  it("сортирует просроченные, ближайшие и бессрочные долги; будущие погашения не меняют сегодня", async () => {
    const { ledger } = await october()
    await move(ledger, { kind: "borrowed", person: "Без срока", amount: 10000 })
    await move(ledger, { kind: "borrowed", person: "Ноябрь", amount: 10000, dueDate: "2026-11-01" })
    const overdue = await move(ledger, { kind: "borrowed", person: "Просрочен", amount: 10000, dueDate: "2026-10-14" })
    await move(ledger, { kind: "borrowed", person: "Сегодня", amount: 10000, dueDate: "2026-10-15" })
    await move(ledger, { kind: "repaid-by-me", debtId: overdue.id, date: "2026-10-20" })
    const lent = await move(ledger, { kind: "lent", person: "Мне должны", amount: 10000, date: "2026-09-01", dueDate: "2026-10-01" })
    await move(ledger, { kind: "repaid-to-me", debtId: lent.id, amount: 2000, date: "2026-10-10" })
    await move(ledger, { kind: "borrowed", person: "Будущий долг", amount: 10000, date: "2026-10-16", dueDate: "2026-10-16" })
    const dashboard = ledger.dashboard({ mode: "month", offset: 0 })
    expect(dashboard.debts.asOf).toBe("2026-10-15")
    expect(dashboard.debts.borrowed.items.map((item) => [item.operation.person, item.overdue])).toEqual([
      ["Просрочен", true], ["Сегодня", false], ["Ноябрь", false], ["Без срока", false]
    ])
    expect(dashboard.debts.reserve).toBe(20000)
    expect(dashboard.debts.borrowed.repaidInPeriod).toBe(0)
    expect(dashboard.debts.lent).toMatchObject({ remaining: 8000, repaidInPeriod: 2000 })
    expect(dashboard.debts.borrowed.remaining).toBe(40000)
  })

  it("сохраняет дату возврата при восстановлении резервной копии и синхронизации", async () => {
    const { ledger } = await october()
    const debt = await move(ledger, { kind: "borrowed", person: "Петя", amount: 100000, dueDate: "2026-10-31" })
    const backup = await ledger.exportBackup()
    const restored = await october()
    expect((await restored.ledger.importBackup(backup)).ok).toBe(true)
    expect(restored.ledger.operation(debt.id)?.dueDate).toBe("2026-10-31")
    const other = await october()
    await other.ledger.sync.receive(ledger.pendingChanges(), 1)
    expect(other.ledger.dashboard({ mode: "month", offset: 0 }).debts.reserve).toBe(100000)
    const invalid = backup.replace('"dueDate": "2026-10-31"', '"dueDate": "2026-02-30"')
    expect((await other.ledger.previewBackup(invalid)).ok).toBe(false)
  })

  it("сохраняет закрытый в периоде долг и пересчитывает историю при удалении и отмене", async () => {
    const { ledger } = await october()
    const debt = await move(ledger, { kind: "borrowed", person: "Петя", amount: 100000, date: "2026-08-01", dueDate: "2026-09-01" })
    const repayment = await move(ledger, { kind: "repaid-by-me", debtId: debt.id, date: "2026-09-30" })
    expect(ledger.dashboard({ mode: "month", offset: -1 }).debts.borrowed).toMatchObject({
      remaining: 0, repaidInPeriod: 100000, items: [{ remaining: 0, overdue: false }]
    })
    expect(ledger.dashboard({ mode: "month", offset: 0 }).debts.borrowed.items).toEqual([])
    const undoRepayment = await ledger.deleteOperation(repayment.id)
    expect(ledger.dashboard({ mode: "month", offset: -1 }).debts.borrowed.remaining).toBe(100000)
    expect(ledger.dashboard({ mode: "month", offset: 0 }).debts.reserve).toBe(100000)
    await undoRepayment()
    const undoDebt = await ledger.deleteOperation(debt.id)
    expect(ledger.dashboard({ mode: "month", offset: -1 }).debts.borrowed.items).toEqual([])
    await undoDebt()
    expect(ledger.dashboard({ mode: "month", offset: -1 }).debts.borrowed.repaidInPeriod).toBe(100000)
  })

  it("использует границы зарплатного периода и сохраняет прошлые свободные деньги", async () => {
    const { ledger } = await october()
    const debt = await move(ledger, { kind: "borrowed", person: "Петя", amount: 100000, date: "2026-09-01", dueDate: "2026-10-19" })
    await move(ledger, { kind: "repaid-by-me", debtId: debt.id, amount: 15000, date: "2026-10-04" })
    const before = ledger.dashboard({ mode: "pay", offset: -1 })
    expect(before.period).toMatchObject({ start: "2026-09-20", end: "2026-10-04" })
    expect(before.debts).toMatchObject({ asOf: "2026-10-04", reserve: 0, borrowed: { remaining: 85000, repaidInPeriod: 15000 } })
    expect(before.free).toBe(-15000)
    expect(ledger.dashboard({ mode: "pay", offset: 0 }).debts.reserve).toBe(85000)
    await move(ledger, { kind: "repaid-by-me", debtId: debt.id, amount: 20000, date: "2026-10-10" })
    expect(ledger.dashboard({ mode: "pay", offset: -1 }).free).toBe(-15000)
    expect(ledger.dashboard({ mode: "pay", offset: 0 }).debts.borrowed).toMatchObject({ remaining: 65000, repaidInPeriod: 20000 })
    await ledger.updateOperation(debt.id, { dueDate: "2026-10-20" })
    expect(ledger.dashboard({ mode: "pay", offset: 0 }).debts.reserve).toBe(0)
  })

  it("новые долги не уменьшают сумму погашений за период", async () => {
    const { ledger } = await october()
    const debt = await move(ledger, { kind: "borrowed", person: "Петя", amount: 100000, date: "2026-09-01" })
    await move(ledger, { kind: "borrowed", person: "Петя", amount: 10000 })
    await move(ledger, { kind: "repaid-by-me", debtId: debt.id, amount: 15000 })
    expect(ledger.dashboard({ mode: "month", offset: 0 }).debts.borrowed).toMatchObject({ remaining: 95000, repaidInPeriod: 15000 })
  })

  it("восстанавливает остаток и погашения выбранного месяца по датам", async () => {
    const { ledger } = await october()
    const debt = await move(ledger, { kind: "borrowed", person: "Петя", amount: 100000, date: "2026-08-01" })
    await move(ledger, { kind: "repaid-by-me", debtId: debt.id, amount: 15000, date: "2026-09-20" })
    await move(ledger, { kind: "repaid-by-me", debtId: debt.id, amount: 20000, date: "2026-10-10" })
    await move(ledger, { kind: "borrowed", person: "Маша", amount: 10000, date: "2026-10-01" })
    expect(ledger.dashboard({ mode: "month", offset: -1 }).debts).toMatchObject({
      asOf: "2026-09-30", reserve: 0,
      borrowed: { remaining: 85000, repaidInPeriod: 15000, items: [{ remaining: 85000, repaidInPeriod: 15000 }] }
    })
    expect(ledger.dashboard({ mode: "month", offset: 0 }).debts.borrowed).toMatchObject({ remaining: 75000, repaidInPeriod: 20000 })
  })
})
