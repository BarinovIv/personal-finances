import type { IsoDate } from "./dates"

/**
 * Всё, что синхронизируется, — записи с временем последней правки и признаком удаления (ADR-0001).
 * Удаление — тоже правка: запись остаётся с `deleted: true`.
 */
export type Collection = "operations" | "categories" | "recurring" | "settings" | "goals"

export interface SyncRecord<C extends Collection = Collection, D = unknown> {
  readonly collection: C
  readonly id: string
  /** Время последней правки, мс. При конфликте побеждает бóльшее. */
  readonly updatedAt: number
  readonly deleted: boolean
  readonly data: D
}

export const recordKey = (collection: Collection, id: string) => `${collection}:${id}`

/**
 * Операции вне расходов и доходов: деньги двигаются, но это не расход и не доход.
 * «Отложено» и «Снято» — на цель и с цели; «Одолжил» и «Занял» — долг человеку и у человека;
 * «Мне вернули» и «Я вернул» — погашения этих долгов.
 */
export type MovementKind = "saved" | "withdrawn" | "lent" | "borrowed" | "repaid-to-me" | "repaid-by-me"

export type OperationKind = "expense" | "income" | "refund" | MovementKind

/** Вид категории и регулярной операции: у расходов и доходов свои наборы категорий. */
export type CategoryKind = "expense" | "income"

export interface OperationData {
  readonly kind: OperationKind
  /** Сумма в копейках, всегда положительная. */
  readonly amount: number
  readonly description: string
  /** У операций вне расходов и доходов категории нет — пустая строка. */
  readonly categoryId: string
  readonly date: IsoDate
  /** Когда операция создана, мс. Порядок в списке не меняется от правок. */
  readonly createdAt: number
  /**
   * Когда пользователь последний раз выбрал категорию. По нему история решает, какой выбор последний:
   * правка суммы или даты выбором не считается.
   */
  readonly categorizedAt: number
  /** Для возврата — исходный расход. */
  readonly refundOf: string | null
  /** Для операции, созданной по регулярной операции, — её шаблон. */
  readonly recurringId: string | null
  /** Ожидает подтверждения; у старых операций без поля факт уже подтверждён. */
  readonly pending?: boolean
  /**
   * Дальше — поля операций вне расходов и доходов. Они необязательны: у записей, созданных до их появления, полей нет.
   * Для «Отложено» и «Снято» — цель.
   */
  readonly goalId?: string
  /** Для «Одолжил» и «Занял» — человек, свободный текст. */
  readonly person?: string
  /** Для погашения («Мне вернули», «Я вернул») — его долг: операция «Одолжил» или «Занял». */
  readonly repaymentOf?: string
}

export interface CategoryData {
  readonly kind: CategoryKind
  readonly name: string
  /** Название цвета из фиксированной палитры (ADR-0004), не hex. */
  readonly color: string
  /**
   * Имя встроенной иконки или эмодзи. Необязательно: у категорий, созданных
   * до появления иконок, поля нет — при чтении подставляется иконка по умолчанию.
   */
  readonly icon?: string
  /**
   * Лимит категории расходов в месяц, копейки. Необязательно: нет поля — нет лимита,
   * в том числе у записей, созданных до появления лимитов. У категорий доходов не учитывается.
   */
  readonly limit?: number
  /**
   * Место в списке своего вида, которое задал пользователь перетаскиванием. Необязательно: пока список
   * не переставляли, поля нет — такие категории идут после упорядоченных, в прежнем порядке.
   */
  readonly position?: number
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
  /**
   * Место в списке, которое задал пользователь перетаскиванием. Необязательно: пока список
   * не переставляли, поля нет — такие записи идут после упорядоченных.
   */
  readonly position?: number
}

export interface SettingsData {
  /** Дни зарплаты — числа месяца. */
  readonly paydays: ReadonlyArray<number>
  /** IANA-пояс; у старых настроек без поля используется московское время. */
  readonly timeZone?: string
}

/** Цель накопления. Накоплено на ней — сумма операций «Отложено» минус «Снято» с её `goalId`. */
export interface GoalData {
  readonly name: string
  /** Название пиктограммы из встроенного набора, как у категорий. */
  readonly icon: string
  /** Целевая сумма, копейки. */
  readonly target: number
  /** Необязательный срок: к этой дате хочется накопить. */
  readonly deadline: IsoDate | null
  /** Цель в архиве: пропадает с дашборда, остаётся в списке целей. */
  readonly archived: boolean
  /** Когда цель создана, мс. Порядок в списке не меняется от правок. */
  readonly createdAt: number
}

export const SETTINGS_ID = "settings"

export type OperationRecord = SyncRecord<"operations", OperationData>
export type CategoryRecord = SyncRecord<"categories", CategoryData>
export type RecurringRecord = SyncRecord<"recurring", RecurringData>
export type SettingsRecord = SyncRecord<"settings", SettingsData>
export type GoalRecord = SyncRecord<"goals", GoalData>
