import { APP_TIME_ZONE, todayIn } from "@fin/domain"
import { dayMonth } from "@fin/ledger"

/** «только что», «12 мин назад», «сегодня в 14:05», «26 сентября». */
export const lastActive = (at: number, now = Date.now()): string => {
  const diff = now - at
  if (diff < 60_000) return "только что"
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} мин назад`
  const today = todayIn(now)
  const day = todayIn(at)
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE }).format(at)
  if (day === today) return `сегодня в ${time}`
  return dayMonth(day, today)
}

/** Русское склонение по числу: 1 операция, 2 операции, 5 операций. */
export const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
