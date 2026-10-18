import { isTimeZone, recordKey, SETTINGS_ID, STARTER_CATEGORIES, type CategoryData, type GoalData, type OperationData, type RecurringData, type SettingsData } from "@fin/domain"
import { RECURRING_SEEN_PREFIX } from "../constants"
import { BACKUP_FORMAT, BACKUP_MAX_TIMESTAMP, BACKUP_OPERATION_FIELDS, BACKUP_VERSION } from "./constants"
import type { BackupData, BackupPlan, BackupRecord, BackupSnapshot } from "./types"

export const objectValue = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
export const onlyFields = (value: Record<string, unknown>, fields: ReadonlyArray<string>) => Object.keys(value).every((key) => fields.includes(key))
export const backupInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
export const backupTimestamp = (value: unknown): value is number => backupInteger(value) && value <= BACKUP_MAX_TIMESTAMP
export const backupMoney = (value: unknown): value is number => backupInteger(value) && value > 0
export const backupString = (value: unknown): value is string => typeof value === "string" && value.length > 0
export const backupDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export const optionalString = (value: unknown) => value === undefined || typeof value === "string"
export const optionalPosition = (value: unknown) => value === undefined || backupInteger(value)
export const categoryKind = (value: unknown) => value === "expense" || value === "income"

export const backupOperation = (value: unknown): value is OperationData => {
  if (!objectValue(value) || !onlyFields(value, BACKUP_OPERATION_FIELDS)) return false
  if (!backupMoney(value.amount) || typeof value.description !== "string" || typeof value.categoryId !== "string" || !backupDate(value.date) || !backupTimestamp(value.createdAt) || !backupTimestamp(value.categorizedAt)) return false
  if (!(value.refundOf === null || backupString(value.refundOf)) || !(value.recurringId === null || backupString(value.recurringId))) return false
  if (!(value.pending === undefined || typeof value.pending === "boolean") || !optionalString(value.goalId) || !optionalString(value.person) || !optionalString(value.repaymentOf)) return false
  if (value.pending && (!value.recurringId || !categoryKind(value.kind))) return false
  if (value.recurringId && !categoryKind(value.kind)) return false
  switch (value.kind) {
    case "expense":
    case "income": return backupString(value.categoryId) && value.refundOf === null && value.goalId === undefined && value.person === undefined && value.repaymentOf === undefined
    case "refund": return backupString(value.refundOf) && backupString(value.categoryId) && value.goalId === undefined && value.person === undefined && value.repaymentOf === undefined
    case "saved":
    case "withdrawn": return value.categoryId === "" && backupString(value.goalId) && value.refundOf === null && value.repaymentOf === undefined && value.person === undefined
    case "lent":
    case "borrowed": return value.categoryId === "" && backupString(value.person) && value.person.trim().length > 0 && value.refundOf === null && value.goalId === undefined && value.repaymentOf === undefined
    case "repaid-to-me":
    case "repaid-by-me": return value.categoryId === "" && backupString(value.repaymentOf) && value.refundOf === null && value.goalId === undefined && value.person === undefined
    default: return false
  }
}
export const backupCategory = (value: unknown): value is CategoryData => objectValue(value) && onlyFields(value, ["kind", "name", "color", "icon", "limit", "position"]) && categoryKind(value.kind) && backupString(value.name) && backupString(value.color) && optionalString(value.icon) && (value.limit === undefined || backupMoney(value.limit)) && optionalPosition(value.position)
export const backupRecurring = (value: unknown): value is RecurringData => objectValue(value) && onlyFields(value, ["kind", "description", "amount", "categoryId", "dayOfMonth", "startDate", "status", "position"]) && categoryKind(value.kind) && typeof value.description === "string" && backupMoney(value.amount) && backupString(value.categoryId) && backupMoney(value.dayOfMonth) && value.dayOfMonth <= 31 && backupDate(value.startDate) && (value.status === "active" || value.status === "paused" || value.status === "ended") && optionalPosition(value.position)
export const backupSettings = (value: unknown): value is SettingsData => objectValue(value) && onlyFields(value, ["paydays", "timeZone"]) && Array.isArray(value.paydays) && value.paydays.length > 0 && value.paydays.every((day) => backupMoney(day) && day <= 31) && new Set(value.paydays).size === value.paydays.length && (value.timeZone === undefined || (typeof value.timeZone === "string" && isTimeZone(value.timeZone)))
export const backupGoal = (value: unknown): value is GoalData => objectValue(value) && onlyFields(value, ["name", "icon", "target", "deadline", "archived", "createdAt"]) && backupString(value.name) && backupString(value.icon) && backupMoney(value.target) && (value.deadline === null || backupDate(value.deadline)) && typeof value.archived === "boolean" && backupTimestamp(value.createdAt)

