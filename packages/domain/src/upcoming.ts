import type { IsoDate } from "./dates"
import { inPeriod, type Period } from "./periods"
import type { RecurringData, RecurringRecord } from "./records"
import { occurrencesBetween, type Occurrence } from "./recurring"

/** Есть ли уже операция (в том числе удалённая) шаблона на эту дату. */
export type HasOccurrence = (templateId: string, date: IsoDate) => boolean

export interface UpcomingOperation {
  readonly template: RecurringRecord
  readonly date: IsoDate
}

export type UpcomingCharge = UpcomingOperation

/**
 * Ещё не созданные операции шаблона в отрезке [from, to]: за дату, где операция уже есть, ничего не предстоит.
 * Удалённая пользователем операция тоже считается созданной — сервер её не пересоздаст (ADR-0002).
 */
export const pendingOccurrences = (
  templateId: string,
  template: Pick<RecurringData, "dayOfMonth" | "startDate">,
  hasOccurrence: HasOccurrence,
  from: IsoDate,
  to: IsoDate
): Array<Occurrence> =>
  occurrencesBetween(template, from, to).filter((o) => !hasOccurrence(templateId, o.date))

/**
 * Предстоящие операции: действующие регулярные расходы и доходы, которые ещё появятся с сегодняшнего дня
 * до конца периода, по датам. Для периода, в котором нет `today`, их нет.
 * `templates` — записи регулярных операций, удалённые пропускаются.
 */
export const upcomingOperations = (
  templates: ReadonlyArray<RecurringRecord>,
  hasOccurrence: HasOccurrence,
  period: Period,
  today: IsoDate
): Array<UpcomingOperation> => {
  if (!inPeriod(period, today)) return []
  const out: Array<UpcomingOperation> = []
  for (const template of templates) {
    if (template.deleted || template.data.status !== "active") continue
    for (const o of pendingOccurrences(template.id, template.data, hasOccurrence, today, period.end)) {
      out.push({ template, date: o.date })
    }
  }
  return out.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1))
}

/** Предстоящие списания; регулярные доходы в список расходов не входят. */
export const upcomingCharges = (
  templates: ReadonlyArray<RecurringRecord>,
  hasOccurrence: HasOccurrence,
  period: Period,
  today: IsoDate
): Array<UpcomingCharge> =>
  upcomingOperations(templates, hasOccurrence, period, today).filter((o) => o.template.data.kind === "expense")
