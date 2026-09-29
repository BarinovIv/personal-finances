import { addDays, type IsoDate, type OperationData } from "@fin/domain"
import { parseEntryLine, parseEntryLines, type EntryProblem, type ParsedEntryLine } from "@fin/entry-line"
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

/** Выбор вручную для строки с несколькими операциями. */
export interface EntriesChoice {
  /** Категории по порядку операций в строке. */
  readonly categoryIds?: ReadonlyArray<string | null | undefined>
  /** Дата сразу для всех операций строки. */
  readonly date?: IsoDate | null
}

export type SubmitEntriesResult =
  | { readonly ok: true; readonly operations: ReadonlyArray<OperationView> }
  | { readonly ok: false; readonly index: number; readonly problems: ReadonlyArray<EntryPreviewProblem> }

export const previewEntry = (ctx: LedgerContext, line: string, choice: EntryChoice = {}): EntryPreview =>
  previewParsed(ctx, parseEntryLine(line), choice)

export const previewEntries = (ctx: LedgerContext, line: string, choice: EntriesChoice = {}): Array<EntryPreview> =>
  parseEntryLines(line).map((parsed, i) =>
    previewParsed(ctx, parsed, { categoryId: choice.categoryIds?.[i] ?? null, date: choice.date ?? null })
  )

const previewParsed = (ctx: LedgerContext, parsed: ParsedEntryLine, choice: EntryChoice): EntryPreview => {
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
  const result = await saveAll(ctx, [previewEntry(ctx, line, choice)])
  return result.ok ? { ok: true, operation: result.operations[0]! } : { ok: false, problems: result.problems }
}

/** Все операции строки сохраняются вместе или ни одна. */
export const submitEntries = (ctx: LedgerContext, line: string, choice?: EntriesChoice): Promise<SubmitEntriesResult> =>
  saveAll(ctx, previewEntries(ctx, line, choice))

const saveAll = async (ctx: LedgerContext, previews: ReadonlyArray<EntryPreview>): Promise<SubmitEntriesResult> => {
  const index = previews.findIndex((p) => p.problems.length > 0 || p.amount === null || p.categoryId === null)
  if (index >= 0) return { ok: false, index, problems: previews[index]!.problems }
  let stamp = 0
  const changes = previews.map((p) => {
    // своя отметка у каждой — в ленте операции строки идут в том же порядке, что и в ней
    stamp = ctx.records.stamp()
    const data: OperationData = {
      kind: p.kind,
      amount: p.amount!,
      description: p.description,
      categoryId: p.categoryId!,
      date: p.date,
      createdAt: stamp,
      categorizedAt: stamp,
      refundOf: null,
      recurringId: null
    }
    return { collection: "operations" as const, id: ctx.newId(), data }
  })
  await ctx.records.write(changes, stamp)
  return { ok: true, operations: changes.map((c) => ctx.toView(ctx.records.get("operations", c.id)!)) }
}
