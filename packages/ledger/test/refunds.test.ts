import { describe, expect, it } from "vitest"
import { add, makeLedger } from "./support"

describe("возвраты", () => {
  it("по умолчанию возвращается вся ещё не возвращённая сумма, сегодня", async () => {
    const { ledger } = await makeLedger()
    const jeans = await add(ledger, "джинсы 4000", { date: "2026-09-20" })
    const result = await ledger.addRefund(jeans.id)
    expect(result).toMatchObject({ ok: true })
    expect(ledger.refunds(jeans.id)).toMatchObject({
      refunded: 400000,
      remaining: 0,
      items: [{ kind: "refund", amount: 400000, date: "2026-09-28", description: "джинсы", refundOf: jeans.id }]
    })
  })

  it("частичных возвратов может быть несколько, но в сумме не больше расхода", async () => {
    const { ledger } = await makeLedger()
    const jeans = await add(ledger, "джинсы 4000")
    expect(await ledger.addRefund(jeans.id, { amount: 150000 })).toMatchObject({ ok: true })
    expect(await ledger.addRefund(jeans.id, { amount: 200000, date: "2026-09-27" })).toMatchObject({ ok: true })
    expect(ledger.refunds(jeans.id)).toMatchObject({ refunded: 350000, remaining: 50000 })
    expect(await ledger.addRefund(jeans.id, { amount: 50001 })).toEqual({ ok: false, problem: "too-much" })
    expect(await ledger.addRefund(jeans.id, { amount: 0 })).toEqual({ ok: false, problem: "bad-amount" })
    expect(await ledger.addRefund(jeans.id)).toMatchObject({ ok: true })
    expect(ledger.refunds(jeans.id)!.remaining).toBe(0)
    expect(await ledger.addRefund(jeans.id)).toEqual({ ok: false, problem: "too-much" })
  })

  it("возврат только у расхода", async () => {
    const { ledger } = await makeLedger()
    const salary = await add(ledger, "+зарплата 100000")
    expect(await ledger.addRefund(salary.id)).toEqual({ ok: false, problem: "not-refundable" })
    expect(ledger.refunds(salary.id)).toBeUndefined()
  })

  it("правка возврата и расхода не даёт вернуть больше, чем потрачено", async () => {
    const { ledger } = await makeLedger()
    const jeans = await add(ledger, "джинсы 4000")
    const refund = await ledger.addRefund(jeans.id, { amount: 300000 })
    if (!refund.ok) throw new Error()
    expect(await ledger.updateOperation(jeans.id, { amount: 200000 })).toEqual({ ok: false, problem: "below-refunds" })
    expect(await ledger.updateOperation(refund.operation.id, { amount: 400001 })).toEqual({ ok: false, problem: "bad-amount" })
    expect(await ledger.updateOperation(refund.operation.id, { amount: 400000 })).toMatchObject({ ok: true })
  })

  it("джинсы куплены в августе, сданы в сентябре → «Одежда» за сентябрь уменьшается, август не меняется", async () => {
    const { ledger } = await makeLedger()
    const jeans = await add(ledger, "джинсы 4000", { date: "2026-08-15" })
    await add(ledger, "футболка 1500", { date: "2026-09-10" })
    await ledger.addRefund(jeans.id, { date: "2026-09-20" })

    const august = ledger.dashboard({ mode: "month", offset: -1 })
    expect(august.categories.map((c) => [c.name, c.amount])).toEqual([["Одежда", 400000]])
    expect(august.expenses).toBe(400000)

    const september = ledger.dashboard({ mode: "month", offset: 0 })
    expect(september.expenses).toBe(-250000)
    expect(september.income).toBe(0)
    // категория ушла в минус: сумма отрицательная, доли нет, операции видны
    expect(september.categories).toMatchObject([
      { name: "Одежда", amount: -250000, share: null, operations: [{ kind: "refund" }, { kind: "expense" }] }
    ])
  })

  it("возврат следует за категорией исходного расхода", async () => {
    const { ledger } = await makeLedger()
    const jeans = await add(ledger, "джинсы 4000")
    await ledger.addRefund(jeans.id, { amount: 100000 })
    await ledger.updateOperation(jeans.id, { categoryId: "gifts" })
    expect(ledger.dashboard({ mode: "month", offset: 0 }).categories).toMatchObject([{ name: "Подарки", amount: 300000 }])
  })

  it("возврат виден в списке и уменьшает итог дня", async () => {
    const { ledger } = await makeLedger()
    const jeans = await add(ledger, "джинсы 4000", { date: "2026-09-20" })
    await ledger.addRefund(jeans.id, { amount: 100000 })
    await add(ledger, "кофе 250")
    const today = ledger.days()[0]!
    expect(today.expenseTotal).toBe(25000 - 100000)
    expect(today.items.map((o) => [o.kind, o.description, o.category.name])).toEqual([
      ["expense", "кофе", "Кафе"],
      ["refund", "джинсы", "Одежда"]
    ])
  })

  it("удаление исходного расхода удаляет и его возвраты; «Отменить» возвращает всё", async () => {
    const { ledger } = await makeLedger()
    const jeans = await add(ledger, "джинсы 4000")
    await ledger.addRefund(jeans.id, { amount: 100000 })
    const undo = await ledger.deleteOperation(jeans.id)
    expect(ledger.days()).toEqual([])
    await undo()
    expect(ledger.refunds(jeans.id)).toMatchObject({ refunded: 100000 })
  })

  it("возвраты синхронизируются и не учат подстановку", async () => {
    const { ledger } = await makeLedger()
    const jeans = await add(ledger, "джинсы 4000")
    await ledger.sync.acknowledge(ledger.sync.pending())
    await ledger.addRefund(jeans.id)
    expect(ledger.sync.pending()).toEqual([
      expect.objectContaining({ collection: "operations", data: expect.objectContaining({ kind: "refund", refundOf: jeans.id }) })
    ])
    expect(ledger.preview("джинсы 1").categoryId).toBe("clothes")
  })
})

describe("возвраты и синхронизация", () => {
  it("возврат к расходу, удалённому на другом устройстве, не влияет на итоги", async () => {
    const { ledger } = await makeLedger()
    const jeans = await add(ledger, "джинсы 4000")
    const refund = await ledger.addRefund(jeans.id, { amount: 100000 })
    if (!refund.ok) throw new Error()
    const deletedElsewhere = { ...ledger.sync.pending().find((r) => r.id === jeans.id)!, deleted: true, updatedAt: Date.now() * 2 }
    await ledger.sync.receive([deletedElsewhere], 1)
    expect(ledger.days()).toEqual([])
    expect(ledger.dashboard({ mode: "month", offset: 0 }).expenses).toBe(0)
  })
})
