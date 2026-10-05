import {
  addDays,
  dailyAllowance,
  dateParts,
  dayOfMonth,
  daysBetween,
  freeMoney,
  inPeriod,
  limitUsage,
  periodAt,
  periodLength,
  periodTotals,
  type DailyAllowance,
  type IsoDate,
  type Period,
  type PeriodMode
} from "@fin/domain"
import type { LedgerContext } from "./context"
import { periodLabel, rangeLabel, trendLabel } from "./periods"
import { upcomingIn, type Upcoming } from "./recurring"
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
  readonly icon: string
  /** Расходы минус возвраты, копейки. Может уйти в минус. */
  readonly amount: number
  /** Доля от расходов периода (0–1); для нулевой и отрицательной суммы — null. */
  readonly share: number | null
  /** Лимит на период (в зарплатном — пропорционально дням), копейки; без лимита — null. */
  readonly limit: number | null
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
  /** Смещение периода относительно текущего: 0 — текущий, −1 — предыдущий. */
  readonly offset: number
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
  /** Доходы минус расходы. Операции вне расходов и доходов сюда не входят. */
  readonly balance: number
  /**
   * Свободные деньги периода: доходы − расходы ± операции вне расходов и доходов
   * + предстоящие регулярные доходы − предстоящие списания (ожидания есть только у текущего периода).
   * Меньше нуля — перерасход.
   */
  readonly free: number
  /** По убыванию суммы. Доходы сюда не входят. */
  readonly categories: ReadonlyArray<DashboardCategory>
  readonly comparison: Comparison
  /** Шесть последовательных периодов, включая выбранный и, когда возможно, более новые. */
  readonly trend: ReadonlyArray<TrendBar>
  /** Регулярные расходы, которые ещё появятся до конца текущего периода; для других периодов пусто. */
  readonly upcoming: Upcoming
  /** Можно тратить в день и сегодня осталось — только для текущего периода. */
  readonly allowance: DailyAllowance | null
}

const TREND_LENGTH = 6

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

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
  const period = periodAt(mode, today, paydays, offset)
  const isCurrent = inPeriod(period, today)
  const ops = ctx.operations()
  const totals = periodTotals(ops, period)
  const { expenses, income } = totals
  const expensesIn = (range: Period) => periodTotals(ops, range).expenses
  const usage = limitUsage(ctx.records.all("categories"), ops, period)
  const limits = new Map(usage.map((u) => [u.categoryId, u.limit]))

  const categories = totals.categories.map((c): DashboardCategory => {
    const category = ctx.categoryOf(c.categoryId, "expense")
    return {
      id: c.categoryId,
      name: category.name,
      color: category.color,
      icon: category.icon,
      amount: c.amount,
      share: c.amount > 0 && expenses > 0 ? c.amount / expenses : null,
      limit: limits.get(c.categoryId) ?? null,
      operations: [...c.operations]
        .sort((a, b) => (a.data.date === b.data.date ? b.data.createdAt - a.data.createdAt : a.data.date < b.data.date ? 1 : -1))
        .map((r) => ctx.toView(r))
    }
  })

  const previous = periodAt(mode, today, paydays, offset - 1)
  const currentRange = isCurrent ? { start: period.start, end: today } : period
  const previousRange = isCurrent ? sameStretch(mode, period, previous, today) : previous
  const current = expensesIn(currentRange)
  const before = expensesIn(previousRange)

  let progress = ""
  if (isCurrent) {
    const day = daysBetween(period.start, today) + 1
    progress = `День ${day} из ${periodLength(period)}`
    if (mode === "pay") {
      const left = daysBetween(today, addDays(period.end, 1))
      progress += ` · до зарплаты ${left} ${plural(left, "день", "дня", "дней")}`
    }
  }

  const upcoming = upcomingIn(ctx, period)
  const upcomingIncome = upcomingIn(ctx, period, "income").total

  const trend: Array<TrendBar> = []
  const trendEndOffset = offset >= 0 ? offset : Math.min(0, offset + TREND_LENGTH - 1)
  for (let trendOffset = trendEndOffset - TREND_LENGTH + 1; trendOffset <= trendEndOffset; trendOffset++) {
    const p = periodAt(mode, today, paydays, trendOffset)
    trend.push({
      label: trendLabel(mode, p),
      start: p.start,
      end: p.end,
      amount: expensesIn(p),
      offset: trendOffset,
      current: trendOffset === offset
    })
  }

  return {
    mode,
    period: { ...period, label: periodLabel(mode, period, today) },
    isCurrent,
    progress,
    expenses,
    income,
    balance: income - expenses,
    free: freeMoney(totals, upcoming.total, upcomingIncome),
    categories,
    comparison: {
      current,
      previous: before,
      label: rangeLabel(mode, previousRange, !isCurrent),
      change: before > 0 ? Math.round(((current - before) / before) * 100) : null
    },
    trend,
    upcoming,
    allowance: dailyAllowance(ops, period, today, upcoming.total, upcomingIncome)
  }
}
