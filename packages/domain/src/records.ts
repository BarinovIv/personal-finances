import type { IsoDate } from "./dates"

/**
 * Всё, что синхронизируется, — записи с временем последней правки и признаком удаления (ADR-0001).
 * Удаление — тоже правка: запись остаётся с `deleted: true`.
 */
export type Collection = "operations" | "categories" | "recurring" | "settings"

export interface SyncRecord<C extends Collection = Collection, D = unknown> {
  readonly collection: C
  readonly id: string
  /** Время последней правки, мс. При конфликте побеждает бóльшее. */
  readonly updatedAt: number
  readonly deleted: boolean
  readonly data: D
}

export const recordKey = (collection: Collection, id: string) => `${collection}:${id}`

export type OperationKind = "expense" | "income" | "refund"

/** Вид категории и регулярной операции: у расходов и доходов свои наборы категорий. */
export type CategoryKind = "expense" | "income"

export interface OperationData {
  readonly kind: OperationKind
  /** Сумма в копейках, всегда положительная. */
  readonly amount: number
  readonly description: string
  readonly categoryId: string
  readonly date: IsoDate
  /** Когда операция создана, мс. Порядок в списке не меняется от правок. */
  readonly createdAt: number
  /** Для возврата — исходный расход. */
  readonly refundOf: string | null
  /** Для операции, созданной по регулярной операции, — её шаблон. */
  readonly recurringId: string | null
}

export interface CategoryData {
  readonly kind: CategoryKind
  readonly name: string
  readonly color: string
}

export type RecurringStatus = "active" | "paused" | "ended"

export interface RecurringData {
  readonly kind: CategoryKind
  readonly description: string
  /** Копейки. */
  readonly amount: number
  readonly categoryId: string
  /** Число месяца 1–31; если такого дня нет, берётся последний день месяца. */
  readonly dayOfMonth: number
  /** С этой даты шаблон создаёт операции (дата создания или снятия с паузы). */
  readonly startDate: IsoDate
  readonly status: RecurringStatus
}

export interface SettingsData {
  /** Дни зарплаты — числа месяца. */
  readonly paydays: ReadonlyArray<number>
}

export const SETTINGS_ID = "settings"

export type OperationRecord = SyncRecord<"operations", OperationData>
export type CategoryRecord = SyncRecord<"categories", CategoryData>
export type RecurringRecord = SyncRecord<"recurring", RecurringData>
export type SettingsRecord = SyncRecord<"settings", SettingsData>
