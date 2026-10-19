import type { LedgerContext } from "./context"
import { planCsv } from "./csv-import/helpers"
import type { CsvImportOptions, CsvImportResult, CsvPreview } from "./types"
import { writeUndoable } from "./undo"

/** Проверка и восстановление CSV одной пачкой; повторная загрузка учитывает число одинаковых операций. */
export const previewCsv = (ctx: LedgerContext, text: string, options?: CsvImportOptions): CsvPreview => {
  const plan = planCsv(ctx, text, options)
  return plan.ok ? { ok: true, total: plan.total, duplicates: plan.duplicates, added: plan.added, rows: plan.rows, ignored: plan.ignored } : plan
}

export const importCsv = async (ctx: LedgerContext, text: string, options?: CsvImportOptions): Promise<CsvImportResult> => {
  const plan = planCsv(ctx, text, options, true)
  if (!plan.ok) return plan
  const undo = await writeUndoable(ctx.records, plan.changes, ctx.records.stamp(), true)
  return { ok: true, total: plan.total, duplicates: plan.duplicates, added: plan.added, rows: plan.rows, ignored: plan.ignored, undo }
}
