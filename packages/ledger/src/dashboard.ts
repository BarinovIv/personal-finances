import { addDays, dateParts, dayOfMonth, daysBetween, type IsoDate } from "@fin/domain"
import type { LedgerContext } from "./context"
import {
  contains,
  periodLabel,
  periodLength,
  rangeLabel,
  shiftPeriod,
  trendLabel,
  type Period,
  type PeriodMode
} from "./periods"
import type { RecordOf } from "./records"
import type { OperationView } from "./views"

export interface DashboardQuery {
  readonly mode: PeriodMode
  /** 0 — текущий период, −1 — предыдущий и т. д. */
  readonly offset: number
}

export interface DashboardCategory {
  readonly id: string
  readonly name: string
  readonly color: string
  /** Расходы минус возвраты, копейки. Может уйти в минус. */
  readonly amount: number
  /** Доля от расходов периода (0–1); для нулевой и отрицательной суммы — null. */
  readonly share: number | null
  /** Расходы и возвраты категории за период, сначала новые. */
  readonly operations: ReadonlyArray<OperationView>
}

export interface Comparison {
  /** Расходы текущего отрезка. */
  readonly current: number
  /** Расходы того же отрезка предыдущего периода. */
  readonly previous: number
  /** С чем сравниваем: «1–28 августа», «весь июль». */
  readonly label: string
  /** Изменение в процентах; null, если сравнивать не с чем. */
  readonly change: number | null
}

export interface TrendBar {
  readonly label: string
  readonly start: IsoDate
  readonly end: IsoDate
  readonly amount: number
  /** Выбранный период. */
  readonly current: boolean
}

export interface Dashboard {
  readonly mode: PeriodMode
  readonly period: Period & { readonly label: string }
  /** Период содержит сегодняшний день. */
  readonly isCurrent: boolean
  /** «День 28 из 30» или «День 9 из 15 · до зарплаты 7 дней»; для прошлых периодов пусто. */
  readonly progress: string
  /** Расходы минус возвраты, копейки. */
  readonly expenses: number
  readonly income: number
  /** Доходы минус расходы. */
  readonly balance: number
  /** По убыванию суммы. Доходы сюда не входят. */
  readonly categories: ReadonlyArray<DashboardCategory>
  readonly comparison: Comparison
  /** Шесть периодов, последний — выбранный. */
  readonly trend: ReadonlyArray<TrendBar>
}

const TREND_LENGTH = 6

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** Вклад операции в расходы: расход — плюс, возврат — минус, доход — ноль. */
const expenseEffect = (record: RecordOf<"operations">) =>
  record.data.kind === "expense" ? record.data.amount : record.data.kind === "refund" ? -record.data.amount : 0

const expensesIn = (ops: ReadonlyArray<RecordOf<"operations">>, range: Period) =>
  ops.reduce((sum, r) => (contains(range, r.data.date) ? sum + expenseEffect(r) : sum), 0)

/** Отрезок предыдущего периода, соответствующий [start, today] текущего. */
const sameStretch = (mode: PeriodMode, period: Period, previous: Period, today: IsoDate): Period => {
  if (mode === "month") {
    const { year, month } = dateParts(previous.start)
    return { start: previous.start, end: dayOfMonth(year, month, dateParts(today).day) }
  }
  const end = addDays(previous.start, daysBetween(period.start, today))
  return { start: previous.start, end: end < previous.end ? end : previous.end }
}

export const buildDashboard = (ctx: LedgerContext, query: DashboardQuery): Dashboard => {
  const { mode, offset } = query
  const today = ctx.today()
  const paydays = ctx.paydays()
  const period = shiftPeriod(mode, today, paydays, offset)
  const isCurrent = contains(period, today)
  const ops = ctx.records.live("operations")

  let income = 0
  const byCategory = new Map<string, { amount: number; records: Array<RecordOf<"operations">> }>()
  for (const record of ops) {
    if (!contains(period, record.data.date)) continue
    if (record.data.kind === "income") {
      income += record.data.amount
      continue
    }
    const categoryId = ctx.operationCategory(record).id
    const entry = byCategory.get(categoryId) ?? { amount: 0, records: [] }
    entry.amount += expenseEffect(record)
    entry.records.push(record)
    byCategory.set(categoryId, entry)
  }
  const expenses = [...byCategory.values()].reduce((sum, c) => sum + c.amount, 0)

  const categories = [...byCategory.entries()]
    .filter(([, c]) => c.amount !== 0 || c.records.length > 0)
    .map(([id, c]): DashboardCategory => {
      const category = ctx.categoryOf(id, "expense")
      return {
        id,
        name: category.name,
        color: category.color,
        amount: c.amount,
        share: c.amount > 0 && expenses > 0 ? c.amount / expenses : null,
        operations: c.records
          .sort((a, b) => (a.data.date === b.data.date ? b.data.createdAt - a.data.createdAt : a.data.date < b.data.date ? 1 : -1))
          .map((r) => ctx.toView(r))
      }
    })
    .sort((a, b) => b.amount - a.amount)

  const previous = shiftPeriod(mode, today, paydays, offset - 1)
  const currentRange = isCurrent ? { start: period.start, end: today } : period
  const previousRange = isCurrent ? sameStretch(mode, period, previous, today) : previous
  const current = expensesIn(ops, currentRange)
  const before = expensesIn(ops, previousRange)

  let progress = ""
  if (isCurrent) {
    const day = daysBetween(period.start, today) + 1
    progress = `День ${day} из ${periodLength(period)}`
    if (mode === "pay") {
      const left = daysBetween(today, addDays(period.end, 1))
      progress += ` · до зарплаты ${left} ${plural(left, "день", "дня", "дней")}`
    }
  }

  const trend: Array<TrendBar> = []
  for (let i = TREND_LENGTH - 1; i >= 0; i--) {
    const p = shiftPeriod(mode, today, paydays, offset - i)
    trend.push({ label: trendLabel(mode, p), start: p.start, end: p.end, amount: expensesIn(ops, p), current: i === 0 })
  }

  return {
    mode,
    period: { ...period, label: periodLabel(mode, period, today) },
    isCurrent,
    progress,
    expenses,
    income,
    balance: income - expenses,
    categories,
    comparison: {
      current,
      previous: before,
      label: rangeLabel(mode, previousRange, !isCurrent),
      change: before > 0 ? Math.round(((current - before) / before) * 100) : null
    },
    trend
  }
}
