import { addDays, type IsoDate, type OperationData, type OperationKind } from "@fin/domain"
import { parseEntryLine, parseEntryLines, type EntryProblem, type ParsedEntryLine } from "@fin/entry-line"
import { suggestCategory, type CategorySource } from "./categorize"
import type { LedgerContext } from "./context"
import { limitWarnings, type LimitWarning } from "./limits"
import { byDateDesc } from "./movements"
import { writeUndoable, type Undo } from "./undo"
import type { OperationView } from "./views"

/** Что пользователь выбрал вручную поверх распознанного из строки ввода. */
export interface EntryChoice {
  readonly categoryId?: string | null
  readonly date?: IsoDate | null
  /** Конкретный расход для возврата при совпадающих названиях. */
  readonly targetId?: string | null
}

export type EntryPreviewProblem = EntryProblem | "no-category" | "choose-target" | "too-much"

export interface EntryTarget {
  readonly id: string
  readonly label: string
  readonly date: IsoDate | null
  /** Сумма расхода, которую ещё можно вернуть. */
  readonly remaining: number
}

export interface EntryPreview {
  readonly kind: OperationKind
  readonly amount: number | null
  readonly description: string
  readonly date: IsoDate
  readonly categoryId: string | null
  /** Откуда категория: выбрана вручную, из истории или из словаря. */
  readonly categorySource: CategorySource | null
  readonly refundOf: string | null
  readonly targets: ReadonlyArray<EntryTarget>
  readonly problems: ReadonlyArray<EntryPreviewProblem>
}

/** `warnings` — предупреждения о лимитах категорий, которые задела эта операция. */
export type SubmitResult =
  | {
      readonly ok: true
      readonly operation: OperationView
      readonly undo: Undo
      readonly warnings: ReadonlyArray<LimitWarning>
    }
  | { readonly ok: false; readonly problems: ReadonlyArray<EntryPreviewProblem> }

/** Выбор вручную для строки с несколькими операциями. */
export interface EntriesChoice {
  /** Категории по порядку операций в строке. */
  readonly categoryIds?: ReadonlyArray<string | null | undefined>
  /** Расходы для возврата по порядку операций. */
  readonly targetIds?: ReadonlyArray<string | null | undefined>
  /** Дата сразу для всех операций строки. */
  readonly date?: IsoDate | null
}

export type SubmitEntriesResult =
  /** `undo` удаляет все операции, сохранённые строкой; `warnings` — одно предупреждение о лимите на категорию. */
  | {
      readonly ok: true
      readonly operations: ReadonlyArray<OperationView>
      readonly undo: Undo
      readonly warnings: ReadonlyArray<LimitWarning>
    }
  | { readonly ok: false; readonly index: number; readonly problems: ReadonlyArray<EntryPreviewProblem> }

export const previewEntry = (ctx: LedgerContext, line: string, choice: EntryChoice = {}): EntryPreview =>
  checkCaps([previewParsed(ctx, parseEntryLine(line), choice)])[0]!

export const previewEntries = (ctx: LedgerContext, line: string, choice: EntriesChoice = {}): Array<EntryPreview> =>
  checkCaps(parseEntryLines(line).map((parsed, i) =>
    previewParsed(ctx, parsed, { categoryId: choice.categoryIds?.[i], targetId: choice.targetIds?.[i], date: choice.date })
  ))

const previewParsed = (ctx: LedgerContext, parsed: ParsedEntryLine, choice: EntryChoice): EntryPreview => {
  const date = choice.date ?? addDays(ctx.today(), parsed.dateShift)
  let categoryId: string | null = null
  let categorySource: CategorySource | null = null
  let refundOf: string | null = null
  let description = parsed.description
  const targets = entryTargets(ctx, parsed)
  let problems: Array<EntryPreviewProblem> = [...parsed.problems]

  if (parsed.kind === "expense" || parsed.kind === "income") {
    const kind = parsed.kind
    const allowed = (id: string) => ctx.allowed(id, kind)
    if (choice.categoryId && allowed(choice.categoryId)) {
      categoryId = choice.categoryId
      categorySource = "manual"
    } else {
      const suggestion = suggestCategory(parsed.description, kind, ctx.history(), allowed)
      if (suggestion) {
        categoryId = suggestion.categoryId
        categorySource = suggestion.source
      }
    }
    if (categoryId === null) problems.push("no-category")
  } else if (parsed.kind === "refund") {
    const target = choice.targetId
      ? targets.find((t) => t.id === choice.targetId)
      : parsed.description && targets.length === 1 ? targets[0] : undefined
    if (target) {
      // Выбор из списка позволяет заполнить команду, даже если имя ещё не набрано.
      problems = problems.filter((p) => p !== "no-expense")
      description = target.label
      refundOf = target.id
      categoryId = ctx.records.get("operations", target.id)!.data.categoryId
    } else if (parsed.description) {
      problems.push(targets.length > 1 ? "choose-target" : "no-expense")
    }
  }
  return {
    kind: parsed.kind,
    amount: parsed.amount,
    description,
    date,
    categoryId,
    categorySource,
    refundOf,
    targets,
    problems
  }
}

