import { describe, expect, it } from "vitest"
import {
  dailyAllowance,
  recurringOperationId,
  upcomingCharges,
  type OperationData,
  type OperationRecord,
  type RecurringData,
  type RecurringRecord
} from "@fin/domain"

/** Зарплатный период 20.09–04.10, сегодня 29.09: до конца периода 6 дней, включая сегодня. */
const period = { start: "2026-09-20", end: "2026-10-04" }
const today = "2026-09-29"

const op = (id: string, data: Partial<OperationData> & Pick<OperationData, "kind" | "amount" | "date">): OperationRecord => ({
  collection: "operations",
  id,
  updatedAt: 1,
  deleted: false,
  data: {
    description: id,
    categoryId: "food",
    createdAt: 1,
    categorizedAt: 1,
    refundOf: null,
    recurringId: null,
    ...data
  }
})

describe("можно тратить в день", () => {
  it("свободные деньги до сегодняшних трат делятся на дни до конца периода; сегодняшние траты уменьшают только «сегодня осталось»", () => {
    const ops = [
      op("salary", { kind: "income", amount: 6000000, date: "2026-09-20" }),
      op("shop", { kind: "expense", amount: 3000000, date: "2026-09-25" }),
      op("lunch", { kind: "expense", amount: 150000, date: today })
    ]
    expect(dailyAllowance(ops, period, today, 600000)).toEqual({
      kind: "daily",
      free: 2250000,
      daysLeft: 6,
      perDay: 400000,
      leftToday: 250000
    })
  })

  it("сумма на день — в целых рублях, с округлением вниз", () => {
    const ops = [op("salary", { kind: "income", amount: 1000000, date: "2026-09-20" })]
    expect(dailyAllowance(ops, period, today, 0)).toMatchObject({ kind: "daily", perDay: 166600, leftToday: 166600 })
  })

  it("сегодняшний возврат не меняет сумму на день, а увеличивает «сегодня осталось»", () => {
    const ops = [
      op("salary", { kind: "income", amount: 600000, date: "2026-09-20" }),
      op("shoes", { kind: "expense", amount: 300000, date: "2026-09-21" }),
      op("refund", { kind: "refund", amount: 100000, date: today, refundOf: "shoes" })
    ]
    expect(dailyAllowance(ops, period, today, 0)).toMatchObject({ kind: "daily", free: 400000, perDay: 50000, leftToday: 150000 })
  })

  it("свободных денег нет — перерасход за период", () => {
    const ops = [
      op("salary", { kind: "income", amount: 1000000, date: "2026-09-20" }),
      op("shop", { kind: "expense", amount: 1100000, date: "2026-09-25" }),
      op("lunch", { kind: "expense", amount: 50000, date: today })
    ]
    expect(dailyAllowance(ops, period, today, 20000)).toEqual({ kind: "overspent", free: -170000, daysLeft: 6, overspent: 170000 })
    expect(dailyAllowance([], period, today, 0)).toMatchObject({ kind: "overspent", overspent: 0 })
  })

  it("для периода без сегодняшнего дня — нет", () => {
    expect(dailyAllowance([], { start: "2026-09-05", end: "2026-09-19" }, today, 0)).toBeNull()
  })
})

describe("предстоящие списания", () => {
  const template = (id: string, data: Partial<RecurringData>, deleted = false): RecurringRecord => ({
    collection: "recurring",
    id,
    updatedAt: 1,
    deleted,
    data: {
      kind: "expense",
      description: id,
      amount: 10000,
      categoryId: "subscriptions",
      dayOfMonth: 1,
      startDate: "2026-01-01",
      status: "active",
      ...data
    }
  })

  it("действующие регулярные расходы от сегодня до конца периода, по датам; уже созданные — не предстоят", () => {
    const templates = [
      template("internet", { dayOfMonth: 1 }),
      template("cinema", { dayOfMonth: 30 }),
      template("gym", { dayOfMonth: 29 }),
      template("rent", { dayOfMonth: 25 }),
      template("salary", { kind: "income", dayOfMonth: 30 }),
      template("magazine", { dayOfMonth: 30, status: "paused" }),
      template("old", { dayOfMonth: 30 }, true),
      template("new", { dayOfMonth: 2, startDate: "2026-10-02" })
    ]
    const created = new Set([recurringOperationId("gym", { year: 2026, month: 9 })])
    const charges = upcomingCharges(templates, (id) => created.has(id), period, today)
    expect(charges.map((c) => [c.template.id, c.date])).toEqual([
      ["cinema", "2026-09-30"],
      ["internet", "2026-10-01"],
      ["new", "2026-10-02"]
    ])
  })

  it("для периода без сегодняшнего дня — нет", () => {
    expect(upcomingCharges([template("internet", {})], () => false, { start: "2026-10-05", end: "2026-10-19" }, today)).toEqual([])
  })
})