export const backupRecord = (value: unknown): value is BackupRecord => {
  if (!objectValue(value) || !onlyFields(value, ["collection", "id", "updatedAt", "deleted", "data"]) || !backupString(value.id) || !backupTimestamp(value.updatedAt) || typeof value.deleted !== "boolean") return false
  switch (value.collection) {
    case "operations": return backupOperation(value.data)
    case "categories": return backupCategory(value.data)
    case "recurring": return backupRecurring(value.data)
    case "settings": return value.id === SETTINGS_ID && backupSettings(value.data)
    case "goals": return backupGoal(value.data)
    default: return false
  }
}

/** Локальная копия содержит только известные настройки, без произвольных данных и секретов. */
export const backupMeta = (value: unknown): value is Record<string, unknown> => objectValue(value) && Object.entries(value).every(([key, item]) => {
  if (key === "userId") return backupString(item)
  if (key === "syncCursor") return backupInteger(item)
  if (key === "dashboardMode") return item === "pay" || item === "month"
  if (key.startsWith(RECURRING_SEEN_PREFIX)) return key.length > RECURRING_SEEN_PREFIX.length && typeof item === "boolean"
  return false
})
export const safeBackupMeta = (meta: Readonly<Record<string, unknown>>) => Object.fromEntries(Object.entries(meta).filter(([key, value]) => backupMeta({ [key]: value })))

export const parseBackup = (text: string): BackupData | null => {
  let value: unknown
  try { value = JSON.parse(text) } catch { return null }
  if (!objectValue(value) || !onlyFields(value, ["format", "version", "exportedAt", "userId", "records", "outbox", "meta"]) || value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION || typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt)) || !(value.userId === null || backupString(value.userId)) || !Array.isArray(value.records) || !value.records.every(backupRecord) || !Array.isArray(value.outbox) || !value.outbox.every(backupString) || !backupMeta(value.meta)) return null
  if (value.meta.userId !== undefined && value.meta.userId !== value.userId) return null
  const keys = value.records.map((record) => recordKey(record.collection, record.id))
  if (new Set(keys).size !== keys.length || new Set(value.outbox).size !== value.outbox.length || value.outbox.some((key) => !keys.includes(key))) return null
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: value.exportedAt, userId: value.userId, records: value.records, outbox: value.outbox, meta: value.meta }
}

/** Сравнение JSON без зависимости от порядка ключей объекта. */
export const backupEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => backupEqual(item, right[index]))
  if (!objectValue(left) || !objectValue(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && backupEqual(left[key], right[key]))
}

