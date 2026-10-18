import type { CategoryRecord, Collection, GoalRecord, OperationRecord, RecurringRecord, SettingsRecord } from "@fin/domain"

export type BackupRecord = OperationRecord | CategoryRecord | RecurringRecord | SettingsRecord | GoalRecord

export interface BackupData {
  readonly format: "finances-backup"
  readonly version: 1
  readonly exportedAt: string
  readonly userId: string | null
  readonly records: ReadonlyArray<BackupRecord>
  readonly outbox: ReadonlyArray<string>
  readonly meta: Readonly<Record<string, unknown>>
}

export interface BackupCounts {
  readonly operations: number
  readonly categories: number
  readonly recurring: number
  readonly settings: number
  readonly goals: number
}

export type BackupPreview =
  | { readonly ok: true; readonly version: 1; readonly total: number; readonly added: number; readonly updated: number; readonly unchanged: number; readonly skipped: number; readonly localChanges: number; readonly counts: BackupCounts }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> }

export interface BackupPlan {
  readonly preview: BackupPreview
  readonly records: ReadonlyArray<BackupRecord>
  readonly meta: Readonly<Record<string, unknown>>
}

export interface BackupSnapshot {
  readonly records: ReadonlyArray<{ readonly collection: Collection; readonly id: string; readonly updatedAt: number; readonly deleted: boolean; readonly data: unknown }>
  readonly outbox: ReadonlyArray<string>
  readonly meta: Readonly<Record<string, unknown>>
}
