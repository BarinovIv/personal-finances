import { describe, expect, it } from "vitest"
import { add, categoryId, makeLedger } from "./support"

describe("карточка операции: правка и удаление", () => {
  it("все поля редактируются; список и итоги обновляются", async () => {
    const { ledger, clock } = await makeLedger()
    const op = await add(ledger, "кофе 250")
    clock.advance(1000)
    expect(
      await ledger.updateOperation(op.id, {
        amount: 32000,
        description: "капучино с собой",
        categoryId: categoryId(ledger, "Продукты"),
        date: "2026-09-27"
      })
    ).toEqual({ ok: true })

    expect(ledger.operation(op.id)).toMatchObject({
      amount: 32000,
      description: "капучино с собой",
      date: "2026-09-27",
      category: { name: "Продукты" },
      createdAt: op.createdAt
    })
    expect(ledger.days().map((d) => [d.label, d.expenseTotal])).toEqual([["Вчера", 32000]])
  })

  it("меняю категорию у старой операции «кофе» → следующий «кофе» подставляется в новую", async () => {
    const { ledger, clock } = await makeLedger()
    const old = await add(ledger, "кофе 250", { date: "2026-09-01" })
    clock.advance(1000)
    await add(ledger, "кофе 300")
    expect(ledger.preview("кофе 100").categoryId).toBe(categoryId(ledger, "Кафе"))

    clock.advance(1000)
    await ledger.updateOperation(old.id, { categoryId: categoryId(ledger, "Продукты") })
    expect(ledger.preview("кофе 100").categoryId).toBe(categoryId(ledger, "Продукты"))
  })

  it("неверные правки не сохраняются", async () => {
    const { ledger } = await makeLedger()
    const op = await add(ledger, "кофе 250")
    expect(await ledger.updateOperation(op.id, { amount: 0 })).toEqual({ ok: false, problem: "bad-amount" })
    expect(await ledger.updateOperation(op.id, { description: "  " })).toEqual({ ok: false, problem: "no-description" })
    expect(await ledger.updateOperation(op.id, { categoryId: categoryId(ledger, "Зарплата") })).toEqual({
      ok: false,
      problem: "bad-category"
    })
    expect(await ledger.updateOperation("нет-такой", { amount: 1 })).toEqual({ ok: false, problem: "not-found" })
    expect(ledger.operation(op.id)!.amount).toBe(25000)
  })

  it("удаление можно отменить", async () => {
    const { ledger } = await makeLedger()
    const op = await add(ledger, "тишка 10500", { categoryId: categoryId(ledger, "Одежда") })
    await ledger.deleteOperation(op.id)
    expect(ledger.operation(op.id)).toBeUndefined()
    expect(ledger.days()).toEqual([])
    expect(ledger.preview("тишка 1").categoryId).toBeNull()

    await ledger.restoreOperation(op.id)
    expect(ledger.operation(op.id)!.description).toBe("тишка")
    expect(ledger.preview("тишка 1").categoryId).toBe(categoryId(ledger, "Одежда"))
  })

  it("правки и удаления уходят в очередь синхронизации", async () => {
    const { ledger, clock } = await makeLedger()
    const op = await add(ledger, "кофе 250")
    await ledger.sync.acknowledge(ledger.sync.pending())
    expect(ledger.sync.pending()).toEqual([])

    clock.advance(1000)
    await ledger.updateOperation(op.id, { amount: 30000 })
    expect(ledger.sync.pending()).toEqual([
      expect.objectContaining({ id: op.id, deleted: false, updatedAt: Date.parse("2026-09-28T12:00:01+03:00") })
    ])
    await ledger.sync.acknowledge(ledger.sync.pending())

    clock.advance(1000)
    await ledger.deleteOperation(op.id)
    expect(ledger.sync.pending()).toEqual([
      expect.objectContaining({ id: op.id, deleted: true, updatedAt: Date.parse("2026-09-28T12:00:02+03:00") })
    ])
  })
})
