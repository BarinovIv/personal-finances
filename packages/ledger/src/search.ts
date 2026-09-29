import { formatDecimal, isMovement } from "@fin/domain"
import type { LedgerContext } from "./context"
import { groupByDay } from "./days"
import { OPERATION_KIND_TEXT } from "./format"
import type { RecordOf } from "./records"
import type { DayGroup } from "./views"

export interface SearchSummary {
  /** Сколько операций нашлось. */
  readonly count: number
  /**
   * Сумма найденных расходов, доходов и возвратов, копейки (без учёта знака вида операции).
   * Операции вне расходов и доходов находятся, но в сумму не входят.
   */
  readonly total: number
  /** Найденные операции по дням, сначала новые. */
  readonly days: ReadonlyArray<DayGroup>
}

const normalize = (text: string) => text.toLocaleLowerCase("ru").trim()

/** «1500,00» → «1500»: чтобы «150» находило и «1500», и «150,00». */
const amountText = (kopecks: number) => formatDecimal(kopecks).replace(/,00$/, "")

/** По чему ищется операция: описание и сумма, у операций вне расходов и доходов — ещё вид и человек. */
const searchText = (ctx: LedgerContext, record: RecordOf<"operations">) => {
  const text = `${normalize(record.data.description)} ${amountText(record.data.amount)}`
  if (!isMovement(record.data.kind)) return text
  return `${text} ${OPERATION_KIND_TEXT[record.data.kind]} ${normalize(ctx.toView(record).person ?? "")}`
}

/**
 * Поиск по ленте: подстрока в описании или в сумме операции (в рублях). Пустой запрос —
 * вся лента. `categoryIds` сужает поиск до выбранных категорий; пустой список — все категории.
 */
export const searchOperations = (
  ctx: LedgerContext,
  query: string,
  categoryIds: ReadonlyArray<string> = []
): SearchSummary => {
  const q = normalize(query)
  const categories = new Set(categoryIds)
  const matches = ctx.operations().filter((r) => {
    if (categories.size > 0 && !categories.has(r.data.categoryId)) return false
    if (!q) return true
    return searchText(ctx, r).includes(q)
  })
  return {
    count: matches.length,
    total: matches.reduce((sum, r) => sum + (isMovement(r.data.kind) ? 0 : r.data.amount), 0),
    days: groupByDay(ctx, matches)
  }
}
