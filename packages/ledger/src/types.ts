import type { CategoryData, OperationData } from "@fin/domain"
import type { Undo } from "./undo"

export type RecurringProblem = "not-found" | "bad-amount" | "no-description" | "bad-category" | "bad-day"

export type MakeRecurringProblem = RecurringProblem | "unsupported-kind" | "already-recurring"

export type MakeRecurringResult =
  | { readonly ok: true; readonly id: string; readonly undo: Undo }
  | { readonly ok: false; readonly problem: MakeRecurringProblem }

export interface CsvProblem {
  readonly row: number
  readonly message: string
}

export interface CsvRow {
  readonly row: number
  readonly date: string
  readonly kind: string
  readonly description: string
  readonly category: string
  readonly amount: number
}

export type CsvPreview =
  | { readonly ok: true; readonly total: number; readonly duplicates: number; readonly added: number; readonly rows: ReadonlyArray<CsvRow> }
  | { readonly ok: false; readonly problems: ReadonlyArray<CsvProblem> }

export type CsvImportResult =
  | { readonly ok: true; readonly total: number; readonly duplicates: number; readonly added: number; readonly rows: ReadonlyArray<CsvRow>; readonly undo: Undo }
  | { readonly ok: false; readonly problems: ReadonlyArray<CsvProblem> }

export type CsvChange =
  | { readonly collection: "operations"; readonly id: string; readonly data: OperationData }
  | { readonly collection: "categories"; readonly id: string; readonly data: CategoryData }
