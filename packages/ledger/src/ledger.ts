import { APP_TIME_ZONE, type CategoryKind, type IsoDate, type SyncRecord } from "@fin/domain"
import { LedgerContext } from "./context"
import { listDays } from "./days"
import { previewEntry, submitEntry, type EntryChoice, type EntryPreview, type SubmitResult } from "./entry"
import { deleteOperation } from "./operations"
import { Records } from "./records"
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

/** Клиентский журнал: всё, что видит и делает пользователь, работает с данными на устройстве. */
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
  deleteOperation(id: string): Promise<void>
  /** Изменения, которые ещё не ушли на сервер. */
  pendingChanges(): ReadonlyArray<SyncRecord>
  /** Подписка на любые изменения журнала. */
  subscribe(listener: () => void): () => void
}

export const openLedger = async (options: LedgerOptions): Promise<Ledger> => {
  const now = options.now ?? Date.now
  const stored = await options.store.load()
  const records = new Records(options.store, now, stored.records, stored.outbox)
  const ctx = new LedgerContext(
    records,
    now,
    options.timeZone ?? APP_TIME_ZONE,
    options.newId ?? (() => crypto.randomUUID())
  )

  return {
    today: () => ctx.today(),
    categories: (kind) => [...ctx.categories().values()].filter((c) => c.kind === kind),
    preview: (line, choice) => previewEntry(ctx, line, choice),
    submit: (line, choice) => submitEntry(ctx, line, choice),
    days: () => listDays(ctx),
    operation: (id) => {
      const record = records.get("operations", id)
      return record && !record.deleted ? ctx.toView(record) : undefined
    },
    deleteOperation: (id) => deleteOperation(ctx, id),
    pendingChanges: () => records.pending(),
    subscribe: (listener) => records.subscribe(listener)
  }
}
