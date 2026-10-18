export const BACKUP_FORMAT = "finances-backup"
export const BACKUP_VERSION = 1
export const BACKUP_OPERATION_FIELDS = ["kind", "amount", "description", "categoryId", "date", "createdAt", "categorizedAt", "refundOf", "recurringId", "pending", "goalId", "person", "repaymentOf"]

/** Последняя миллисекунда 9999 года; оставляет запас для монотонных локальных отметок. */
export const BACKUP_MAX_TIMESTAMP = 253402300799999