const targetKey = (text: string) => text.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ")

/** Кандидаты только своего вида и с точным совпадением имени; одинаковые названия остаются отдельными. */
const entryTargets = (ctx: LedgerContext, parsed: ParsedEntryLine): Array<EntryTarget> => {
  const matches = (label: string) => !parsed.description || targetKey(label) === targetKey(parsed.description)
  if (parsed.kind !== "refund") return []
  const completed = new Map<string, number>()
  for (const { data } of ctx.operations()) {
    const original = data.refundOf
    if (original) completed.set(original, (completed.get(original) ?? 0) + data.amount)
  }
  return ctx.operations()
    .filter((r) => r.data.kind === "expense")
    .filter((r) => matches(r.data.description))
    .sort((a, b) => byDateDesc(a.data, b.data))
    .map((r) => ({
      id: r.id,
      label: r.data.description,
      date: r.data.date,
      remaining: r.data.amount - (completed.get(r.id) ?? 0)
    }))
    .filter((target) => target.remaining > 0)
}

/** Проверяем остатки последовательно: две допустимые по отдельности суммы могут превысить общий остаток. */
const checkCaps = (previews: ReadonlyArray<EntryPreview>): Array<EntryPreview> => {
  const balances = new Map<string, number>()
  return previews.map((preview) => {
    const { amount, refundOf } = preview
    if (preview.problems.length > 0 || amount === null || !refundOf) return preview
    const initial = preview.targets.find((target) => target.id === refundOf)!.remaining
    const available = balances.get(refundOf) ?? initial
    const next = available - amount
    if (next < 0) return { ...preview, problems: [...preview.problems, "too-much"] }
    balances.set(refundOf, next)
    return preview
  })
}

export const submitEntry = async (ctx: LedgerContext, line: string, choice?: EntryChoice): Promise<SubmitResult> => {
  const result = await saveAll(ctx, [previewEntry(ctx, line, choice)])
  return result.ok
    ? { ok: true, operation: result.operations[0]!, undo: result.undo, warnings: result.warnings }
    : { ok: false, problems: result.problems }
}

/** Все операции строки сохраняются вместе или ни одна. */
export const submitEntries = (ctx: LedgerContext, line: string, choice?: EntriesChoice): Promise<SubmitEntriesResult> =>
  saveAll(ctx, previewEntries(ctx, line, choice))

const saveAll = async (ctx: LedgerContext, previews: ReadonlyArray<EntryPreview>): Promise<SubmitEntriesResult> => {
  const index = previews.findIndex((p) => p.problems.length > 0 || p.amount === null)
  if (index >= 0) return { ok: false, index, problems: previews[index]!.problems }
  const before = ctx.operations()
  let stamp = 0
  const changes = previews.map((p) => {
    // своя отметка у каждой — в ленте операции строки идут в том же порядке, что и в ней
    stamp = ctx.records.stamp()
    const data: OperationData = {
      kind: p.kind,
      amount: p.amount!,
      description: p.description,
      categoryId: p.categoryId ?? "",
      date: p.date,
      createdAt: stamp,
      categorizedAt: stamp,
      refundOf: p.refundOf,
      recurringId: null
    }
    return { collection: "operations" as const, id: ctx.newId(), data }
  })
  const undo = await writeUndoable(ctx.records, changes, stamp)
  return {
    ok: true,
    operations: changes.map((c) => ctx.toView(ctx.records.get("operations", c.id)!)),
    undo,
    warnings: limitWarnings(ctx, before, previews.map((p) => p.date))
  }
}
