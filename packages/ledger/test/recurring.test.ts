import { recurringOperationId } from "@fin/domain"
import { describe, expect, it } from "vitest"
import { categoryId, makeLedger } from "./support"

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
