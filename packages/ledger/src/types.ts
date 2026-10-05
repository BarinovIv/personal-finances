import type { Undo } from "./undo"

export type RecurringProblem = "not-found" | "bad-amount" | "no-description" | "bad-category" | "bad-day"

export type MakeRecurringProblem = RecurringProblem | "unsupported-kind" | "already-recurring"

export type MakeRecurringResult =
  | { readonly ok: true; readonly id: string; readonly undo: Undo }
  | { readonly ok: false; readonly problem: MakeRecurringProblem }
