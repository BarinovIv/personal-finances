import { APP_TIME_ZONE, type CategoryKind, type IsoDate, type SyncRecord } from "@fin/domain"
import { LedgerContext } from "./context"
import { buildDashboard, type Dashboard, type DashboardQuery } from "./dashboard"
import { listDays } from "./days"
import { previewEntry, submitEntry, type EntryChoice, type EntryPreview, type SubmitResult } from "./entry"
import {
  deleteOperation,
  restoreOperation,
  updateOperation,
  type OperationPatch,
  type UpdateResult
} from "./operations"
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

/** Точка подключения синхронизации: очередь изменений и приём чужих правок. */
export interface LedgerSyncPort {
  /** Изменения, которые ещё не ушли на сервер. Очередь переживает перезагрузку. */
  pending(): ReadonlyArray<SyncRecord>
  /** Номер последней полученной с сервера версии. */
  cursor(): number
  /** Принять изменения с сервера: побеждает последняя правка (ADR-0001). */
  receive(changes: ReadonlyArray<SyncRecord>, cursor: number): Promise<void>
  /** Сервер получил эти версии — убрать их из очереди. */
  acknowledge(sent: ReadonlyArray<SyncRecord>): Promise<void>
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
  updateOperation(id: string, patch: OperationPatch): Promise<UpdateResult>
  deleteOperation(id: string): Promise<void>
  /** Отменить удаление. */
  restoreOperation(id: string): Promise<void>
  /** Итоги периода; всё считается на устройстве. */
  dashboard(query: DashboardQuery): Dashboard
  /** Изменения, которые ещё не ушли на сервер. */
  pendingChanges(): ReadonlyArray<SyncRecord>
  readonly sync: LedgerSyncPort
  /** Подписка на любые изменения журнала. */
  subscribe(listener: () => void): () => void
}

const CURSOR = "syncCursor"

export const openLedger = async (options: LedgerOptions): Promise<Ledger> => {
  const now = options.now ?? Date.now
  const stored = await options.store.load()
  const records = new Records(options.store, now, stored.records, stored.outbox, stored.meta)
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
    updateOperation: (id, patch) => updateOperation(ctx, id, patch),
    deleteOperation: (id) => deleteOperation(ctx, id),
    restoreOperation: (id) => restoreOperation(ctx, id),
    dashboard: (query) => buildDashboard(ctx, query),
    pendingChanges: () => records.pending(),
    sync: {
      pending: () => records.pending(),
      cursor: () => records.getMeta<number>(CURSOR) ?? 0,
      receive: (changes, cursor) => records.applyRemote(changes, { [CURSOR]: cursor }),
      acknowledge: (sent) => records.acknowledge(sent)
    },
    subscribe: (listener) => records.subscribe(listener)
  }
}
