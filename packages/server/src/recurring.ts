import {
  addDays,
  occurrencesBetween,
  recurringOperationId,
  todayIn,
  type OperationData,
  type RecurringData
} from "@fin/domain"
import { Clock, Duration, Effect } from "effect"
import { Db } from "./db"
import { allRecords, getRecord, putIfNewer } from "./records"

/**
 * Создаёт операции по регулярным операциям за все наступившие даты (ADR-0002).
 * Догоняет пропущенное: идёт от начала шаблона. Идентификатор операции — шаблон + месяц,
 * поэтому повторный запуск ничего не задваивает, а удалённая пользователем операция не создаётся снова.
 */
export const generateRecurring = Effect.gen(function* () {
  const db = yield* Db
  const now = yield* Clock.currentTimeMillis
  const today = todayIn(now)
  return yield* db.transaction(
    Effect.gen(function* () {
      const templates = (yield* allRecords("recurring")).filter(
        (r) => !r.deleted && (r.data as RecurringData).status === "active"
      )
      let created = 0
      for (const template of templates) {
        const t = template.data as RecurringData
        for (const occurrence of occurrencesBetween(t, t.startDate, today)) {
          const id = recurringOperationId(template.id, occurrence.month)
          if (yield* getRecord("operations", id)) continue
          const data: OperationData = {
            kind: t.kind,
            amount: t.amount,
            description: t.description,
            categoryId: t.categoryId,
            date: occurrence.date,
            createdAt: now,
            refundOf: null,
            recurringId: template.id
          }
          yield* putIfNewer({ collection: "operations", id, updatedAt: now, deleted: false, data })
          created++
        }
      }
      return created
    })
  )
})

/** До следующей полуночи по Москве (Москва — UTC+3 без перехода на летнее время). */
const untilMidnight = (now: number) => Date.parse(`${addDays(todayIn(now), 1)}T00:00:00+03:00`) - now

/** Раз в сутки по московскому времени. */
export const dailyGeneration = Effect.gen(function* () {
  for (;;) {
    const now = yield* Clock.currentTimeMillis
    yield* Effect.sleep(Duration.millis(untilMidnight(now) + 1_000))
    const created = yield* generateRecurring
    if (created > 0) yield* Effect.logInfo(`Регулярные операции: создано ${created}`)
  }
})
