import type { LedgerContext } from "./context"
import { planCsv } from "./csv-import/helpers"
import type { CsvImportResult, CsvPreview } from "./types"
import { writeUndoable } from "./undo"

/** Проверка и восстановление CSV одной пачкой; повторная загрузка учитывает число одинаковых операций. */
export const previewCsv = (ctx: LedgerContext, text: string): CsvPreview => {
  const plan = planCsv(ctx, text)
  return plan.ok ? { ok: true, total: plan.total, duplicates: plan.duplicates, added: plan.added, rows: plan.rows } : plan
}

export const importCsv = async (ctx: LedgerContext, text: string): Promise<CsvImportResult> => {
  const plan = planCsv(ctx, text, true)
  if (!plan.ok) return plan
  const undo = await writeUndoable(ctx.records, plan.changes, ctx.records.stamp(), true)
  return { ok: true, total: plan.total, duplicates: plan.duplicates, added: plan.added, rows: plan.rows, undo }
}
