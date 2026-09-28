import {
  addDays,
  APP_TIME_ZONE,
  todayIn,
  type CategoryKind,
  type IsoDate,
  type OperationData,
  type SyncRecord
} from "@fin/domain"
import { parseEntryLine, type EntryProblem } from "@fin/entry-line"
import { STARTER_CATEGORIES, UNKNOWN_CATEGORY_COLOR } from "./categories"
import { dayLabel } from "./format"
import { Records, type RecordOf } from "./records"
import type { LedgerStore } from "./store"
import type { CategoryView, DayGroup, OperationView } from "./views"

export interface LedgerOptions {
  readonly store: LedgerStore
  /** Текущее время, мс. В тестах — фиксированное. */
  readonly now?: () => number
  readonly timeZone?: string
  /** Идентификаторы новых записей. */
  readonly newId?: () => string
}

/** Что пользователь выбрал вручную поверх распознанного из строки ввода. */
export interface EntryChoice {
  readonly categoryId?: string | null
  readonly date?: IsoDate | null
}

export type EntryPreviewProblem = EntryProblem | "no-category"

export interface EntryPreview {
  readonly kind: "expense" | "income"
  readonly amount: number | null
  readonly description: string
  readonly date: IsoDate
  readonly categoryId: string | null
  readonly problems: ReadonlyArray<EntryPreviewProblem>
}

export type SubmitResult =
  | { readonly ok: true; readonly operation: OperationView }
  | { readonly ok: false; readonly problems: ReadonlyArray<EntryPreviewProblem> }

export interface Ledger {
  /** Сегодняшняя дата по Москве. */
  today(): IsoDate
  categories(kind: CategoryKind): ReadonlyArray<CategoryView>
  /** Что получится из строки ввода — показывается под строкой. */
  preview(line: string, choice?: EntryChoice): EntryPreview
  /** Сохранить строку ввода как операцию. */
  submit(line: string, choice?: EntryChoice): Promise<SubmitResult>
  /** Операции по дням, сначала новые. */
  days(): ReadonlyArray<DayGroup>
  operation(id: string): OperationView | undefined
  /** Изменения, которые ещё не ушли на сервер. */
  pendingChanges(): ReadonlyArray<SyncRecord>
  /** Подписка на любые изменения журнала. */
  subscribe(listener: () => void): () => void
}

export const openLedger = async (options: LedgerOptions): Promise<Ledger> => {
  const now = options.now ?? Date.now
  const timeZone = options.timeZone ?? APP_TIME_ZONE
  const newId = options.newId ?? (() => crypto.randomUUID())
  const stored = await options.store.load()
  const records = new Records(options.store, now, stored.records, stored.outbox)

  const today = () => todayIn(now(), timeZone)

  const categoryViews = (): Map<string, CategoryView> => {
    const map = new Map<string, CategoryView>()
    for (const starter of STARTER_CATEGORIES) map.set(starter.id, starter)
    for (const record of records.all("categories")) {
      if (record.deleted) map.delete(record.id)
      else map.set(record.id, { id: record.id, ...record.data })
    }
    return map
  }

  const categoryOf = (id: string, kind: CategoryKind): CategoryView =>
    categoryViews().get(id) ?? { id, kind, name: "Без категории", color: UNKNOWN_CATEGORY_COLOR }

  const toView = (record: RecordOf<"operations">): OperationView => {
    const { data } = record
    const kind: CategoryKind = data.kind === "income" ? "income" : "expense"
    return {
      id: record.id,
      kind: data.kind,
      amount: data.amount,
      description: data.description,
      date: data.date,
      category: categoryOf(data.categoryId, kind),
      refundOf: data.refundOf,
      recurringId: data.recurringId,
      createdAt: data.createdAt,
      updatedAt: record.updatedAt
    }
  }

  const preview = (line: string, choice: EntryChoice = {}): EntryPreview => {
    const parsed = parseEntryLine(line)
    const date = choice.date ?? addDays(today(), parsed.dateShift)
    const chosen = choice.categoryId ? categoryViews().get(choice.categoryId) : undefined
    const categoryId = chosen && chosen.kind === parsed.kind ? chosen.id : null
    const problems: Array<EntryPreviewProblem> = [...parsed.problems]
    if (categoryId === null) problems.push("no-category")
    return { kind: parsed.kind, amount: parsed.amount, description: parsed.description, date, categoryId, problems }
  }

  const ledger: Ledger = {
    today,

    categories: (kind) => [...categoryViews().values()].filter((c) => c.kind === kind),

    preview,

    submit: async (line, choice) => {
      const p = preview(line, choice)
      if (p.problems.length > 0 || p.amount === null || p.categoryId === null) {
        return { ok: false, problems: p.problems }
      }
      const id = newId()
      const stamp = records.stamp()
      const data: OperationData = {
        kind: p.kind,
        amount: p.amount,
        description: p.description,
        categoryId: p.categoryId,
        date: p.date,
        createdAt: stamp,
        refundOf: null,
        recurringId: null
      }
      await records.write([{ collection: "operations", id, data }], stamp)
      return { ok: true, operation: toView(records.get("operations", id)!) }
    },

    days: () => {
      const byDate = new Map<IsoDate, Array<OperationView>>()
      for (const record of records.live("operations")) {
        const list = byDate.get(record.data.date) ?? []
        list.push(toView(record))
        byDate.set(record.data.date, list)
      }
      const todayDate = today()
      return [...byDate.entries()]
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .map(([date, items]) => {
          items.sort((a, b) => b.createdAt - a.createdAt)
          let expenseTotal = 0
          let incomeTotal = 0
          for (const op of items) {
            if (op.kind === "expense") expenseTotal += op.amount
            if (op.kind === "refund") expenseTotal -= op.amount
            if (op.kind === "income") incomeTotal += op.amount
          }
          return { date, label: dayLabel(date, todayDate), expenseTotal, incomeTotal, items }
        })
    },

    operation: (id) => {
      const record = records.get("operations", id)
      return record && !record.deleted ? toView(record) : undefined
    },

    pendingChanges: () => records.pending(),

    subscribe: (listener) => records.subscribe(listener)
  }
  return ledger
}
