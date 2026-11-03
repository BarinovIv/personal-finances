import {
  APP_TIME_ZONE,
  isTimeZone,
  occurrencesBetween,
  recurringOperationId,
  SETTINGS_ID,
  todayIn,
  type OperationData,
  type RecurringData,
  type SettingsData
} from "@fin/domain"
import { Clock, Duration, Effect } from "effect"
import { Db } from "./db"
import { allRecords, getRecord, putIfNewer } from "./records"

/**
 * Создаёт операции по регулярным операциям за все наступившие даты (ADR-0002).
 * Догоняет пропущенное от начала шаблона. Проверка шаблона и даты, включая удалённые операции,
 * не даёт повторному запуску задвоить уже созданное.
 */
export const generateRecurringFor = (userId: string) => Effect.gen(function* () {
  const db = yield* Db
  const now = yield* Clock.currentTimeMillis
  return yield* db.transaction(
    Effect.gen(function* () {
      const settings = yield* getRecord("settings", SETTINGS_ID, userId)
      const zone = settings && !settings.deleted ? (settings.data as SettingsData).timeZone : undefined
      const timeZone = zone && isTimeZone(zone) ? zone : APP_TIME_ZONE
      const today = todayIn(now, timeZone)
      const templates = (yield* allRecords("recurring", userId)).filter(
        (r) => !r.deleted && (r.data as RecurringData).status === "active"
      )
      const operations = yield* allRecords("operations", userId)
      const dates = new Set(operations.flatMap((record) => {
        const data = record.data as OperationData
        return [`${data.recurringId}:${data.recurringDate ?? data.date}`, `${data.recurringId}:${data.date}`]
      }))
      let created = 0
      for (const template of templates) {
        const t = template.data as RecurringData
        for (const occurrence of occurrencesBetween(t, t.startDate, today)) {
          const key = `${template.id}:${occurrence.date}`
          if (dates.has(key)) {
            continue
          }
          const monthlyId = recurringOperationId(template.id, occurrence.month)
          const monthly = yield* getRecord("operations", monthlyId, userId)
          // Старые правки сохраняли начало шаблона: новое расписание не переигрывает уже созданные месяцы.
          if (monthly) {
            const original = monthly.data as OperationData
            const scheduleWasReset = t.startDate > (original.recurringDate ?? original.date)
            if (!scheduleWasReset && occurrence.date < todayIn(template.updatedAt, timeZone)) {
              continue
            }
          }
          const id = monthly ? `rec:${template.id}:${occurrence.date}` : monthlyId
          if (yield* getRecord("operations", id, userId)) {
            continue
          }
          const data: OperationData = {
            kind: t.kind,
            amount: t.amount,
            description: t.description,
            categoryId: t.categoryId,
            date: occurrence.date,
            recurringDate: occurrence.date,
            createdAt: now,
            categorizedAt: now,
            refundOf: null,
            recurringId: template.id,
            pending: true
          }
          yield* putIfNewer({ collection: "operations", id, updatedAt: now, deleted: false, data }, userId)
          dates.add(key)
          created++
        }
      }
      return created
    })
  )
})

/** Каждый пользователь получает только свои операции, с датой по своему часовому поясу. */
export const generateRecurring = Effect.gen(function* () {
  const db = yield* Db
  return yield* db.transaction(Effect.gen(function* () {
    const users = yield* db.all<{ id: string }>("SELECT id FROM users WHERE deleted_at IS NULL")
    let created = 0
    for (const user of users) created += yield* generateRecurringFor(user.id)
    return created
  }))
})

/** Проверка каждую минуту: наступление дня зависит от часового пояса пользователя. */
export const dailyGeneration = Effect.gen(function* () {
  for (;;) {
    yield* Effect.sleep(Duration.minutes(1))
    const created = yield* generateRecurring
    if (created > 0) yield* Effect.logInfo(`Регулярные операции: создано ${created}`)
  }
})
