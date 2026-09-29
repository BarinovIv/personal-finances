import { daysBetween, type IsoDate } from "./dates"
import { inPeriod, type Period } from "./periods"
import type { OperationRecord } from "./records"
import { periodTotals, type PeriodTotals } from "./totals"

/**
 * Сколько можно тратить в день до конца текущего периода.
 * `free` — свободные деньги периода сейчас, с учётом сегодняшних операций; `daysLeft` — дней до конца периода, включая сегодня.
 * Если свободных денег нет, вместо суммы на день — перерасход за период.
 */
export type DailyAllowance =
  | {
      readonly kind: "daily"
      readonly free: number
      readonly daysLeft: number
      /** Можно тратить в день — на начало сегодняшнего дня, в целых рублях. Сегодняшние траты её не меняют. */
      readonly perDay: number
      /** Сегодня осталось: можно тратить в день − расходы за сегодня (за вычетом возвратов). Меньше нуля — превышение за сегодня. */
      readonly leftToday: number
    }
  | {
      readonly kind: "overspent"
      readonly free: number
      readonly daysLeft: number
      /** Перерасход за период: −free, не меньше нуля. */
      readonly overspent: number
    }

/**
 * Свободные деньги периода: доходы − расходы (за вычетом возвратов) ± операции вне расходов и доходов
 * − предстоящие списания. Остаток прошлого периода не переносится. Всё, что меняет свободные деньги, учитывается здесь.
 */
export const freeMoney = (totals: PeriodTotals, upcoming: number): number =>
  totals.income - totals.expenses + totals.movements - upcoming

/**
 * Можно тратить в день и сегодня осталось; для периода, в котором нет `today`, — null.
 * `operations` — все живые операции (см. `liveOperations`), `upcoming` — сумма предстоящих списаний периода
 * (см. `upcomingCharges`), копейки. Доход и возврат, пришедшие сегодня, сразу увеличивают сумму на день; сегодняшние
 * операции вне расходов и доходов тоже сразу её меняют — это не траты за сегодня.
 */
export const dailyAllowance = (
  operations: ReadonlyArray<OperationRecord>,
  period: Period,
  today: IsoDate,
  upcoming: number
): DailyAllowance | null => {
  if (!inPeriod(period, today)) return null
  const free = freeMoney(periodTotals(operations, period), upcoming)
  const daysLeft = daysBetween(today, period.end) + 1
  if (free <= 0) return { kind: "overspent", free, daysLeft, overspent: Math.max(0, -free) }
  const spentToday = periodTotals(operations, { start: today, end: today }).expenses
  const perDay = Math.floor(Math.max(0, free + spentToday) / daysLeft / 100) * 100
  return { kind: "daily", free, daysLeft, perDay, leftToday: perDay - spentToday }
}
