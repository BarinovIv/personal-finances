import { describe, expect, it } from "vitest"
import {
  limitUsage,
  periodLimit,
  type CategoryData,
  type CategoryRecord,
  type OperationData,
  type OperationRecord
} from "@fin/domain"

const september = { start: "2026-09-01", end: "2026-09-30" }
const payPeriod = { start: "2026-09-20", end: "2026-10-04" }

const category = (id: string, data: Partial<CategoryData>, deleted = false): CategoryRecord => ({
  collection: "categories",
  id,
  updatedAt: 1,
  deleted,
  data: { kind: "expense", name: id, color: "gray", ...data }
})

const op = (id: string, data: Partial<OperationData> & Pick<OperationData, "kind" | "amount" | "date">): OperationRecord => ({
  collection: "operations",
  id,
  updatedAt: 1,
  deleted: false,
  data: {
    description: id,
    categoryId: "cafe",
    createdAt: 1,
    categorizedAt: 1,
    refundOf: null,
    recurringId: null,
    ...data
  }
})

describe("лимит на период", () => {
  it("в календарном месяце — лимит как есть", () => {
    expect(periodLimit(1500000, september)).toBe(1500000)
    expect(periodLimit(1500050, september)).toBe(1500050)
  })

  it("в зарплатном периоде — пропорционально дням месяца, в котором период начинается, до рубля", () => {
    // 20.09–04.10: 15 дней, в сентябре 30
    expect(periodLimit(1500000, payPeriod)).toBe(750000)
    // 05.09–19.09: 15 дней; 10 000 × 15 / 30
    expect(periodLimit(1000000, { start: "2026-09-05", end: "2026-09-19" })).toBe(500000)
    // 20.01–04.02: 16 дней, в январе 31; 1 000 × 16 / 31 = 516,13 → 516
    expect(periodLimit(100000, { start: "2026-01-20", end: "2026-02-04" })).toBe(51600)
  })
})

describe("использованный лимит", () => {
  it("по категориям расходов с лимитом: лимит на период и потраченное за вычетом возвратов", () => {
    const categories = [
      category("cafe", { limit: 1500000 }),
      category("food", {}),
      category("clothes", { limit: 500000 }),
      category("salary", { kind: "income", limit: 100000 }),
      category("gone", { limit: 100000 }, true)
    ]
    const ops = [
      op("lunch", { kind: "expense", amount: 900000, date: "2026-09-21" }),
      op("dinner", { kind: "expense", amount: 200000, date: "2026-09-10", categoryId: "cafe" }),
      op("shoes", { kind: "expense", amount: 600000, date: "2026-09-10", categoryId: "clothes" }),
      op("shoes-back", { kind: "refund", amount: 300000, date: "2026-09-22", categoryId: "clothes", refundOf: "shoes" }),
      op("bread", { kind: "expense", amount: 5000, date: "2026-09-22", categoryId: "food" })
    ]
    expect(limitUsage(categories, ops, payPeriod)).toEqual([
      { categoryId: "cafe", limit: 750000, spent: 900000 },
      { categoryId: "clothes", limit: 250000, spent: -300000 }
    ])
    expect(limitUsage(categories, ops, september)).toEqual([
      { categoryId: "cafe", limit: 1500000, spent: 1100000 },
      { categoryId: "clothes", limit: 500000, spent: 300000 }
    ])
  })

  it("категория с лимитом, но без трат — с нулём", () => {
    expect(limitUsage([category("cafe", { limit: 100000 })], [], september)).toEqual([
      { categoryId: "cafe", limit: 100000, spent: 0 }
    ])
  })
})
