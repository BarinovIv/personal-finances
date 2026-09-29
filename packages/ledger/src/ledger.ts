import { APP_TIME_ZONE, type CategoryKind, type IsoDate, type SyncRecord } from "@fin/domain"
import {
  addCategory,
  categoryUsage,
  deleteCategory,
  renameCategory,
  setCategoryStyle,
  type CategoryProblem,
  type CategoryStyle,
  type DeleteCategoryProblem
} from "./category-admin"
import { LedgerContext } from "./context"
import { exportCsv } from "./csv"
import { randomId } from "./ids"
import { buildDashboard, type Dashboard, type DashboardQuery } from "./dashboard"
import { listDays } from "./days"
import {
  previewEntries,
  previewEntry,
  submitEntries,
  submitEntry,
  type EntriesChoice,
  type EntryChoice,
  type EntryPreview,
  type SubmitEntriesResult,
  type SubmitResult
} from "./entry"
import {
  addRefund,
  deleteOperation,
  refundsOf,
  updateOperation,
  type OperationPatch,
  type RefundResult,
  type RefundsInfo,
  type UpdateResult
} from "./operations"
import type { PeriodMode } from "./periods"
import { Records } from "./records"
import {
  addRecurring,
  endRecurring,
  listRecurring,
  pauseRecurring,
  resumeRecurring,
  updateRecurring,
  type RecurringInput,
  type RecurringResult,
  type RecurringView
} from "./recurring"
import { searchOperations, type SearchSummary } from "./search"
import { dashboardMode, readSettings, setDashboardMode, setPaydays, type Settings } from "./settings"
import type { LedgerStore } from "./store"
import type { Undo } from "./undo"
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
  addCategory(
    kind: CategoryKind,
    name: string,
    style?: CategoryStyle
  ): Promise<{ ok: true; category: CategoryView } | { ok: false; problem: CategoryProblem }>
  renameCategory(id: string, name: string): Promise<{ ok: true } | { ok: false; problem: CategoryProblem }>
  /** Правка цвета и/или иконки категории. */
  setCategoryStyle(id: string, style: CategoryStyle): Promise<{ ok: true } | { ok: false; problem: "not-found" }>
  /** Сколько операций и регулярных операций в категории. */
  categoryUsage(id: string): number
  /** Непустая категория удаляется только с переносом операций в `moveTo`. */
  deleteCategory(
    id: string,
    options?: { moveTo?: string }
  ): Promise<{ ok: true } | { ok: false; problem: DeleteCategoryProblem }>
  /** Что получится из строки ввода — показывается под строкой. */
  preview(line: string, choice?: EntryChoice): EntryPreview
  /** Сохранить строку ввода как операцию. */
  submit(line: string, choice?: EntryChoice): Promise<SubmitResult>
  /** Строка ввода с одной или несколькими операциями: «шаурма 340 такси 500». */
  previewEntries(line: string, choice?: EntriesChoice): ReadonlyArray<EntryPreview>
  /** Сохранить все операции строки ввода — вместе или ни одной; `undo` в результате удаляет их все. */
  submitEntries(line: string, choice?: EntriesChoice): Promise<SubmitEntriesResult>
  /** Операции по дням, сначала новые. */
  days(): ReadonlyArray<DayGroup>
  /** Поиск по ленте: подстрока в описании или сумме, при необходимости — только в выбранных категориях. */
  search(query: string, categoryIds?: ReadonlyArray<string>): SearchSummary
  operation(id: string): OperationView | undefined
  /** Правка из карточки операции; `undo` в результате возвращает прежнее. */
  updateOperation(id: string, patch: OperationPatch): Promise<UpdateResult>
  /** Удалить операцию вместе с её возвратами; результат — «Отменить». */
  deleteOperation(id: string): Promise<Undo>
  /** Возвраты расхода; для дохода и возврата — undefined. */
  refunds(expenseId: string): RefundsInfo | undefined
  /** Оформить возврат: по умолчанию вся ещё не возвращённая сумма, сегодня. `undo` в результате удаляет его. */
  addRefund(expenseId: string, options?: { amount?: number; date?: IsoDate }): Promise<RefundResult>
  /** Итоги периода; всё считается на устройстве. */
  dashboard(query: DashboardQuery): Dashboard
  /** Последний выбранный на этом устройстве режим дашборда. */
  dashboardMode(): PeriodMode
  setDashboardMode(mode: PeriodMode): Promise<void>
  /** Регулярные операции: сначала действующие. */
  recurring(): ReadonlyArray<RecurringView>
  addRecurring(input: RecurringInput): Promise<RecurringResult>
  /** Правка шаблона не меняет уже созданные операции. */
  updateRecurring(id: string, patch: Partial<Omit<RecurringInput, "kind">>): Promise<RecurringResult>
  pauseRecurring(id: string): Promise<RecurringResult>
  /** Снова действует с сегодняшнего дня. */
  resumeRecurring(id: string): Promise<RecurringResult>
  endRecurring(id: string): Promise<RecurringResult>
  settings(): Settings
  /** Дни зарплаты — числа месяца; синхронизируются. */
  setPaydays(days: ReadonlyArray<number>): Promise<{ ok: boolean }>
  /** Все операции в CSV для Excel (UTF-8 с BOM, «;», десятичная запятая). */
  exportCsv(): string
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
    options.newId ?? randomId
  )

  return {
    today: () => ctx.today(),
    categories: (kind) => [...ctx.categories().values()].filter((c) => c.kind === kind),
    addCategory: (kind, name, style) => addCategory(ctx, kind, name, style),
    renameCategory: (id, name) => renameCategory(ctx, id, name),
    setCategoryStyle: (id, style) => setCategoryStyle(ctx, id, style),
    categoryUsage: (id) => categoryUsage(ctx, id),
    deleteCategory: (id, options) => deleteCategory(ctx, id, options),
    preview: (line, choice) => previewEntry(ctx, line, choice),
    submit: (line, choice) => submitEntry(ctx, line, choice),
    previewEntries: (line, choice) => previewEntries(ctx, line, choice),
    submitEntries: (line, choice) => submitEntries(ctx, line, choice),
    days: () => listDays(ctx),
    search: (query, categoryIds) => searchOperations(ctx, query, categoryIds),
    operation: (id) => {
      const record = records.get("operations", id)
      return record && !record.deleted ? ctx.toView(record) : undefined
    },
    updateOperation: (id, patch) => updateOperation(ctx, id, patch),
    deleteOperation: (id) => deleteOperation(ctx, id),
    refunds: (id) => refundsOf(ctx, id),
    addRefund: (id, options) => addRefund(ctx, id, options),
    dashboard: (query) => buildDashboard(ctx, query),
    dashboardMode: () => dashboardMode(ctx),
    setDashboardMode: (mode) => setDashboardMode(ctx, mode),
    recurring: () => listRecurring(ctx),
    addRecurring: (input) => addRecurring(ctx, input),
    updateRecurring: (id, patch) => updateRecurring(ctx, id, patch),
    pauseRecurring: (id) => pauseRecurring(ctx, id),
    resumeRecurring: (id) => resumeRecurring(ctx, id),
    endRecurring: (id) => endRecurring(ctx, id),
    settings: () => readSettings(ctx),
    setPaydays: (days) => setPaydays(ctx, days),
    exportCsv: () => exportCsv(ctx),
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
