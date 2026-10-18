import type { LedgerContext } from "./context"
import { BACKUP_FORMAT, BACKUP_VERSION } from "./backup/constants"
import { planBackup, safeBackupMeta } from "./backup/helpers"
import type { BackupPreview } from "./backup/types"

/** Полная копия данных пользователя, включая удаления, версии и локальные настройки. */
export const exportBackup = async (ctx: LedgerContext): Promise<string> => {
  const snapshot = await ctx.records.durableSnapshot()
  const userId = typeof snapshot.meta.userId === "string" ? snapshot.meta.userId : null
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), userId, records: snapshot.records, outbox: snapshot.outbox, meta: safeBackupMeta(snapshot.meta) }, null, 2)
}

export const previewBackup = (ctx: LedgerContext, text: string): BackupPreview => planBackup(ctx.records.snapshot(), text).preview
export const importBackup = (ctx: LedgerContext, text: string): Promise<BackupPreview> => ctx.records.restoreBackup(text)
