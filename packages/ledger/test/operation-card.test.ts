import { describe, expect, it, vi } from "vitest"
import { readBackup, recurringOperation, recurringTemplate } from "./helpers"
import { add, categoryId, makeLedger, testClock } from "./support"

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
    ).toMatchObject({ ok: true })

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
    const undo = await ledger.deleteOperation(op.id)
    expect(ledger.operation(op.id)).toBeUndefined()
    expect(ledger.days()).toEqual([])
    expect(ledger.preview("тишка 1").categoryId).toBeNull()

    await undo()
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

describe("категория по исправленному описанию", () => {
  it("подставляет словарь, сохраняет категорию без совпадения и уважает явный выбор", async () => {
    const { ledger } = await makeLedger()
    const op = await add(ledger, "такси 250")
    await ledger.updateOperation(op.id, { description: "кофе" })
    expect(ledger.operation(op.id)).toMatchObject({ description: "кофе", category: { name: "Кафе" } })
    await ledger.updateOperation(op.id, { description: "абракадабра" })
    expect(ledger.operation(op.id)?.category?.name).toBe("Кафе")
    await ledger.updateOperation(op.id, { description: "продукты", categoryId: categoryId(ledger, "Одежда") })
    expect(ledger.operation(op.id)?.category?.name).toBe("Одежда")
  })

  it("история побеждает словарь; отмена возвращает прежнюю историю и категорию", async () => {
    const { ledger, clock } = await makeLedger()
    await add(ledger, "кофе 100", { categoryId: categoryId(ledger, "Продукты") })
    clock.advance(1000)
    const op = await add(ledger, "такси 250")
    const result = await ledger.updateOperation(op.id, { description: "кофе" })
    if (!result.ok) {
      throw new Error(result.problem)
    }
    expect(ledger.operation(op.id)?.category?.name).toBe("Продукты")
    expect(ledger.suggestCategory("кофе", "expense")).toMatchObject({ categoryId: "food", source: "history" })
    await result.undo()
    expect(ledger.operation(op.id)).toMatchObject({ description: "такси", category: { name: "Транспорт" } })
    expect(ledger.suggestCategory("такси", "expense")).toMatchObject({ categoryId: "transport", source: "history" })
  })

  it("подсказка и правка работают со свободным описанием без разбора суммы и знака дохода", async () => {
    const { ledger } = await makeLedger()
    const expense = await add(ledger, "такси 250")
    expect(ledger.suggestCategory("123 кофе", "expense")).toMatchObject({ categoryId: "cafe", source: "dictionary" })
    await ledger.updateOperation(expense.id, { description: "+123 кофе" })
    expect(ledger.operation(expense.id)).toMatchObject({ kind: "expense", amount: 25000, description: "+123 кофе", category: { name: "Кафе" } })
    const income = await add(ledger, "+подарок 100", { categoryId: "other-income" })
    await ledger.updateOperation(income.id, { description: "123 зарплата" })
    expect(ledger.operation(income.id)).toMatchObject({ kind: "income", category: { name: "Зарплата" } })
    expect(ledger.suggestCategory("кофе", "income")).toBeNull()
    expect(ledger.suggestCategory("абракадабра", "expense")).toBeNull()
  })
})

