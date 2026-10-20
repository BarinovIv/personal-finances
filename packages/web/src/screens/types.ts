import type { Period } from "@fin/domain"
import type { BackupPreview, CsvPreview } from "@fin/ledger"

export type ImportSelection =
  | { format: "json"; text: string; preview: BackupPreview }
  | { format: "csv"; text: string; preview: CsvPreview; ignoredRows: ReadonlyArray<number> }

export type CsvExportPreset = "current-month" | "previous-month" | "two-months" | "custom" | "all-time"

export type CsvExportPeriodResult =
  | { ok: true; period: Period | undefined }
  | { ok: false; problem: string }
