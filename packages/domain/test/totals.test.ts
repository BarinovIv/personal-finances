import { describe, expect, it } from "vitest"
import { liveOperations, periodTotals, type OperationData, type OperationRecord } from "@fin/domain"

const september = { start: "2026-09-01", end: "2026-09-30" }

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

describe("суммы за период", () => {
  it("расходы за вычетом возвратов и доходы — только по операциям с датой в периоде", () => {
    const ops = [
      op("shoes", { kind: "expense", amount: 500000, date: "2026-09-10" }),
      op("coffee", { kind: "expense", amount: 20000, date: "2026-09-30" }),
      op("refund", { kind: "refund", amount: 100000, date: "2026-09-12", refundOf: "shoes" }),
      op("salary", { kind: "income", amount: 15000000, date: "2026-09-05", categoryId: "salary" }),
      op("august", { kind: "expense", amount: 70000, date: "2026-08-31" }),
      op("october", { kind: "income", amount: 30000, date: "2026-10-01", categoryId: "salary" })
    ]
    const totals = periodTotals(ops, september)
    expect(totals.expenses).toBe(420000)
    expect(totals.income).toBe(15000000)
  })

  it("разбивка расходов по категориям — по убыванию суммы, без доходов", () => {
    const ops = [
      op("coffee", { kind: "expense", amount: 20000, date: "2026-09-02", categoryId: "food" }),
      op("shirt", { kind: "expense", amount: 150000, date: "2026-09-03", categoryId: "clothes" }),
      op("lunch", { kind: "expense", amount: 60000, date: "2026-09-04", categoryId: "food" }),
      op("salary", { kind: "income", amount: 15000000, date: "2026-09-05", categoryId: "salary" })
    ]
    const { categories } = periodTotals(ops, september)
    expect(categories.map((c) => [c.categoryId, c.amount, c.operations.map((o) => o.id)])).toEqual([
      ["clothes", 150000, ["shirt"]],
      ["food", 80000, ["coffee", "lunch"]]
    ])
  })

  it("возврат уменьшает категорию исходного расхода в периоде даты возврата и может увести её в минус", () => {
    const ops = [
      op("shoes", { kind: "expense", amount: 500000, date: "2026-08-25", categoryId: "clothes" }),
      op("refund", { kind: "refund", amount: 200000, date: "2026-09-02", categoryId: "other", refundOf: "shoes" }),
      op("coffee", { kind: "expense", amount: 20000, date: "2026-09-03", categoryId: "food" })
    ]
    const totals = periodTotals(ops, september)
    expect(totals.expenses).toBe(-180000)
    expect(totals.categories.map((c) => [c.categoryId, c.amount, c.operations.map((o) => o.id)])).toEqual([
      ["food", 20000, ["coffee"]],
      ["clothes", -200000, ["refund"]]
    ])
    expect(periodTotals(ops, { start: "2026-08-01", end: "2026-08-31" }).expenses).toBe(500000)
  })
})

describe("живые операции", () => {
  it("без удалённых и без возвратов удалённого расхода", () => {
    const records = [
      op("shoes", { kind: "expense", amount: 500000, date: "2026-09-10" }),
      op("shoes-refund", { kind: "refund", amount: 100000, date: "2026-09-12", refundOf: "shoes" }),
      { ...op("shirt", { kind: "expense", amount: 150000, date: "2026-09-10" }), deleted: true },
      op("shirt-refund", { kind: "refund", amount: 150000, date: "2026-09-12", refundOf: "shirt" }),
      op("orphan-refund", { kind: "refund", amount: 1000, date: "2026-09-12", refundOf: "unknown" }),
      op("salary", { kind: "income", amount: 15000000, date: "2026-09-05" })
    ]
    expect(liveOperations(records).map((r) => r.id)).toEqual(["shoes", "shoes-refund", "salary"])
  })
})
