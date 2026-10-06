import { APP_TIME_ZONE, type CategoryKind, type IsoDate, type PeriodMode, type SyncRecord } from "@fin/domain"
import {
  addCategory,
  categoryUsage,
  deleteCategory,
  listCategories,
  renameCategory,
  reorderCategories,
  setCategoryLimit,
  setCategoryStyle,
  type CategoryLimitProblem,
  type CategoryProblem,
  type CategoryStyle,
  type DeleteCategoryResult
} from "./category-admin"
import { LedgerContext } from "./context"
import { RECURRING_SEEN_PREFIX } from "./constants"
import { exportCsv } from "./csv"
import {
  addGoal,
  archiveGoal,
  deleteGoal,
  goalHistory,
  goalOf,
  listGoals,
  updateGoal,
  type DeleteGoalResult,
  type GoalInput,
  type GoalResult,
  type GoalView
} from "./goals"
import { randomId } from "./ids"
import { debtPeople, debtsOverview, type DebtsOverview } from "./debts"
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
  confirmRecurringOperation,
  deleteOperation,
  refundsOf,
  updateOperation,
  type OperationPatch,
  type RefundResult,
  type RefundsInfo,
  type UpdateResult
} from "./operations"
import {
  addMovement,
  goalSavings,
  repaymentsOf,
  type MovementInput,
  type MovementResult,
  type RepaymentsInfo
} from "./movements"
import { Records } from "./records"
import {
  addRecurring,
  deleteRecurring,
  endRecurring,
  listRecurring,
  makeRecurring,
  pauseRecurring,
  reorderRecurring,
  resumeRecurring,
  updateRecurring,
  type DeleteRecurringResult,
  type RecurringInput,
  type RecurringResult,
  type RecurringView
} from "./recurring"
import { searchOperations, type SearchSummary } from "./search"
import { dashboardMode, readSettings, setDashboardMode, setPaydays, setTimeZone, type Settings } from "./settings"
import type { LedgerStore } from "./store"
import type { Undo } from "./undo"
import type { MakeRecurringResult } from "./types"
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

/** Принадлежность всех локальных данных одному пользователю. */
export interface LedgerDevicePort {
  owner(): string | null
  /** Присвоить данные без владельца первому вошедшему пользователю; очередь остаётся. */
  adopt(userId: string): Promise<void>
  /** Полностью стереть устройство перед выходом или сменой пользователя. */
  clear(): Promise<void>
}

