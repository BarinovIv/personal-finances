import { describe, expect, it } from "vitest"
import type { Ledger } from "@fin/ledger"
import { add, addGoal, makeLedger, testClock } from "./support"

/** 29 сентября: зарплатный период 20.09–04.10. */
const on29th = () => makeLedger({ clock: testClock("2026-09-29T12:00:00+03:00") })

/** «Отложить» или «Снять» на цели; падает, если не сохранилось. */
const move = async (ledger: Ledger, kind: "saved" | "withdrawn", goalId: string, amount: number, date?: string) => {
  const result = await ledger.addMovement({ kind, goalId, amount, ...(date ? { date } : {}) })
  if (!result.ok) throw new Error(`${kind} не сохранилась: ${result.problem}`)
  return result.operation
}

describe("цели накоплений", () => {
  it("«Отпуск» 100 000, отложил 30 000 → прогресс 30%, свободные деньги −30 000, расходы не изменились", async () => {
    const { ledger } = await on29th()
    await add(ledger, "+зарплата 60000", { date: "2026-09-20" })
    await add(ledger, "продукты 3000", { date: "2026-09-21" })
    const before = ledger.dashboard({ mode: "pay", offset: 0 })

    const vacation = await addGoal(ledger, { name: "Отпуск", icon: "plane", target: 10000000 })
    expect(vacation).toMatchObject({ name: "Отпуск", icon: "plane", target: 10000000, saved: 0, percent: 0, reached: false })
    await move(ledger, "saved", vacation.id, 3000000)

    expect(ledger.goal(vacation.id)).toMatchObject({ saved: 3000000, percent: 30, reached: false })
    const after = ledger.dashboard({ mode: "pay", offset: 0 })
    expect(after.free).toBe(before.free - 3000000)
    expect(after.expenses).toBe(before.expenses)
    expect(after.categories).toEqual(before.categories)
  })

  it("снял 10 000 → накоплено 20 000, свободные деньги в периоде даты снятия +10 000", async () => {
    const { ledger } = await on29th()
    const vacation = await addGoal(ledger, { name: "Отпуск", target: 10000000 })
    await move(ledger, "saved", vacation.id, 3000000, "2026-08-10")
    const free = (offset: number) => ledger.dashboard({ mode: "pay", offset }).free
    const before = [free(-1), free(0)]

    await move(ledger, "withdrawn", vacation.id, 1000000, "2026-09-10")
    expect(ledger.goal(vacation.id)).toMatchObject({ saved: 2000000, percent: 20 })
    expect([free(-1), free(0)]).toEqual([before[0]! + 1000000, before[1]])
  })

  it("снять больше накопленного нельзя", async () => {
    const { ledger } = await on29th()
    const vacation = await addGoal(ledger, { name: "Отпуск", target: 10000000 })
    await move(ledger, "saved", vacation.id, 2000000)
    expect(await ledger.addMovement({ kind: "withdrawn", goalId: vacation.id, amount: 2000001 })).toEqual({
      ok: false,
      problem: "too-much"
    })
    expect(ledger.goal(vacation.id)!.saved).toBe(2000000)
  })

  it("срок через 5 месяцев, накоплено 20 000 из 100 000 → откладывать по 16 000 в месяц", async () => {
    const { ledger } = await on29th()
    const vacation = await addGoal(ledger, { name: "Отпуск", target: 10000000, deadline: "2027-02-28" })
    await move(ledger, "saved", vacation.id, 2000000)
    expect(ledger.goal(vacation.id)).toMatchObject({ deadline: "2027-02-28", perMonth: 1600000, overdue: false })
  })

  it("по N в месяц — с округлением вверх до рубля; в месяц срока — весь остаток; без срока — не считается", async () => {
    const { ledger } = await on29th()
    const perMonth = async (target: number, deadline: string | null) =>
      (await addGoal(ledger, { name: "Цель", target, deadline })).perMonth
    expect(await perMonth(10000000, "2026-12-01")).toBe(3333400)
    expect(await perMonth(10000000, "2026-09-30")).toBe(10000000)
    expect(await perMonth(10000000, "2026-10-01")).toBe(10000000)
    expect(await perMonth(10000000, null)).toBeNull()
  })

  it("достигнутая цель отмечается; откладывать больше не нужно", async () => {
    const { ledger } = await on29th()
    const phone = await addGoal(ledger, { name: "Телефон", target: 5000000, deadline: "2027-01-31" })
    await move(ledger, "saved", phone.id, 5500000)
    expect(ledger.goal(phone.id)).toMatchObject({ saved: 5500000, percent: 100, reached: true, perMonth: null, overdue: false })
  })

  it("срок прошёл, а цель не достигнута — просрочена, по N в месяц не считается", async () => {
    const { ledger, clock } = await on29th()
    const phone = await addGoal(ledger, { name: "Телефон", target: 5000000, deadline: "2026-10-15" })
    clock.set("2026-10-16T12:00:00+03:00")
    expect(ledger.goal(phone.id)).toMatchObject({ reached: false, perMonth: null, overdue: true })
  })

  it("архивная цель пропадает из действующих (блок на дашборде), остаётся в списке после них; из архива её можно вернуть", async () => {
    const { ledger } = await on29th()
    const vacation = await addGoal(ledger, { name: "Отпуск", target: 10000000 })
    await addGoal(ledger, { name: "Машина", target: 90000000 })
    await addGoal(ledger, { name: "Телефон", target: 5000000 })

    expect(await ledger.archiveGoal(vacation.id, true)).toMatchObject({ ok: true, goal: { archived: true } })
    expect(ledger.goals().map((g) => [g.name, g.archived])).toEqual([
      ["Машина", false],
      ["Телефон", false],
      ["Отпуск", true]
    ])
    expect(ledger.goals({ archived: false }).map((g) => g.name)).toEqual(["Машина", "Телефон"])
    await ledger.archiveGoal(vacation.id, false)
    expect(ledger.goals().map((g) => g.name)).toEqual(["Отпуск", "Машина", "Телефон"])
  })

  it("цель с накоплениями удалить нельзя; пустую — можно, «Отменить» возвращает её", async () => {
    const { ledger } = await on29th()
    const vacation = await addGoal(ledger, { name: "Отпуск", target: 10000000 })
    await move(ledger, "saved", vacation.id, 3000000)
    expect(await ledger.deleteGoal(vacation.id)).toEqual({ ok: false, problem: "has-savings" })

    await move(ledger, "withdrawn", vacation.id, 3000000)
    const deleted = await ledger.deleteGoal(vacation.id)
    expect(deleted).toMatchObject({ ok: true })
    expect(ledger.goals()).toEqual([])
    expect(ledger.goal(vacation.id)).toBeUndefined()
    // операции удалённой цели остаются в ленте с её названием
    expect(ledger.days()[0]!.items.map((o) => [o.kind, o.goalName])).toEqual([
      ["withdrawn", "Отпуск"],
      ["saved", "Отпуск"]
    ])
    expect(await ledger.addMovement({ kind: "saved", goalId: vacation.id, amount: 100 })).toEqual({ ok: false, problem: "no-goal" })

    if (!deleted.ok) throw new Error()
    expect(await deleted.undo()).toEqual({ ok: true })
    expect(ledger.goal(vacation.id)).toMatchObject({ name: "Отпуск", saved: 0 })
    expect(await ledger.deleteGoal("nope")).toEqual({ ok: false, problem: "not-found" })
  })

  it("правка названия, иконки, суммы и срока; срок можно убрать", async () => {
    const { ledger } = await on29th()
    const vacation = await addGoal(ledger, { name: "Отпуск", target: 10000000, deadline: "2027-02-28" })
    expect(await ledger.updateGoal(vacation.id, { name: " Море ", icon: "plane", target: 12000000, deadline: null })).toMatchObject({
      ok: true,
      goal: { name: "Море", icon: "plane", target: 12000000, deadline: null, perMonth: null }
    })
    expect(await ledger.updateGoal(vacation.id, { name: " " })).toEqual({ ok: false, problem: "empty-name" })
    expect(await ledger.updateGoal(vacation.id, { target: 0 })).toEqual({ ok: false, problem: "bad-target" })
    expect(await ledger.updateGoal("nope", { name: "Дача" })).toEqual({ ok: false, problem: "not-found" })
    expect(ledger.goal(vacation.id)).toMatchObject({ name: "Море", target: 12000000 })
  })

  it("название обязательно, целевая сумма — положительная в копейках; иконка по умолчанию — звезда", async () => {
    const { ledger } = await on29th()
    expect(await ledger.addGoal({ name: "  ", target: 100 })).toEqual({ ok: false, problem: "empty-name" })
    expect(await ledger.addGoal({ name: "Отпуск", target: 0 })).toEqual({ ok: false, problem: "bad-target" })
    expect(await ledger.addGoal({ name: "Отпуск", target: 10.5 })).toEqual({ ok: false, problem: "bad-target" })
    expect(await ledger.addGoal({ name: "Отпуск", target: 100, deadline: "завтра" })).toEqual({ ok: false, problem: "bad-deadline" })
    expect(await addGoal(ledger, { name: "Отпуск", target: 100, icon: "неизвестная" })).toMatchObject({ icon: "star" })
  })

  it("операции цели — в истории карточки, сначала новые, и в ленте с названием цели", async () => {
    const { ledger } = await on29th()
    const vacation = await addGoal(ledger, { name: "Отпуск", target: 10000000 })
    const car = await addGoal(ledger, { name: "Машина", target: 90000000 })
    await move(ledger, "saved", vacation.id, 3000000, "2026-09-01")
    await move(ledger, "saved", car.id, 500000, "2026-09-02")
    await move(ledger, "withdrawn", vacation.id, 1000000, "2026-09-10")

    expect(ledger.goalHistory(vacation.id).map((o) => [o.kind, o.amount, o.date])).toEqual([
      ["withdrawn", 1000000, "2026-09-10"],
      ["saved", 3000000, "2026-09-01"]
    ])
    expect(ledger.operation(ledger.goalHistory(car.id)[0]!.id)).toMatchObject({ goalId: car.id, goalName: "Машина" })
    expect(ledger.search("отпуск").count).toBe(2)
  })

  it("цели и операции с ними синхронизируются между устройствами", async () => {
    const { ledger } = await on29th()
    const vacation = await addGoal(ledger, { name: "Отпуск", icon: "plane", target: 10000000, deadline: "2027-02-28" })
    await move(ledger, "saved", vacation.id, 2000000)
    await ledger.archiveGoal(vacation.id, true)
    expect(ledger.pendingChanges().find((r) => r.collection === "goals")).toMatchObject({
      id: vacation.id,
      deleted: false,
      data: { name: "Отпуск", icon: "plane", target: 10000000, deadline: "2027-02-28", archived: true }
    })

    const other = await on29th()
    await other.ledger.sync.receive(ledger.pendingChanges(), 2)
    expect(other.ledger.goals()).toMatchObject([{ id: vacation.id, name: "Отпуск", saved: 2000000, archived: true, perMonth: 1600000 }])
  })

  it("отложить и снять можно только на существующую цель", async () => {
    const { ledger } = await on29th()
    expect(await ledger.addMovement({ kind: "saved", goalId: "nope", amount: 100 })).toEqual({ ok: false, problem: "no-goal" })
    expect(ledger.days()).toEqual([])
  })
})
