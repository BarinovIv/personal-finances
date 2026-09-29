import {
  addDays,
  dailyAllowance,
  dateParts,
  formatMoney,
  limitUsage,
  liveOperations,
  paydaysOf,
  periodAt,
  periodTotals,
  SETTINGS_ID,
  STARTER_CATEGORIES,
  todayIn,
  UNKNOWN_CATEGORY_NAME,
  upcomingCharges,
  type CategoryRecord,
  type DailyAllowance,
  type IsoDate,
  type OperationRecord,
  type Period,
  type RecurringRecord,
  type SettingsRecord
} from "@fin/domain"
import { Clock, Duration, Effect, Option } from "effect"
import { AppConfig } from "./config"
import { allRecords, getRecord } from "./records"
import { sendMessage, untilMoscowTime } from "./telegram"

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря"
]

/** «21–27 сентября», «28 сентября – 4 октября», «29 декабря 2025 – 4 января 2026». */
const rangeLabel = ({ start, end }: Period) => {
  const s = dateParts(start)
  const e = dateParts(end)
  const withYear = s.year !== e.year
  const part = (p: typeof s) => `${p.day} ${MONTHS_GENITIVE[p.month - 1]}${withYear ? ` ${p.year}` : ""}`
  if (!withYear && s.month === e.month) return `${s.day}–${e.day} ${MONTHS_GENITIVE[s.month - 1]}`
  return `${part(s)} – ${part(e)}`
}

/** 0 — понедельник, 6 — воскресенье. */
const weekday = (date: IsoDate) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7

/** Неделя с понедельника по воскресенье, сдвинутая на `offset` недель от недели `today`. */
const weekAt = (today: IsoDate, offset: number): Period => {
  const start = addDays(today, offset * 7 - weekday(today))
  return { start, end: addDays(start, 6) }
}

/** Названия категорий: стартовый набор поверх записей, как на устройстве. */
const categoryNames = (records: ReadonlyArray<CategoryRecord>) => {
  const names = new Map(STARTER_CATEGORIES.map((c) => [c.id, c.name]))
  for (const r of records) {
    if (r.deleted) names.delete(r.id)
    else names.set(r.id, r.data.name)
  }
  return (id: string) => names.get(id) ?? UNKNOWN_CATEGORY_NAME
}

/** Изменение расходов в процентах — по той же формуле и теми же словами, что сравнение на дашборде. */
const comparisonLine = (current: number, previous: number) => {
  if (previous <= 0) return "Неделей раньше расходов не было"
  const change = Math.round(((current - previous) / previous) * 100)
  if (change === 0) return "Столько же, сколько неделей раньше"
  return `${change < 0 ? "↓" : "↑"} на ${Math.abs(change)}% ${change < 0 ? "меньше" : "больше"}, чем неделей раньше`
}

/** «Можно тратить в день» теми же словами, что на дашборде. */
const allowanceLine = (a: DailyAllowance | null) => {
  if (a === null) return []
  if (a.kind === "daily") return [`Можно тратить в день: ${formatMoney(a.perDay)}`]
  // ровно ноль свободных денег — ещё не перерасход: тратить просто не из чего
  return [a.overspent > 0 ? `Перерасход за период: ${formatMoney(a.overspent)}` : `Можно тратить в день: ${formatMoney(0)}`]
}

const TOP_CATEGORIES = 5

/**
 * Текст сводки на текущий момент: прошлая неделя (пн–вс) и текущий зарплатный период.
 * Считается теми же функциями, что и дашборд, поэтому числа совпадают.
 */
export const weeklySummaryText = Effect.gen(function* () {
  const now = yield* Clock.currentTimeMillis
  const today = todayIn(now)
  const operationRecords = (yield* allRecords("operations")) as Array<OperationRecord>
  const categoryRecords = (yield* allRecords("categories")) as Array<CategoryRecord>
  const recurringRecords = (yield* allRecords("recurring")) as Array<RecurringRecord>
  const settings = (yield* getRecord("settings", SETTINGS_ID)) as SettingsRecord | undefined
  const ops = liveOperations(operationRecords)
  const nameOf = categoryNames(categoryRecords)

  const lastWeek = weekAt(today, -1)
  const week = periodTotals(ops, lastWeek)
  const top = week.categories.filter((c) => c.amount > 0).slice(0, TOP_CATEGORIES)
  const lines = [`Неделя ${rangeLabel(lastWeek)}`, ""]
  if (top.length === 0) lines.push("За неделю расходов нет")
  else {
    const before = periodTotals(ops, weekAt(today, -2)).expenses
    lines.push(`Расходы: ${formatMoney(week.expenses)}`, comparisonLine(week.expenses, before), "")
    for (const c of top) lines.push(`${nameOf(c.categoryId)} — ${formatMoney(c.amount)}`)
  }

  const period = periodAt("pay", today, paydaysOf(settings))
  const ids = new Set(operationRecords.map((r) => r.id))
  const upcoming = upcomingCharges(recurringRecords, (id) => ids.has(id), period, today)
  const allowance = dailyAllowance(ops, period, today, upcoming.reduce((sum, c) => sum + c.template.data.amount, 0))
  lines.push(
    "",
    `Зарплатный период ${rangeLabel(period)}`,
    `Потрачено: ${formatMoney(periodTotals(ops, period).expenses)}`,
    ...allowanceLine(allowance)
  )

  const over = limitUsage(categoryRecords, ops, period).filter((u) => u.spent > u.limit)
  if (over.length > 0) {
    lines.push("", "Сверх лимита:")
    for (const u of over) lines.push(`${nameOf(u.categoryId)} — ${formatMoney(u.spent)} из ${formatMoney(u.limit)}`)
  }
  return lines.join("\n")
})

const SUMMARY_HOUR = 9

/**
 * Каждый понедельник в 09:00 по Москве шлёт сводку в Telegram. Пропущенную (сервер не работал) не догоняет.
 * Сбой отправки пишется в лог и не роняет сервер.
 */
export const weeklySummary = Effect.gen(function* () {
  const { telegram } = yield* AppConfig
  if (Option.isNone(telegram)) {
    yield* Effect.logWarning("BACKUP_TELEGRAM_TOKEN и BACKUP_TELEGRAM_CHAT_ID не заданы — еженедельная сводка выключена")
    return
  }
  for (;;) {
    const now = yield* Clock.currentTimeMillis
    yield* Effect.sleep(Duration.millis(untilMoscowTime(now, SUMMARY_HOUR, (date) => weekday(date) === 0)))
    yield* weeklySummaryText.pipe(
      Effect.flatMap((text) => sendMessage(telegram.value, text)),
      Effect.tap(() => Effect.logInfo("Еженедельная сводка отправлена")),
      Effect.catchAllCause((cause) => Effect.logError("Еженедельная сводка не отправлена", cause))
    )
  }
})