/** Клиентский журнал: всё, что видит и делает пользователь, работает с данными на устройстве. */
export interface Ledger {
  /** Сегодняшняя дата в часовом поясе пользователя. */
  today(): IsoDate
  /** Категории вида в порядке, заданном пользователем. */
  categories(kind: CategoryKind): ReadonlyArray<CategoryView>
  addCategory(
    kind: CategoryKind,
    name: string,
    style?: CategoryStyle
  ): Promise<{ ok: true; category: CategoryView } | { ok: false; problem: CategoryProblem }>
  renameCategory(id: string, name: string): Promise<{ ok: true } | { ok: false; problem: CategoryProblem }>
  /** Правка цвета и/или иконки категории. */
  setCategoryStyle(id: string, style: CategoryStyle): Promise<{ ok: true } | { ok: false; problem: "not-found" }>
  /** Лимит категории расходов в месяц, копейки; null убирает лимит. Синхронизируется вместе с категорией. */
  setCategoryLimit(id: string, limit: number | null): Promise<{ ok: true } | { ok: false; problem: CategoryLimitProblem }>
  /** Сколько операций и регулярных операций в категории. */
  categoryUsage(id: string): number
  /** Непустая категория удаляется только с переносом операций в `moveTo`; результат можно отменить. */
  deleteCategory(
    id: string,
    options?: { moveTo?: string }
  ): Promise<DeleteCategoryResult>
  /** Новый порядок категорий одного вида: все id в нужном порядке. */
  reorderCategories(ids: ReadonlyArray<string>): Promise<void>
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
  /** Подтвердить регулярный расход или доход, при необходимости изменив только его сумму. */
  confirmRecurringOperation(id: string, amount?: number): Promise<UpdateResult>
  /** Просмотр операции хранится только на этом устройстве. */
  hasSeenRecurringOperation(id: string): boolean
  markRecurringOperationSeen(id: string): Promise<void>
  /** Удалить операцию вместе с её возвратами; результат — «Отменить». */
  deleteOperation(id: string): Promise<Undo>
  /** Возвраты расхода; для дохода и возврата — undefined. */
  refunds(expenseId: string): RefundsInfo | undefined
  /** Оформить возврат: по умолчанию вся ещё не возвращённая сумма, сегодня. `undo` в результате удаляет его. */
  addRefund(expenseId: string, options?: { amount?: number; date?: IsoDate }): Promise<RefundResult>
  /**
   * Операция вне расходов и доходов: «Отложено», «Снято», «Одолжил», «Занял» или погашение долга.
   * По умолчанию сегодня; погашение — на весь остаток долга. `undo` в результате удаляет её.
   */
  addMovement(input: MovementInput): Promise<MovementResult>
  /** Погашения долга («Одолжил» или «Занял»); для других операций — undefined. */
  repayments(debtId: string): RepaymentsInfo | undefined
  /** Накоплено на цели: отложено − снято, копейки. */
  goalSavings(goalId: string): number
  /** Цели накоплений: сначала действующие, потом архивные; `archived: false` — только действующие, как на дашборде. */
  goals(filter?: { readonly archived?: boolean }): ReadonlyArray<GoalView>
  goal(id: string): GoalView | undefined
  /** Новая цель; синхронизируется. */
  addGoal(input: GoalInput): Promise<GoalResult>
  /** Правка названия, иконки, целевой суммы и срока; `deadline: null` убирает срок. */
  updateGoal(id: string, patch: Partial<GoalInput>): Promise<GoalResult>
  /** Убрать в архив (true) или вернуть из архива (false). */
  archiveGoal(id: string, archived: boolean): Promise<GoalResult>
  /** Удаляется только цель, на которой ничего не накоплено; `undo` в результате возвращает её. */
  deleteGoal(id: string): Promise<DeleteGoalResult>
  /** «Отложено» и «Снято» цели, сначала новые. */
  goalHistory(id: string): ReadonlyArray<OperationView>
  /** Долги по людям с сальдо («Петя должен мне 1 500») и отдельно закрытые. «Петя» и «петя» — один человек. */
  debts(): DebtsOverview
  /** Подсказки для поля «Кто» у долга: уже встречавшиеся люди, сначала недавние. */
  debtPeople(): ReadonlyArray<string>
  /** Итоги периода; всё считается на устройстве. */
  dashboard(query: DashboardQuery): Dashboard
  /** Последний выбранный на этом устройстве режим дашборда. */
  dashboardMode(): PeriodMode
  setDashboardMode(mode: PeriodMode): Promise<void>
  /** Регулярные операции в порядке, заданном пользователем; без него — сначала действующие. */
  recurring(): ReadonlyArray<RecurringView>
  addRecurring(input: RecurringInput): Promise<RecurringResult>
  /** Сделать расход регулярным с повторениями после сегодня; исходный расход сохраняется. С отменой. */
  makeRecurring(expenseId: string, input: Omit<RecurringInput, "kind">): Promise<MakeRecurringResult>
  /** Правка шаблона не меняет уже созданные операции. */
  updateRecurring(id: string, patch: Partial<Omit<RecurringInput, "kind">>): Promise<RecurringResult>
  pauseRecurring(id: string): Promise<RecurringResult>
  /** Снова действует с сегодняшнего дня. */
  resumeRecurring(id: string): Promise<RecurringResult>
  endRecurring(id: string): Promise<RecurringResult>
  /** Уже созданные операции остаются; с отменой. */
  deleteRecurring(id: string): Promise<DeleteRecurringResult>
  /** Новый порядок списка: все id в нужном порядке. */
  reorderRecurring(ids: ReadonlyArray<string>): Promise<void>
  settings(): Settings
  /** Дни зарплаты — числа месяца; синхронизируются. */
  setPaydays(days: ReadonlyArray<number>): Promise<{ ok: boolean }>
  /** IANA-часовой пояс; синхронизируется между устройствами пользователя. */
  setTimeZone(timeZone: string): Promise<{ ok: boolean }>
  /** Все операции в CSV для Excel (UTF-8 с BOM, «;», десятичная запятая). */
  exportCsv(): string
  /** Изменения, которые ещё не ушли на сервер. */
  pendingChanges(): ReadonlyArray<SyncRecord>
  readonly sync: LedgerSyncPort
  readonly device: LedgerDevicePort
  /** Подписка на любые изменения журнала. */
  subscribe(listener: () => void): () => void
}