export const backupRelations = (records: ReadonlyArray<BackupRecord>): string[] => {
  const byKey = new Map(records.map((record) => [recordKey(record.collection, record.id), record]))
  const problems: string[] = []
  const refunds = new Map<string, number>()
  const repayments = new Map<string, number>()
  const savings = new Map<string, number>()
  const categoryMatches = (id: string, kind: "expense" | "income") => {
    const category = byKey.get(recordKey("categories", id))
    return category?.collection === "categories" ? category.data.kind === kind : STARTER_CATEGORIES.some((starter) => starter.id === id && starter.kind === kind)
  }
  for (const record of records) {
    if (record.deleted) continue
    const fail = () => problems.push(`Нарушена связь или остаток: ${record.collection}:${record.id}.`)
    if (record.collection === "recurring" && !categoryMatches(record.data.categoryId, record.data.kind)) fail()
    if (record.collection !== "operations") continue
    const data = record.data
    if ((data.kind === "expense" || data.kind === "income" || data.kind === "refund") && !categoryMatches(data.categoryId, data.kind === "income" ? "income" : "expense")) fail()
    if (data.recurringId) {
      const recurring = byKey.get(recordKey("recurring", data.recurringId))
      if (recurring?.collection !== "recurring" || recurring.data.kind !== data.kind) fail()
    }
    if (data.refundOf) {
      const parent = byKey.get(recordKey("operations", data.refundOf))
      if (parent?.collection !== "operations" || parent.data.kind !== "expense") fail()
      else if (!parent.deleted) refunds.set(parent.id, (refunds.get(parent.id) ?? 0) + data.amount)
    }
    if (data.repaymentOf) {
      const parent = byKey.get(recordKey("operations", data.repaymentOf))
      if (parent?.collection !== "operations" || parent.data.kind !== (data.kind === "repaid-to-me" ? "lent" : "borrowed")) fail()
      else if (!parent.deleted) repayments.set(parent.id, (repayments.get(parent.id) ?? 0) + data.amount)
    }
    if (data.goalId) {
      const goal = byKey.get(recordKey("goals", data.goalId))
      if (goal?.collection !== "goals") fail()
      savings.set(data.goalId, (savings.get(data.goalId) ?? 0) + (data.kind === "saved" ? data.amount : -data.amount))
    }
  }
  for (const [id, amount] of [...refunds, ...repayments]) {
    const parent = byKey.get(recordKey("operations", id))
    if (parent?.collection === "operations" && amount > parent.data.amount) problems.push(`Возвратов или погашений больше исходной суммы: ${id}.`)
  }
  for (const [id, amount] of savings) if (amount < 0) problems.push(`Снято больше накопленного на цели: ${id}.`)
  return problems
}

export const planBackup = (snapshot: BackupSnapshot, text: string): BackupPlan => {
  const backup = parseBackup(text)
  const empty = { records: [], meta: {} }
  if (!backup) return { ...empty, preview: { ok: false, problems: ["Некорректная резервная копия или неподдерживаемая версия формата."] } }
  const owner = typeof snapshot.meta.userId === "string" ? snapshot.meta.userId : null
  if (backup.userId !== owner) return { ...empty, preview: { ok: false, problems: ["Резервная копия принадлежит другому пользователю."] } }
  if (!snapshot.records.every(backupRecord)) return { ...empty, preview: { ok: false, problems: ["Текущие данные не прошли проверку формата."] } }
  const merged = new Map(snapshot.records.map((record) => [recordKey(record.collection, record.id), record]))
  const accepted: BackupRecord[] = []
  const counts = { operations: 0, categories: 0, recurring: 0, settings: 0, goals: 0 }
  let added = 0, updated = 0, unchanged = 0, skipped = 0
  const problems: string[] = []
  for (const record of backup.records) {
    counts[record.collection]++
    const key = recordKey(record.collection, record.id)
    const current = merged.get(key)
    if (!current) added++
    else if (current.updatedAt > record.updatedAt) { skipped++; accepted.push(current); continue }
    else if (current.updatedAt === record.updatedAt) {
      if (!backupEqual(current, record)) { problems.push(`Конфликт одинакового времени правки: ${key}.`); continue }
      unchanged++
    } else updated++
    accepted.push(record)
    merged.set(key, record)
  }
  problems.push(...backupRelations([...merged.values()]))
  if (problems.length) return { ...empty, preview: { ok: false, problems } }
  const meta: Record<string, unknown> = { syncCursor: 0 }
  for (const [key, value] of Object.entries(backup.meta)) {
    if (key === "dashboardMode" && snapshot.meta[key] !== value) meta[key] = value
    if (key.startsWith(RECURRING_SEEN_PREFIX) && value === true && snapshot.meta[key] !== true) meta[key] = true
  }
  return { records: accepted, meta, preview: { ok: true, version: 1, total: backup.records.length, added, updated, unchanged, skipped, localChanges: Object.keys(meta).filter((key) => key !== "syncCursor").length, counts } }
}
