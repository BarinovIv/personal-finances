import type { OperationData, OperationRecord, RecurringData, RecurringRecord } from "@fin/domain"
import type { BackupData } from "@fin/ledger"

export const recurringOperation = (data: Partial<OperationData> = {}, id = "rec:net:2026-09"): OperationRecord => ({
  collection: "operations",
  id,
  deleted: false,
  updatedAt: 1,
  data: {
    kind: "expense",
    description: "Интернет дома",
    amount: 65000,
    categoryId: "subscriptions",
    date: "2026-09-25",
    createdAt: 1,
    categorizedAt: 1,
    recurringId: "net",
    refundOf: null,
    pending: true,
    ...data
  }
})

export const recurringTemplate = (data: Partial<RecurringData> = {}): RecurringRecord => ({
  collection: "recurring",
  id: "net",
  deleted: false,
  updatedAt: 1,
  data: {
    kind: "expense",
    description: "Интернет дома",
    amount: 65000,
    categoryId: "subscriptions",
    dayOfMonth: 25,
    startDate: "2026-09-01",
    status: "active",
    ...data
  }
})

/** Разобрать доверенный результат публичного экспортера для сравнения в тестах. */
export const readBackup = (text: string): BackupData => JSON.parse(text)