describe("повторить операцию сегодня", () => {
  it("копирует точные данные на сегодня пользователя, сохраняется, синхронизируется и отменяется", async () => {
    const clock = testClock("2026-09-28T23:30:00Z")
    const { ledger, reopen } = await makeLedger({ clock })
    await ledger.setTimeZone("Asia/Tokyo")
    const source = await add(ledger, "кофе 250", { categoryId: "food", date: "2026-09-01" })
    await ledger.sync.acknowledge(ledger.sync.pending())
    const result = await ledger.repeatOperation(source.id)
    if (!result.ok) {
      throw new Error(result.problem)
    }
    expect(result.operation.id).not.toBe(source.id)
    expect(result.operation).toMatchObject({ kind: "expense", amount: 25000, description: "кофе", category: { id: "food" }, date: "2026-09-29", pending: false, recurringId: null, refundOf: null })
    expect(ledger.operation(source.id)).toEqual(source)
    expect((await reopen()).operation(result.operation.id)).toEqual(result.operation)
    expect(ledger.sync.pending()).toMatchObject([{ id: result.operation.id, deleted: false }])
    await result.undo()
    expect(ledger.operation(result.operation.id)).toBeUndefined()
    expect(ledger.operation(source.id)).toEqual(source)
    expect(ledger.sync.pending()).toMatchObject([{ id: result.operation.id, deleted: true }])
  })

  it("подтверждённый регулярный доход повторяется независимо от шаблона", async () => {
    const { ledger } = await makeLedger()
    const source = recurringOperation({ kind: "income", categoryId: "salary", pending: false, recurringDate: "2026-09-25" })
    await ledger.sync.receive([source], 1)
    const result = await ledger.repeatOperation(source.id)
    if (!result.ok) {
      throw new Error(result.problem)
    }
    expect(result.operation).toMatchObject({ kind: "income", amount: source.data.amount, description: source.data.description, category: { id: "salary" }, recurringId: null, refundOf: null, pending: false })
    expect(ledger.sync.pending().find((record) => record.id === result.operation.id)?.data).not.toHaveProperty("recurringDate")
    await ledger.deleteOperation(source.id)
    expect(ledger.operation(result.operation.id)).toEqual(result.operation)
  })

  it("отклоняет отсутствующие, удалённые, ожидающие операции, возвраты и движения", async () => {
    const { ledger } = await makeLedger()
    const expense = await add(ledger, "кофе 250")
    const refund = await ledger.addRefund(expense.id)
    if (!refund.ok) {
      throw new Error(refund.problem)
    }
    const movement = await ledger.addMovement({ kind: "lent", amount: 10000, person: "Пётр" })
    if (!movement.ok) {
      throw new Error(movement.problem)
    }
    const pending = recurringOperation()
    await ledger.sync.receive([pending], 1)
    const reject = { ok: false, problem: "not-repeatable" }
    for (const id of ["missing", refund.operation.id, movement.operation.id, pending.id]) {
      expect(await ledger.repeatOperation(id)).toEqual(reject)
    }
    await ledger.deleteOperation(expense.id)
    expect(await ledger.repeatOperation(expense.id)).toEqual(reject)
  })

  it("после ошибки сохранения повтор можно выполнить снова без дубликата", async () => {
    const { ledger, store, reopen } = await makeLedger()
    const source = await add(ledger, "кофе 250")
    vi.spyOn(store, "save").mockRejectedValueOnce(new Error("Хранилище недоступно"))
    await expect(ledger.repeatOperation(source.id)).rejects.toThrow("Хранилище недоступно")
    expect(ledger.search("кофе").count).toBe(1)
    expect((await reopen()).search("кофе").count).toBe(1)
    expect(await ledger.repeatOperation(source.id)).toMatchObject({ ok: true })
    expect(ledger.search("кофе").count).toBe(2)
  })

  it("повтор расхода выдаёт предупреждение о лимите", async () => {
    const { ledger } = await makeLedger()
    await ledger.setDashboardMode("month")
    await ledger.setCategoryLimit("cafe", 100000)
    const source = await add(ledger, "кофе 450")
    const result = await ledger.repeatOperation(source.id)
    if (!result.ok) {
      throw new Error(result.problem)
    }
    expect(result.warnings).toMatchObject([{ categoryId: "cafe", kind: "near" }])
    expect(ledger.dashboard({ mode: "month", offset: 0 }).expenses).toBe(90000)
    await result.undo()
    expect(ledger.dashboard({ mode: "month", offset: 0 }).expenses).toBe(45000)
  })
})

describe("дата регулярного появления после правки операции", () => {
  it("сохраняет исходную дату старой операции при первой и последующих правках даты", async () => {
    const { ledger, reopen } = await makeLedger({ clock: testClock("2026-09-20T12:00:00+03:00") })
    const source = recurringOperation()
    await ledger.sync.receive([recurringTemplate(), source], 1)
    await ledger.updateOperation(source.id, { date: "2026-09-26" })
    expect(ledger.sync.pending()).toMatchObject([{ id: source.id, data: { date: "2026-09-26", recurringDate: "2026-09-25" } }])
    await ledger.updateOperation(source.id, { date: "2026-09-27" })
    expect((await reopen()).sync.pending()).toMatchObject([{ id: source.id, data: { date: "2026-09-27", recurringDate: "2026-09-25" } }])
    expect(ledger.dashboard({ mode: "month", offset: 0 }).upcoming).toMatchObject({ total: 65000, items: [{ date: "2026-09-27" }] })
    const text = await ledger.exportBackup()
    const target = await makeLedger()
    expect(target.ledger.previewBackup(text)).toMatchObject({ ok: true })
    expect(await target.ledger.importBackup(text)).toMatchObject({ ok: true })
    expect(target.ledger.sync.pending()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: source.id, data: expect.objectContaining({ recurringDate: "2026-09-25" }) })
    ]))
    const backup = readBackup(text)
    const invalid = { ...backup, records: backup.records.map((record) => record.collection === "operations"
      ? { ...record, data: { ...record.data, recurringDate: "2026-02-30" } }
      : record) }
    expect(target.ledger.previewBackup(JSON.stringify(invalid))).toMatchObject({ ok: false })
  })
})
