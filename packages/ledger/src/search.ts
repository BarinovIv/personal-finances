import { formatDecimal } from "@fin/domain"
import type { LedgerContext } from "./context"
import { groupByDay } from "./days"
import type { DayGroup } from "./views"

export interface SearchSummary {
  /** Сколько операций нашлось. */
  readonly count: number
  /** Сумма найденных операций, копейки (без учёта знака вида операции). */
  readonly total: number
  /** Найденные операции по дням, сначала новые. */
  readonly days: ReadonlyArray<DayGroup>
}

const normalize = (text: string) => text.toLocaleLowerCase("ru").trim()

/** «1500,00» → «1500»: чтобы «150» находило и «1500», и «150,00». */
const amountText = (kopecks: number) => formatDecimal(kopecks).replace(/,00$/, "")

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
    return `${normalize(r.data.description)} ${amountText(r.data.amount)}`.includes(q)
  })
  return {
    count: matches.length,
    total: matches.reduce((sum, r) => sum + r.data.amount, 0),
    days: groupByDay(ctx, matches)
  }
}
