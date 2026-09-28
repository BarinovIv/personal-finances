import { addDays, type IsoDate, type OperationData } from "@fin/domain"
import { parseEntryLine, type EntryProblem } from "@fin/entry-line"
import { suggestCategory, type CategorySource } from "./categorize"
import type { LedgerContext } from "./context"
import type { OperationView } from "./views"

/** Что пользователь выбрал вручную поверх распознанного из строки ввода. */
export interface EntryChoice {
  readonly categoryId?: string | null
  readonly date?: IsoDate | null
}

export type EntryPreviewProblem = EntryProblem | "no-category"

export interface EntryPreview {
  readonly kind: "expense" | "income"
  readonly amount: number | null
  readonly description: string
  readonly date: IsoDate
  readonly categoryId: string | null
  /** Откуда категория: выбрана вручную, из истории или из словаря. */
  readonly categorySource: CategorySource | null
  readonly problems: ReadonlyArray<EntryPreviewProblem>
}

export type SubmitResult =
  | { readonly ok: true; readonly operation: OperationView }
  | { readonly ok: false; readonly problems: ReadonlyArray<EntryPreviewProblem> }

export const previewEntry = (ctx: LedgerContext, line: string, choice: EntryChoice = {}): EntryPreview => {
  const parsed = parseEntryLine(line)
  const date = choice.date ?? addDays(ctx.today(), parsed.dateShift)
  const allowed = (id: string) => ctx.allowed(id, parsed.kind)

  let categoryId: string | null = null
  let categorySource: CategorySource | null = null
  if (choice.categoryId && allowed(choice.categoryId)) {
    categoryId = choice.categoryId
    categorySource = "manual"
  } else {
    const suggestion = suggestCategory(parsed.description, parsed.kind, ctx.history(), allowed)
    if (suggestion) {
      categoryId = suggestion.categoryId
      categorySource = suggestion.source
    }
  }

  const problems: Array<EntryPreviewProblem> = [...parsed.problems]
  if (categoryId === null) problems.push("no-category")
  return {
    kind: parsed.kind,
    amount: parsed.amount,
    description: parsed.description,
    date,
    categoryId,
    categorySource,
    problems
  }
}

export const submitEntry = async (ctx: LedgerContext, line: string, choice?: EntryChoice): Promise<SubmitResult> => {
  const p = previewEntry(ctx, line, choice)
  if (p.problems.length > 0 || p.amount === null || p.categoryId === null) {
    return { ok: false, problems: p.problems }
  }
  const id = ctx.newId()
  const stamp = ctx.records.stamp()
  const data: OperationData = {
    kind: p.kind,
    amount: p.amount,
    description: p.description,
    categoryId: p.categoryId,
    date: p.date,
    createdAt: stamp,
    categorizedAt: stamp,
    refundOf: null,
    recurringId: null
  }
  await ctx.records.write([{ collection: "operations", id, data }], stamp)
  return { ok: true, operation: ctx.toView(ctx.records.get("operations", id)!) }
}
