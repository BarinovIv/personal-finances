import { inPeriod, type Period } from "./periods"
import type { OperationData, OperationRecord } from "./records"

export interface CategoryTotal {
  readonly categoryId: string
  /** Расходы минус возвраты, копейки. Может уйти в минус. */
  readonly amount: number
  /** Расходы и возвраты категории за период в исходном порядке. */
  readonly operations: ReadonlyArray<OperationRecord>
}

export interface PeriodTotals {
  /** Расходы минус возвраты, копейки. Может уйти в минус. */
  readonly expenses: number
  readonly income: number
  /** Расходы по категориям, по убыванию суммы. Доходы сюда не входят. */
  readonly categories: ReadonlyArray<CategoryTotal>
}

/**
 * Живые операции из всех записей, включая удалённые. Возврат удалённого расхода тоже не живой: так бывает,
 * если расход удалили на одном устройстве, а возврат оформили на другом до синхронизации.
 */
export const liveOperations = (records: ReadonlyArray<OperationRecord>): Array<OperationRecord> => {
  const byId = new Map(records.map((r) => [r.id, r]))
  return records.filter((r) => {
    if (r.deleted) return false
    if (r.data.kind !== "refund" || !r.data.refundOf) return true
    const original = byId.get(r.data.refundOf)
    return original !== undefined && !original.deleted
  })
}

/** Вклад операции в расходы: расход — плюс, возврат — минус, доход — ноль. */
const expenseEffect = (data: OperationData) =>
  data.kind === "expense" ? data.amount : data.kind === "refund" ? -data.amount : 0

/**
 * Суммы за период. Операция попадает в период по своей дате, поэтому возврат уменьшает расходы
 * в периоде даты возврата, а не покупки, и в категории исходного расхода.
 * `operations` — все живые операции (см. `liveOperations`), а не только за период:
 * исходный расход возврата может лежать в другом периоде.
 */
export const periodTotals = (operations: ReadonlyArray<OperationRecord>, period: Period): PeriodTotals => {
  let byId: Map<string, OperationRecord> | undefined
  const categoryOf = ({ data }: OperationRecord) => {
    if (data.kind !== "refund" || !data.refundOf) return data.categoryId
    byId ??= new Map(operations.map((r) => [r.id, r]))
    return byId.get(data.refundOf)?.data.categoryId ?? data.categoryId
  }

  let income = 0
  const byCategory = new Map<string, { amount: number; operations: Array<OperationRecord> }>()
  for (const record of operations) {
    if (!inPeriod(period, record.data.date)) continue
    if (record.data.kind === "income") {
      income += record.data.amount
      continue
    }
    const categoryId = categoryOf(record)
    const entry = byCategory.get(categoryId) ?? { amount: 0, operations: [] }
    entry.amount += expenseEffect(record.data)
    entry.operations.push(record)
    byCategory.set(categoryId, entry)
  }

  const categories = [...byCategory.entries()]
    .map(([categoryId, c]): CategoryTotal => ({ categoryId, amount: c.amount, operations: c.operations }))
    .sort((a, b) => b.amount - a.amount)
  return { expenses: categories.reduce((sum, c) => sum + c.amount, 0), income, categories }
}
