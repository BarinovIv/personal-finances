import { describe, expect, it } from "vitest"
import { memoryStore, openLedger } from "@fin/ledger"
import { readBackup } from "./helpers"
import { add, addGoal, makeLedger } from "./support"

describe("полная резервная копия", () => {
  it("возвращает все виды данных, связи, удаления, настройки, версии и очередь синхронизации", async () => {
    const { ledger } = await makeLedger()
    await ledger.device.adopt("user-1")
    const category = await ledger.addCategory("expense", "Своя", { color: "green", icon: "food" })
    if (!category.ok) throw new Error()
    await ledger.setCategoryLimit(category.category.id, 100000)
    const expense = await add(ledger, "покупка 500", { categoryId: category.category.id })
    await ledger.addRefund(expense.id, { amount: 10000 })
    await add(ledger, "+зарплата 1000")
    const goal = await addGoal(ledger, { name: "Отпуск", target: 1000000, deadline: "2027-01-01" })
    await ledger.addMovement({ kind: "saved", goalId: goal.id, amount: 20000 })
    await ledger.addMovement({ kind: "withdrawn", goalId: goal.id, amount: 5000 })
    await ledger.archiveGoal(goal.id, true)
    for (const kind of ["lent", "borrowed"] as const) {
      const debt = await ledger.addMovement({ kind, person: "Петя", amount: 10000 })
      if (!debt.ok) throw new Error()
      await ledger.addMovement({ kind: kind === "lent" ? "repaid-to-me" : "repaid-by-me", debtId: debt.operation.id, amount: 5000 })
    }
    const recurring = await ledger.addRecurring({ kind: "expense", description: "Интернет", amount: 70000, categoryId: "subscriptions", dayOfMonth: 28 })
    if (!recurring.ok) throw new Error()
    await ledger.sync.receive([{ collection: "operations", id: "pending-op", updatedAt: 1, deleted: false, data: { kind: "expense", amount: 70000, description: "Интернет", categoryId: "subscriptions", date: "2026-09-28", createdAt: 1, categorizedAt: 1, refundOf: null, recurringId: recurring.id, pending: true } }], 99)
    await ledger.markRecurringOperationSeen("pending-op")
    await ledger.setPaydays([4, 20])
    await ledger.setTimeZone("Europe/London")
    await ledger.setDashboardMode("month")
    const removed = await add(ledger, "удалённая 1", { categoryId: "other" })
    await ledger.deleteOperation(removed.id)
    const removedCategory = await ledger.addCategory("income", "Удалённая категория")
    if (!removedCategory.ok) throw new Error()
    await ledger.deleteCategory(removedCategory.category.id)
    const oldTemplate = await ledger.addRecurring({ kind: "income", description: "Премия", amount: 5000, categoryId: "salary", dayOfMonth: 1 })
    if (!oldTemplate.ok) throw new Error()
    await ledger.deleteRecurring(oldTemplate.id)
    const removedGoal = await addGoal(ledger, { name: "Удалённая цель", target: 100 })
    await ledger.deleteGoal(removedGoal.id)
    await ledger.sync.acknowledge(ledger.pendingChanges())
    const text = await ledger.exportBackup()
    const source = readBackup(text)!
    expect(source.outbox).toEqual([])
    expect(source.records.some((record) => record.deleted)).toBe(true)
    const target = await makeLedger()
    await target.ledger.device.adopt("user-1")
    expect(target.ledger.previewBackup(text)).toMatchObject({ ok: true, added: source.records.length })
    expect(await target.ledger.importBackup(text)).toMatchObject({ ok: true, added: source.records.length })
    const restored = readBackup(await target.ledger.exportBackup())!
    expect(restored.records).toEqual(source.records)
    expect(restored.userId).toBe("user-1")
    expect(target.ledger.sync.cursor()).toBe(0)
    expect(target.ledger.pendingChanges()).toHaveLength(source.records.length)
    expect(target.ledger.hasSeenRecurringOperation("pending-op")).toBe(true)
    expect(target.ledger.dashboardMode()).toBe("month")
    expect(target.ledger.operation("pending-op")?.pending).toBe(true)
    expect(target.ledger.refunds(expense.id)?.refunded).toBe(10000)
    expect(target.ledger.goalSavings(goal.id)).toBe(15000)
    const reopened = await target.reopen()
    expect(readBackup(await reopened.exportBackup())?.records).toEqual(source.records)
    expect(await reopened.importBackup(text)).toMatchObject({ ok: true, added: 0, updated: 0, unchanged: source.records.length })
  })

  it("объединяет по id и времени, сохраняет новые местные данные и не понижает версии", async () => {
    const source = await makeLedger()
    const expense = await add(source.ledger, "кофе 200", { categoryId: "cafe" })
    const old = await source.ledger.exportBackup()
    const target = await makeLedger()
    await target.ledger.importBackup(old)
    const unrelated = await add(target.ledger, "чай 100", { categoryId: "cafe" })
    await target.ledger.updateOperation(expense.id, { amount: 30000 })
    expect(await target.ledger.importBackup(old)).toMatchObject({ ok: true, skipped: 1 })
    expect(target.ledger.operation(expense.id)?.amount).toBe(30000)
    expect(target.ledger.operation(unrelated.id)).toBeDefined()
    const sourceRecord = readBackup(old)!.records[0]!
    const conflict = { ...readBackup(old)!, records: [{ ...sourceRecord, data: { ...sourceRecord.data, description: "конфликт" } }] }
    expect(source.ledger.previewBackup(JSON.stringify(conflict))).toMatchObject({ ok: false })
    expect(await source.ledger.importBackup(JSON.stringify(conflict))).toMatchObject({ ok: false })
    expect(source.ledger.operation(expense.id)?.description).toBe("кофе")
  })

  it("проверяет владельца, версию, все поля и ссылки без частичного сохранения", async () => {
    const source = await makeLedger()
    await add(source.ledger, "кофе 200", { categoryId: "cafe" })
    const backup = readBackup(await source.ledger.exportBackup())!
    const record = backup.records[0]!
    const target = await makeLedger()
    const invalid = [
      "{",
      JSON.stringify({ ...backup, version: 2 }),
      JSON.stringify({ ...backup, userId: "другой" }),
      JSON.stringify({ ...backup, records: [record, record] }),
      JSON.stringify({ ...backup, records: [{ ...record, updatedAt: Number.MAX_SAFE_INTEGER }] }),
      JSON.stringify({ ...backup, records: [{ ...record, data: { ...record.data, date: "2026-02-31" } }] }),
      JSON.stringify({ ...backup, records: [{ ...record, data: { ...record.data, amount: 0 } }] }),
      JSON.stringify({ ...backup, records: [{ ...record, data: { ...record.data, categoryId: "нет-категории" } }] }),
      JSON.stringify({ ...backup, meta: { password: "секрет" } }),
      JSON.stringify({ ...backup, outbox: ["operations:нет"] })
    ]
    for (const text of invalid) {
      expect(target.ledger.previewBackup(text)).toMatchObject({ ok: false })
      expect(await target.ledger.importBackup(text)).toMatchObject({ ok: false })
    }
    expect(readBackup(await target.ledger.exportBackup())?.records).toEqual([])
    await target.ledger.device.adopt("user-1")
    expect(await target.ledger.importBackup(JSON.stringify(backup))).toMatchObject({ ok: false })
  })

  it("восстанавливает локальный режим и экспортирует только известные метаданные", async () => {
    const store = memoryStore()
    await store.save({ meta: { password: "secret", syncCursor: 200 } })
    const source = await makeLedger({ store })
    await source.ledger.setDashboardMode("month")
    const backup = readBackup(await source.ledger.exportBackup())!
    expect(backup.meta.password).toBeUndefined()
    const target = await makeLedger()
    await target.ledger.setDashboardMode("pay")
    expect(await target.ledger.importBackup(JSON.stringify(backup))).toMatchObject({ ok: true, localChanges: 1 })
    expect(target.ledger.dashboardMode()).toBe("month")
    expect(target.ledger.sync.cursor()).toBe(0)
  })

  it("ошибка сохранения не публикует данные, повторный импорт работает", async () => {
    const source = await makeLedger()
    await add(source.ledger, "кофе 200", { categoryId: "cafe" })
    const backup = await source.ledger.exportBackup()
    const store = memoryStore()
    let fail = true
    const target = await openLedger({ store: { load: () => store.load(), save: async (change) => { if (fail) { fail = false; throw new Error("диск") }; await store.save(change) } } })
    await expect(target.importBackup(backup)).rejects.toThrow("диск")
    expect(target.previewBackup(backup)).toMatchObject({ ok: true, added: 1 })
    expect(target.days()).toEqual([])
    expect(await target.importBackup(backup)).toMatchObject({ ok: true, added: 1 })
    const reopened = await openLedger({ store })
    expect(reopened.previewBackup(backup)).toMatchObject({ ok: true, unchanged: 1 })
  })

  it("одновременные импорты повторно проверяют исходные id", async () => {
    const source = await makeLedger()
    await add(source.ledger, "кофе 200", { categoryId: "cafe" })
    const text = await source.ledger.exportBackup()
    const target = await makeLedger()
    const results = await Promise.all([target.ledger.importBackup(text), target.ledger.importBackup(text)])
    expect(results[0]).toMatchObject({ ok: true, added: 1 })
    expect(results[1]).toMatchObject({ ok: true, added: 0, unchanged: 1 })
  })
  it("изменение данных заблокировано до завершения восстановления копии", async () => {
    const source = await makeLedger()
    const operation = await add(source.ledger, "кофе 100", { categoryId: "cafe" })
    const old = await source.ledger.exportBackup()
    source.clock.advance(1000000)
    await source.ledger.addRefund(operation.id, { amount: 10000 })
    const newer = await source.ledger.exportBackup()
    const store = memoryStore()
    let stalled = false
    let release: () => void = () => {}
    let markStarted: () => void = () => {}
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    const target = await makeLedger({ store: {
      load: () => store.load(),
      save: async (change) => {
        if (stalled) { stalled = false; await new Promise<void>((resolve) => { release = resolve; markStarted() }) }
        await store.save(change)
      }
    } })
    await target.ledger.importBackup(old)
    stalled = true
    const importing = target.ledger.importBackup(newer)
    await started
    await expect(target.ledger.updateOperation(operation.id, { amount: 5000 })).rejects.toThrow("Выполняется восстановление")
    release()
    expect(await importing).toMatchObject({ ok: true, added: 1, unchanged: 1 })
    expect(await target.ledger.updateOperation(operation.id, { amount: 40000 })).toMatchObject({ ok: true })
    expect(target.ledger.operation(operation.id)?.amount).toBe(40000)
    const reopened = await target.reopen()
    expect(reopened.operation(operation.id)?.amount).toBe(40000)
    expect(reopened.previewBackup(newer)).toMatchObject({ ok: true, skipped: 1 })
  })

  it("очистка устройства не позволяет отложенному импорту вернуть старые данные", async () => {
    const source = await makeLedger()
    await add(source.ledger, "кофе 200", { categoryId: "cafe" })
    const text = await source.ledger.exportBackup()
    const store = memoryStore()
    let release: () => void = () => {}
    let markStarted: () => void = () => {}
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    let calls = 0
    const target = await openLedger({ store: {
      load: () => store.load(),
      save: async (change) => {
        if (calls++ === 0) await new Promise<void>((resolve) => { release = resolve; markStarted() })
        await store.save(change)
      }
    } })
    const importing = target.importBackup(text)
    await started
    const clearing = target.device.clear()
    release()
    await expect(importing).rejects.toThrow("Данные устройства изменились")
    await clearing
    expect(target.days()).toEqual([])
    expect((await store.load()).records).toEqual([])
  })

  it("экспорт дожидается правки, поставленной в очередь во время предыдущего сохранения", async () => {
    const store = memoryStore()
    let releaseFirst: () => void = () => {}
    let releaseSecond: () => void = () => {}
    let firstStarted: () => void = () => {}
    let secondStarted: () => void = () => {}
    const first = new Promise<void>((resolve) => { firstStarted = resolve })
    const second = new Promise<void>((resolve) => { secondStarted = resolve })
    let calls = 0
    const ledger = await openLedger({ store: {
      load: () => store.load(),
      save: async (change) => {
        calls++
        if (calls === 1) await new Promise<void>((resolve) => { releaseFirst = resolve; firstStarted() })
        if (calls === 2) await new Promise<void>((resolve) => { releaseSecond = resolve; secondStarted() })
        await store.save(change)
      }
    } })
    const adding = add(ledger, "кофе 100", { categoryId: "cafe" })
    await first
    const operation = ledger.days()[0]!.items[0]!
    let exported = false
    const exporting = ledger.exportBackup().then((text) => { exported = true; return text })
    const editing = ledger.updateOperation(operation.id, { amount: 20000 })
    releaseFirst()
    await second
    expect(exported).toBe(false)
    releaseSecond()
    await adding
    await editing
    const backup = readBackup(await exporting)
    expect(backup.records[0]?.data).toMatchObject({ amount: 20000 })
    const reopened = await openLedger({ store })
    expect(readBackup(await reopened.exportBackup()).records).toEqual(backup.records)
  })

})
