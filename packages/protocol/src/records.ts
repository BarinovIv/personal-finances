import type {
  CategoryData as CategoryDataType,
  OperationData as OperationDataType,
  RecurringData as RecurringDataType,
  SettingsData as SettingsDataType,
  SyncRecord as SyncRecordType
} from "@fin/domain"
import { Schema } from "effect"

const IsoDate = Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/))
const Kopecks = Schema.Int.pipe(Schema.positive())
const CategoryKind = Schema.Literal("expense", "income")

/**
 * Операция. Поля операций вне расходов и доходов необязательны: записи, созданные до их появления, читаются без изменений.
 * Цель, человек или долг обязательны у своего вида операции.
 */
export const OperationData = Schema.Struct({
  kind: Schema.Literal(
    "expense",
    "income",
    "refund",
    "saved",
    "withdrawn",
    "lent",
    "borrowed",
    "repaid-to-me",
    "repaid-by-me"
  ),
  amount: Kopecks,
  description: Schema.String,
  categoryId: Schema.String,
  date: IsoDate,
  createdAt: Schema.Number,
  categorizedAt: Schema.Number,
  refundOf: Schema.NullOr(Schema.String),
  recurringId: Schema.NullOr(Schema.String),
  goalId: Schema.optional(Schema.String),
  person: Schema.optional(Schema.String),
  repaymentOf: Schema.optional(Schema.String)
}).pipe(
  Schema.filter((data) => {
    switch (data.kind) {
      case "saved":
      case "withdrawn":
        return Boolean(data.goalId) || "нет цели"
      case "lent":
      case "borrowed":
        return Boolean(data.person?.trim()) || "нет человека"
      case "repaid-to-me":
      case "repaid-by-me":
        return Boolean(data.repaymentOf) || "нет долга"
      default:
        return true
    }
  })
)

export const CategoryData = Schema.Struct({
  kind: CategoryKind,
  name: Schema.String,
  color: Schema.String,
  icon: Schema.optional(Schema.String)
})

export const RecurringData = Schema.Struct({
  kind: CategoryKind,
  description: Schema.String,
  amount: Kopecks,
  categoryId: Schema.String,
  dayOfMonth: Schema.Int.pipe(Schema.between(1, 31)),
  startDate: IsoDate,
  status: Schema.Literal("active", "paused", "ended")
})

export const SettingsData = Schema.Struct({
  paydays: Schema.Array(Schema.Int.pipe(Schema.between(1, 31)))
})

const record = <C extends string, D extends Schema.Schema.Any>(collection: C, data: D) =>
  Schema.Struct({
    collection: Schema.Literal(collection),
    id: Schema.String,
    updatedAt: Schema.Number,
    deleted: Schema.Boolean,
    data
  })

export const OperationRecord = record("operations", OperationData)
export const CategoryRecord = record("categories", CategoryData)
export const RecurringRecord = record("recurring", RecurringData)
export const SettingsRecord = record("settings", SettingsData)

/** Любая синхронизируемая запись; данные проверяются по виду коллекции. */
export const SyncRecord = Schema.Union(OperationRecord, CategoryRecord, RecurringRecord, SettingsRecord)
export type SyncRecord = typeof SyncRecord.Type

// Схемы протокола и типы клиента описывают одно и то же.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const same = <T extends true>() => undefined as unknown as T
same<Same<typeof OperationData.Type, OperationDataType>>()
same<Same<typeof CategoryData.Type, CategoryDataType>>()
same<Same<typeof RecurringData.Type, RecurringDataType>>()
same<Same<typeof SettingsData.Type, SettingsDataType>>()
export const toDomainRecord = (record: SyncRecord): SyncRecordType => record