const CURSOR = "syncCursor"
const OWNER = "userId"

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
    categories: (kind) => listCategories(ctx, kind),
    addCategory: (kind, name, style) => addCategory(ctx, kind, name, style),
    renameCategory: (id, name) => renameCategory(ctx, id, name),
    setCategoryStyle: (id, style) => setCategoryStyle(ctx, id, style),
    setCategoryLimit: (id, limit) => setCategoryLimit(ctx, id, limit),
    categoryUsage: (id) => categoryUsage(ctx, id),
    deleteCategory: (id, options) => deleteCategory(ctx, id, options),
    reorderCategories: (ids) => reorderCategories(ctx, ids),
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
    confirmRecurringOperation: (id, amount) => confirmRecurringOperation(ctx, id, amount),
    hasSeenRecurringOperation: (id) => records.getMeta<boolean>(RECURRING_SEEN_PREFIX + id) === true,
    markRecurringOperationSeen: (id) => records.saveMeta({ [RECURRING_SEEN_PREFIX + id]: true }),
    deleteOperation: (id) => deleteOperation(ctx, id),
    refunds: (id) => refundsOf(ctx, id),
    addRefund: (id, options) => addRefund(ctx, id, options),
    addMovement: (input) => addMovement(ctx, input),
    repayments: (id) => repaymentsOf(ctx, id),
    goalSavings: (goalId) => goalSavings(ctx, goalId),
    goals: (filter) => listGoals(ctx, filter),
    goal: (id) => goalOf(ctx, id),
    addGoal: (input) => addGoal(ctx, input),
    updateGoal: (id, patch) => updateGoal(ctx, id, patch),
    archiveGoal: (id, archived) => archiveGoal(ctx, id, archived),
    deleteGoal: (id) => deleteGoal(ctx, id),
    goalHistory: (id) => goalHistory(ctx, id),
    debts: () => debtsOverview(ctx),
    debtPeople: () => debtPeople(ctx),
    dashboard: (query) => buildDashboard(ctx, query),
    dashboardMode: () => dashboardMode(ctx),
    setDashboardMode: (mode) => setDashboardMode(ctx, mode),
    recurring: () => listRecurring(ctx),
    addRecurring: (input) => addRecurring(ctx, input),
    makeRecurring: (id, input) => makeRecurring(ctx, id, input),
    updateRecurring: (id, patch) => updateRecurring(ctx, id, patch),
    pauseRecurring: (id) => pauseRecurring(ctx, id),
    resumeRecurring: (id) => resumeRecurring(ctx, id),
    endRecurring: (id) => endRecurring(ctx, id),
    deleteRecurring: (id) => deleteRecurring(ctx, id),
    reorderRecurring: (ids) => reorderRecurring(ctx, ids),
    settings: () => readSettings(ctx),
    setTimeZone: (zone) => setTimeZone(ctx, zone),
    setPaydays: (days) => setPaydays(ctx, days),
    exportCsv: () => exportCsv(ctx),
    pendingChanges: () => records.pending(),
    device: {
      owner: () => records.getMeta<string>(OWNER) ?? null,
      adopt: (userId) => records.saveMeta({ [OWNER]: userId }),
      clear: () => records.clear()
    },
    sync: {
      pending: () => records.pending(),
      cursor: () => records.getMeta<number>(CURSOR) ?? 0,
      receive: (changes, cursor) => records.applyRemote(changes, { [CURSOR]: cursor }),
      acknowledge: (sent) => records.acknowledge(sent)
    },
    subscribe: (listener) => records.subscribe(listener)
  }
}
