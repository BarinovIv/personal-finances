import { occurrencesBetween, pendingOccurrences, recurringOperationId } from "@fin/domain"
import { describe, expect, it, vi } from "vitest"
import { add, categoryId, makeLedger, testClock } from "./support"

const addTemplate = async (
  ledger: Awaited<ReturnType<typeof makeLedger>>["ledger"],
  fields: { description: string; amount: number; dayOfMonth: number; kind?: "expense" | "income"; category?: string }
) => {
  const result = await ledger.addRecurring({
    kind: fields.kind ?? "expense",
    description: fields.description,
    amount: fields.amount,
    categoryId: categoryId(ledger, fields.category ?? "Подписки"),
    dayOfMonth: fields.dayOfMonth
  })
  if (!result.ok) throw new Error(result.problem)
  return result.id
}

describe("регулярные операции на устройстве", () => {
  it("шаблон: описание, сумма, категория, вид и число месяца; начинается сегодня", async () => {
    const { ledger } = await makeLedger()
    const id = await addTemplate(ledger, { description: "Интернет", amount: 65000, dayOfMonth: 1 })
    expect(ledger.recurring()).toMatchObject([
      {
        id,
        kind: "expense",
        description: "Интернет",
        amount: 65000,
        category: { name: "Подписки" },
        dayOfMonth: 1,
        status: "active",
        startDate: "2026-09-28",
        nextDate: "2026-10-01"
      }
    ])
    expect(ledger.sync.pending()).toEqual([expect.objectContaining({ collection: "recurring", id })])
  })

  it("неверные шаблоны не сохраняются", async () => {
    const { ledger } = await makeLedger()
    const base = { kind: "expense" as const, description: "Интернет", amount: 65000, categoryId: "subscriptions", dayOfMonth: 1 }
    expect(await ledger.addRecurring({ ...base, amount: 0 })).toEqual({ ok: false, problem: "bad-amount" })
    expect(await ledger.addRecurring({ ...base, description: " " })).toEqual({ ok: false, problem: "no-description" })
    expect(await ledger.addRecurring({ ...base, dayOfMonth: 32 })).toEqual({ ok: false, problem: "bad-day" })
    expect(await ledger.addRecurring({ ...base, categoryId: "salary" })).toEqual({ ok: false, problem: "bad-category" })
  })

  describe("регулярная операция из расхода", () => {
    it("сегодняшний расход не дублируется; новые настройки не меняют расход и его возвраты", async () => {
      const { ledger } = await makeLedger()
      const expense = await add(ledger, "Интернет 650", { categoryId: categoryId(ledger, "Подписки") })
      expect((await ledger.addRefund(expense.id, { amount: 10000 })).ok).toBe(true)
      const refunds = ledger.refunds(expense.id)
      const total = ledger.dashboard({ mode: "month", offset: 0 }).expenses
      const result = await ledger.makeRecurring(expense.id, {
        description: "  Интернет дома  ",
        amount: 70000,
        categoryId: categoryId(ledger, "Продукты"),
        dayOfMonth: 28
      })
      if (!result.ok) throw new Error(result.problem)
      const template = ledger.recurring()[0]!
      expect(template).toMatchObject({
        id: result.id,
        kind: "expense",
        description: "Интернет дома",
        amount: 70000,
        category: { name: "Продукты" },
        status: "active",
        startDate: "2026-09-29",
        nextDate: "2026-10-28"
      })
      expect(pendingOccurrences(result.id, template, () => false, ledger.today(), ledger.today())).toEqual([])
      expect(ledger.operation(expense.id)).toEqual({ ...expense, recurringId: result.id, updatedAt: expect.any(Number) })
      expect(ledger.refunds(expense.id)).toEqual(refunds)
      expect(ledger.dashboard({ mode: "month", offset: 0 }).expenses).toBe(total)
      await ledger.updateRecurring(result.id, { amount: 80000 })
      expect(ledger.operation(expense.id)?.amount).toBe(65000)
    })

    it("старый расход не догоняет прошлые месяцы; ближайшее списание видно в текущем месяце", async () => {
      const { ledger } = await makeLedger()
      const expense = await add(ledger, "Интернет 650", { date: "2026-07-30", categoryId: "subscriptions" })
      const result = await ledger.makeRecurring(expense.id, {
        description: expense.description,
        amount: expense.amount,
        categoryId: expense.category!.id,
        dayOfMonth: 30
      })
      if (!result.ok) throw new Error(result.problem)
      const template = ledger.recurring()[0]!
      expect(occurrencesBetween(template, "2026-07-01", ledger.today())).toEqual([])
      expect(template.nextDate).toBe("2026-09-30")
      expect(ledger.dashboard({ mode: "month", offset: 0 }).upcoming).toMatchObject({
        total: 65000,
        items: [{ templateId: result.id, date: "2026-09-30", amount: 65000 }]
      })
      expect(ledger.days().flatMap((day) => day.items)).toHaveLength(1)
    })

    it("31-е января повторяется 28-го февраля", async () => {
      const { ledger } = await makeLedger({ clock: testClock("2026-01-31T12:00:00+03:00") })
      const expense = await add(ledger, "Аренда 1000", { categoryId: "subscriptions" })
      const result = await ledger.makeRecurring(expense.id, {
        description: expense.description,
        amount: expense.amount,
        categoryId: expense.category!.id,
        dayOfMonth: 31
      })
      expect(result.ok).toBe(true)
      expect(ledger.recurring()[0]).toMatchObject({ startDate: "2026-02-01", nextDate: "2026-02-28" })
    })

    it("начинается завтра по часовому поясу пользователя", async () => {
      const { ledger } = await makeLedger({ clock: testClock("2026-09-28T20:30:00Z") })
      await ledger.setTimeZone("Asia/Novosibirsk")
      const expense = await add(ledger, "Интернет 650", { categoryId: "subscriptions" })
      expect(expense.date).toBe("2026-09-29")
      const result = await ledger.makeRecurring(expense.id, {
        description: expense.description,
        amount: expense.amount,
        categoryId: expense.category!.id,
        dayOfMonth: 29
      })
      expect(result.ok).toBe(true)
      expect(ledger.recurring()[0]).toMatchObject({ startDate: "2026-09-30", nextDate: "2026-10-29" })
    })

    it("неверные данные, отсутствующая операция и другие виды не оставляют правок", async () => {
      const { ledger } = await makeLedger()
      const expense = await add(ledger, "Интернет 650", { categoryId: "subscriptions" })
      const income = await add(ledger, "+Зарплата 1000", { categoryId: categoryId(ledger, "Зарплата") })
      const refund = await ledger.addRefund(expense.id, { amount: 10000 })
      const debt = await ledger.addMovement({ kind: "lent", amount: 10000, person: "Петя" })
      if (!refund.ok || !debt.ok) throw new Error("Не удалось создать операции")
      const deleted = await add(ledger, "Интернет 100", { categoryId: "subscriptions" })
      await ledger.deleteOperation(deleted.id)
      const before = ledger.pendingChanges()
      const input = { description: expense.description, amount: expense.amount, categoryId: "subscriptions", dayOfMonth: 28 }
      for (const amount of [0, -100, 1.5]) {
        expect(await ledger.makeRecurring(expense.id, { ...input, amount })).toEqual({ ok: false, problem: "bad-amount" })
      }
      for (const dayOfMonth of [0, 32, 1.5]) {
        expect(await ledger.makeRecurring(expense.id, { ...input, dayOfMonth })).toEqual({ ok: false, problem: "bad-day" })
      }
      expect(await ledger.makeRecurring(expense.id, { ...input, description: " " })).toEqual({ ok: false, problem: "no-description" })
      expect(await ledger.makeRecurring(expense.id, { ...input, categoryId: income.category!.id })).toEqual({ ok: false, problem: "bad-category" })
      expect(await ledger.makeRecurring(expense.id, { ...input, categoryId: "missing" })).toEqual({ ok: false, problem: "bad-category" })
      for (const id of ["missing", deleted.id]) {
        expect(await ledger.makeRecurring(id, input)).toEqual({ ok: false, problem: "not-found" })
      }
      expect(await ledger.makeRecurring(income.id, input)).toEqual({ ok: false, problem: "bad-category" })
      for (const id of [refund.operation.id, debt.operation.id]) {
        expect(await ledger.makeRecurring(id, input)).toEqual({ ok: false, problem: "unsupported-kind" })
      }
      expect(ledger.recurring()).toEqual([])
      expect(ledger.operation(expense.id)).toEqual(expense)
      expect(ledger.pendingChanges()).toEqual(before)
    })

    it("сохраняет шаблон и связь одной пачкой, запрещает повтор и отменяет обе записи", async () => {
      const { ledger, store, reopen } = await makeLedger()
      const expense = await add(ledger, "Интернет 650", { categoryId: "subscriptions" })
      await ledger.sync.acknowledge(ledger.pendingChanges())
      const save = vi.spyOn(store, "save")
      const input = { description: expense.description, amount: expense.amount, categoryId: "subscriptions", dayOfMonth: 28 }
      const result = await ledger.makeRecurring(expense.id, input)
      if (!result.ok) throw new Error(result.problem)
      expect(save).toHaveBeenCalledTimes(1)
      expect(save.mock.calls[0]![0].records).toHaveLength(2)
      expect(save.mock.calls[0]![0].outboxAdd).toHaveLength(2)
      const pending = ledger.pendingChanges()
      expect(pending).toHaveLength(2)
      expect(new Set(pending.map((record) => record.updatedAt)).size).toBe(1)
      expect(await ledger.makeRecurring(expense.id, input)).toEqual({ ok: false, problem: "already-recurring" })
      expect(save).toHaveBeenCalledTimes(1)
      expect(ledger.pendingChanges()).toEqual(pending)
      const restored = await reopen()
      expect(restored.recurring()).toEqual(ledger.recurring())
      expect(restored.operation(expense.id)).toEqual(ledger.operation(expense.id))
      expect(restored.pendingChanges()).toEqual(pending)
      expect(await result.undo()).toEqual({ ok: true })
      expect(ledger.recurring()).toEqual([])
      expect(ledger.operation(expense.id)).toEqual({ ...expense, updatedAt: expect.any(Number) })
      expect(ledger.pendingChanges()).toEqual(expect.arrayContaining([
        expect.objectContaining({ collection: "recurring", id: result.id, deleted: true }),
        expect.objectContaining({ collection: "operations", id: expense.id, data: expect.objectContaining({ recurringId: null }) })
      ]))
      const undone = await reopen()
      expect(undone.recurring()).toEqual([])
      expect(undone.operation(expense.id)?.recurringId).toBeNull()
      save.mockRestore()
    })
  })

  it("правка шаблона не меняет уже созданные операции", async () => {
    const { ledger } = await makeLedger()
    const id = await addTemplate(ledger, { description: "Интернет", amount: 65000, dayOfMonth: 10 })
    const generated = {
      collection: "operations" as const,
      id: recurringOperationId(id, { year: 2026, month: 9 }),
      updatedAt: 1,
      deleted: false,
      data: {
        kind: "expense" as const,
        amount: 65000,
        description: "Интернет",
        categoryId: "subscriptions",
        date: "2026-09-10",
        createdAt: 1,
        categorizedAt: 1,
        refundOf: null,
        recurringId: id
      }
    }
    await ledger.sync.receive([generated], 1)
    expect(await ledger.updateRecurring(id, { amount: 70000, description: "Интернет дома" })).toEqual({ ok: true, id })
    expect(ledger.operation(generated.id)).toMatchObject({ amount: 65000, description: "Интернет" })
    expect(ledger.recurring()[0]).toMatchObject({ amount: 70000, description: "Интернет дома" })
    // операции по шаблону помечены
    expect(ledger.days()[0]!.items[0]!.recurringId).toBe(id)
  })

  it("пауза, возобновление с сегодняшнего дня и завершение", async () => {
    const { ledger, clock } = await makeLedger()
    const id = await addTemplate(ledger, { description: "Спортзал", amount: 300000, dayOfMonth: 15 })
    await ledger.pauseRecurring(id)
    expect(ledger.recurring()[0]).toMatchObject({ status: "paused", nextDate: null })
    clock.set("2026-11-20T12:00:00+03:00")
    await ledger.resumeRecurring(id)
    expect(ledger.recurring()[0]).toMatchObject({ status: "active", startDate: "2026-11-20", nextDate: "2026-12-15" })
    await ledger.endRecurring(id)
    expect(ledger.recurring()[0]).toMatchObject({ status: "ended", nextDate: null })
  })

  it("удаление: созданные операции остаются, новых не будет; можно отменить", async () => {
    const { ledger } = await makeLedger()
    const id = await addTemplate(ledger, { description: "Кинопоиск", amount: 29900, dayOfMonth: 30 })
    const result = await ledger.deleteRecurring(id)
    if (!result.ok) throw new Error(result.problem)
    expect(ledger.recurring()).toEqual([])
    expect(ledger.dashboard({ mode: "month", offset: 0 }).upcoming.items).toEqual([])
    expect(ledger.sync.pending()).toEqual([expect.objectContaining({ collection: "recurring", id, deleted: true })])
    expect(await ledger.deleteRecurring(id)).toEqual({ ok: false, problem: "not-found" })
    expect(await result.undo()).toEqual({ ok: true })
    expect(ledger.recurring()).toMatchObject([{ id, description: "Кинопоиск", status: "active" }])
  })

  it("порядок: без перестановки — действующие по числу месяца; перетаскивание задаёт свой", async () => {
    const { ledger } = await makeLedger()
    const rent = await addTemplate(ledger, { description: "Аренда", amount: 500000, dayOfMonth: 20 })
    const net = await addTemplate(ledger, { description: "Интернет", amount: 65000, dayOfMonth: 1 })
    const gym = await addTemplate(ledger, { description: "Спортзал", amount: 300000, dayOfMonth: 15 })
    await ledger.pauseRecurring(net)
    const names = () => ledger.recurring().map((r) => r.description)
    expect(names()).toEqual(["Спортзал", "Аренда", "Интернет"])

    await ledger.reorderRecurring([net, rent, gym])
    expect(names()).toEqual(["Интернет", "Аренда", "Спортзал"])
    // правка и пауза место не меняют
    await ledger.updateRecurring(rent, { amount: 550000 })
    await ledger.resumeRecurring(net)
    expect(names()).toEqual(["Интернет", "Аренда", "Спортзал"])
    // новая — в конце
    await addTemplate(ledger, { description: "iCloud", amount: 14900, dayOfMonth: 3 })
    expect(names()).toEqual(["Интернет", "Аренда", "Спортзал", "iCloud"])
  })

  it("перестановка записывает только сдвинутые", async () => {
    const { ledger, clock } = await makeLedger()
    const a = await addTemplate(ledger, { description: "А", amount: 100, dayOfMonth: 1 })
    const b = await addTemplate(ledger, { description: "Б", amount: 100, dayOfMonth: 2 })
    const c = await addTemplate(ledger, { description: "В", amount: 100, dayOfMonth: 3 })
    await ledger.reorderRecurring([a, b, c])
    const stamps = () => new Map(ledger.pendingChanges().map((r) => [r.id, r.updatedAt]))
    const before = stamps()
    clock.advance(1000)
    await ledger.reorderRecurring([a, c, b])
    const after = stamps()
    expect([a, b, c].filter((id) => after.get(id) !== before.get(id))).toEqual([b, c])
  })

  describe("предстоящие списания", () => {
    const setup = async () => {
      const { ledger } = await makeLedger()
      await addTemplate(ledger, { description: "Кинопоиск", amount: 29900, dayOfMonth: 30 })
      await addTemplate(ledger, { description: "Интернет", amount: 65000, dayOfMonth: 1 })
      await addTemplate(ledger, { description: "iCloud", amount: 14900, dayOfMonth: 3 })
      await addTemplate(ledger, { description: "Спортзал", amount: 300000, dayOfMonth: 28 })
      await addTemplate(ledger, { description: "Аренда гаража", amount: 500000, dayOfMonth: 31 })
      await addTemplate(ledger, { kind: "income", category: "Зарплата", description: "Зарплата", amount: 10000000, dayOfMonth: 29 })
      const paused = await addTemplate(ledger, { description: "Журнал", amount: 50000, dayOfMonth: 29 })
      await ledger.pauseRecurring(paused)
      return ledger
    }

    it("до конца календарного месяца: только расходы, без пауз; 31-е в сентябре — 30-е", async () => {
      const ledger = await setup()
      const d = ledger.dashboard({ mode: "month", offset: 0 })
      expect(d.upcoming.items.map((u) => [u.description, u.date, u.amount])).toEqual([
        ["Спортзал", "2026-09-28", 300000],
        ["Кинопоиск", "2026-09-30", 29900],
        ["Аренда гаража", "2026-09-30", 500000]
      ])
      expect(d.upcoming.total).toBe(829900)
    })

    it("до конца зарплатного периода — через границу месяца", async () => {
      const ledger = await setup()
      const d = ledger.dashboard({ mode: "pay", offset: 0 })
      expect(d.upcoming.items.map((u) => [u.description, u.date])).toEqual([
        ["Спортзал", "2026-09-28"],
        ["Кинопоиск", "2026-09-30"],
        ["Аренда гаража", "2026-09-30"],
        ["Интернет", "2026-10-01"],
        ["iCloud", "2026-10-03"]
      ])
    })

    it("уже созданная сегодня операция больше не предстоит; прошлые периоды без списаний", async () => {
      const ledger = await setup()
      const gym = ledger.recurring().find((r) => r.description === "Спортзал")!
      await ledger.sync.receive(
        [
          {
            collection: "operations",
            id: recurringOperationId(gym.id, { year: 2026, month: 9 }),
            updatedAt: 1,
            deleted: false,
            data: {
              kind: "expense",
              amount: 300000,
              description: "Спортзал",
              categoryId: "subscriptions",
              date: "2026-09-28",
              createdAt: 1,
              categorizedAt: 1,
              refundOf: null,
              recurringId: gym.id
            }
          }
        ],
        1
      )
      expect(ledger.dashboard({ mode: "month", offset: 0 }).upcoming.items.map((u) => u.description)).toEqual([
        "Кинопоиск",
        "Аренда гаража"
      ])
      expect(ledger.dashboard({ mode: "month", offset: -1 }).upcoming).toEqual({ items: [], total: 0 })
    })
  })
})
