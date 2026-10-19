import type { BackupPreview, CsvPreview } from "@fin/ledger"

export type ImportSelection =
  | { format: "json"; text: string; preview: BackupPreview }
  | { format: "csv"; text: string; preview: CsvPreview; ignoredRows: ReadonlyArray<number> }
