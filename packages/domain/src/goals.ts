import { yearMonthOf, type IsoDate } from "./dates"

/** Сколько месяцев до срока: разница номеров месяцев, «через 5 месяцев» — срок в феврале, если сейчас сентябрь. */
export const monthsUntil = (today: IsoDate, deadline: IsoDate): number => {
  const from = yearMonthOf(today)
  const to = yearMonthOf(deadline)
  return (to.year - from.year) * 12 + (to.month - from.month)
}

/**
 * Сколько откладывать в месяц, чтобы успеть к сроку: (цель − накоплено) / месяцев до срока,
 * с округлением вверх до рубля. В месяц срока — весь остаток. Без срока, после срока и для
 * достигнутой цели — null.
 */
export const monthlyContribution = (target: number, saved: number, deadline: IsoDate | null, today: IsoDate): number | null => {
  const remaining = target - saved
  if (deadline === null || deadline < today || remaining <= 0) return null
  const months = Math.max(1, monthsUntil(today, deadline))
  return Math.ceil(remaining / months / 100) * 100
}
