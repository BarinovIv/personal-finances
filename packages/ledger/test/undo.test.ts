import { describe, expect, it } from "vitest"
import { add, categoryId, makeLedger } from "./support"

describe("«Отменить» после изменения операции", () => {
  it("сохранил строку «шаурма 340 такси 500» → «Отменить» → обе операции исчезли", async () => {
    const { ledger } = await makeLedger()
    const saved = await ledger.submitEntries("шаурма 340 такси 500")
    if (!saved.ok) throw new Error()
    expect(ledger.days()[0]!.items).toHaveLength(2)

    expect(await saved.undo()).toEqual({ ok: true })
    expect(ledger.days()).toEqual([])
    expect(saved.operations.map((op) => ledger.operation(op.id))).toEqual([undefined, undefined])
  })

  it("правка 1 500 → 15 000 → «Отменить» → прежние сумма, описание, категория и дата", async () => {
    const { ledger, clock } = await makeLedger()
    const shirt = await add(ledger, "футболка 1500", { date: "2026-09-20" })
    clock.advance(1000)
    const edited = await ledger.updateOperation(shirt.id, {
      amount: 1500000,
      description: "пальто",
      categoryId: categoryId(ledger, "Подарки"),
      date: "2026-09-27"
    })
    if (!edited.ok) throw new Error()

    clock.advance(1000)
    expect(await edited.undo()).toEqual({ ok: true })
    expect(ledger.operation(shirt.id)).toMatchObject({
      amount: 150000,
      description: "футболка",
      category: { name: "Одежда" },
      date: "2026-09-20",
      createdAt: shirt.createdAt
    })
  })

  it("после отмены правки категории подстановка по истории — как до правки", async () => {
    const { ledger, clock } = await makeLedger()
    const old = await add(ledger, "кофе 250", { date: "2026-09-01" })
    clock.advance(1000)
    await add(ledger, "кофе 300")
    clock.advance(1000)
    const edited = await ledger.updateOperation(old.id, { categoryId: categoryId(ledger, "Продукты") })
    if (!edited.ok) throw new Error()
    expect(ledger.preview("кофе 100").categoryId).toBe(categoryId(ledger, "Продукты"))

    clock.advance(1000)
    await edited.undo()
    expect(ledger.preview("кофе 100").categoryId).toBe(categoryId(ledger, "Кафе"))
  })

  it("оформил возврат → «Отменить» → возврата нет, «Возврат» снова с прежней суммой по умолчанию", async () => {
    const { ledger } = await makeLedger()
    const jeans = await add(ledger, "джинсы 4000")
    await ledger.addRefund(jeans.id, { amount: 100000 })
    const refund = await ledger.addRefund(jeans.id, { amount: 50000 })
    if (!refund.ok) throw new Error()
    expect(ledger.refunds(jeans.id)).toMatchObject({ refunded: 150000, remaining: 250000 })

    expect(await refund.undo()).toEqual({ ok: true })
    expect(ledger.operation(refund.operation.id)).toBeUndefined()
    expect(ledger.refunds(jeans.id)).toMatchObject({ refunded: 100000, remaining: 300000 })
    expect(ledger.days()[0]!.items.map((o) => [o.kind, o.amount])).toEqual([
      ["refund", 100000],
      ["expense", 400000]
    ])
  })

  it("удалил расход → «Отменить» через 3 секунды → он на месте вместе с возвратами", async () => {
    const { ledger, clock } = await makeLedger()
    const jeans = await add(ledger, "джинсы 4000")
    await ledger.addRefund(jeans.id, { amount: 100000 })
    const undo = await ledger.deleteOperation(jeans.id)
    expect(ledger.days()).toEqual([])

    clock.advance(3000)
    expect(await undo()).toEqual({ ok: true })
    expect(ledger.operation(jeans.id)).toMatchObject({ description: "джинсы", amount: 400000 })
    expect(ledger.refunds(jeans.id)).toMatchObject({ refunded: 100000, remaining: 300000 })
    expect(ledger.preview("джинсы 1").categoryId).toBe(categoryId(ledger, "Одежда"))
  })
})

describe("«Отменить» и синхронизация", () => {
  it("отмена — обычная правка: другое устройство после синхронизации приходит к тому же", async () => {
    const { ledger: phone, clock } = await makeLedger()
    const { ledger: laptop } = await makeLedger({ clock })
    const deliver = async () => {
      await laptop.sync.receive(phone.sync.pending(), 1)
      await phone.sync.acknowledge(phone.sync.pending())
    }
    const jeans = await add(phone, "джинсы 4000")
    const refund = await phone.addRefund(jeans.id, { amount: 100000 })
    const saved = await phone.submitEntries("шаурма 340 такси 500")
    if (!refund.ok || !saved.ok) throw new Error()
    clock.advance(1000)
    const edited = await phone.updateOperation(jeans.id, { amount: 500000, categoryId: categoryId(phone, "Подарки") })
    if (!edited.ok) throw new Error()
    await deliver()

    clock.advance(1000)
    await saved.undo()
    await edited.undo()
    await refund.undo()
    await deliver()
    const deleted = await phone.deleteOperation(jeans.id)
    await deliver()
    clock.advance(3000)
    await deleted()
    await deliver()

    const state = (ledger: typeof phone) => ({ days: ledger.days(), refunds: ledger.refunds(jeans.id) })
    expect(state(phone)).toMatchObject({
      days: [{ items: [{ description: "джинсы", amount: 400000, category: { name: "Одежда" } }] }],
      refunds: { refunded: 0, remaining: 400000 }
    })
    expect(state(laptop)).toEqual(state(phone))
    expect(laptop.preview("джинсы 1").categoryId).toBe(categoryId(laptop, "Одежда"))
  })

  it("операцию уже поправили после изменения — отмена ничего не делает", async () => {
    const { ledger, clock } = await makeLedger()
    const saved = await ledger.submitEntries("кофе 250")
    if (!saved.ok) throw new Error()
    clock.advance(1000)
    await ledger.updateOperation(saved.operations[0]!.id, { amount: 30000 })

    expect(await saved.undo()).toEqual({ ok: false })
    expect(ledger.operation(saved.operations[0]!.id)).toMatchObject({ amount: 30000 })
  })

  it("повторная отмена ничего не делает", async () => {
    const { ledger } = await makeLedger()
    const saved = await ledger.submitEntries("кофе 250")
    if (!saved.ok) throw new Error()
    expect(await saved.undo()).toEqual({ ok: true })
    expect(await saved.undo()).toEqual({ ok: false })
  })
})
