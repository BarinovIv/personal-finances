import type { CategoryData, CategoryKind, Collection } from "@fin/domain"
import { CATEGORY_PALETTE } from "./categories"
import type { LedgerContext } from "./context"
import { normalizeIcon } from "./icons"
import { normalizePaletteColor } from "./palette"
import type { CategoryView } from "./views"

export type CategoryProblem = "empty-name" | "duplicate" | "not-found"
export type DeleteCategoryProblem = "not-found" | "needs-target" | "bad-target" | "last-category"
export type CategoryLimitProblem = "not-found" | "income" | "bad-limit"

/** Цвет и иконка выбираются пользователем при создании и правке категории. */
export interface CategoryStyle {
  readonly color?: string
  readonly icon?: string
}

/** Запись категории из её вида; без лимита поля `limit` нет — как у записей до появления лимитов. */
const categoryData = (category: CategoryView): CategoryData => {
  const { kind, name, color, icon, limit } = category
  return limit === null ? { kind, name, color, icon } : { kind, name, color, icon, limit }
}

const nameTaken = (ctx: LedgerContext, kind: CategoryKind, name: string, except?: string) =>
  [...ctx.categories().values()].some(
    (c) => c.kind === kind && c.id !== except && c.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru")
  )

export const addCategory = async (
  ctx: LedgerContext,
  kind: CategoryKind,
  rawName: string,
  style: CategoryStyle = {}
): Promise<{ ok: true; category: CategoryView } | { ok: false; problem: CategoryProblem }> => {
  const name = rawName.trim()
  if (!name) return { ok: false, problem: "empty-name" }
  if (nameTaken(ctx, kind, name)) return { ok: false, problem: "duplicate" }
  const custom = ctx.records.all("categories").filter((r) => r.data.kind === kind).length
  const color = style.color ? normalizePaletteColor(style.color) : CATEGORY_PALETTE[custom % CATEGORY_PALETTE.length]!
  const icon = normalizeIcon(style.icon, kind)
  const data: CategoryData = { kind, name, color, icon }
  const id = ctx.newId()
  await ctx.records.write([{ collection: "categories", id, data }])
  return { ok: true, category: { id, kind, name, color, icon, limit: null } }
}

/** Переименование меняет только запись категории: операции ссылаются на неё по id. */
export const renameCategory = async (
  ctx: LedgerContext,
  id: string,
  rawName: string
): Promise<{ ok: true } | { ok: false; problem: CategoryProblem }> => {
  const category = ctx.categories().get(id)
  if (!category) return { ok: false, problem: "not-found" }
  const name = rawName.trim()
  if (!name) return { ok: false, problem: "empty-name" }
  if (nameTaken(ctx, category.kind, name, id)) return { ok: false, problem: "duplicate" }
  await ctx.records.write([{ collection: "categories", id, data: categoryData({ ...category, name }) }])
  return { ok: true }
}

/** Правка цвета и/или иконки категории, без изменения названия. */
export const setCategoryStyle = async (
  ctx: LedgerContext,
  id: string,
  style: CategoryStyle
): Promise<{ ok: true } | { ok: false; problem: "not-found" }> => {
  const category = ctx.categories().get(id)
  if (!category) return { ok: false, problem: "not-found" }
  const data = categoryData({
    ...category,
    color: style.color ? normalizePaletteColor(style.color) : category.color,
    icon: style.icon ? normalizeIcon(style.icon, category.kind) : category.icon
  })
  await ctx.records.write([{ collection: "categories", id, data }])
  return { ok: true }
}

/** Лимит в месяц, копейки; null убирает лимит. Лимит бывает только у категорий расходов. */
export const setCategoryLimit = async (
  ctx: LedgerContext,
  id: string,
  limit: number | null
): Promise<{ ok: true } | { ok: false; problem: CategoryLimitProblem }> => {
  const category = ctx.categories().get(id)
  if (!category) return { ok: false, problem: "not-found" }
  if (category.kind !== "expense") return { ok: false, problem: "income" }
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) return { ok: false, problem: "bad-limit" }
  await ctx.records.write([{ collection: "categories", id, data: categoryData({ ...category, limit }) }])
  return { ok: true }
}

/** Сколько живых операций (и регулярных операций) в категории. */
export const categoryUsage = (ctx: LedgerContext, id: string): number =>
  ctx.operations().filter((r) => r.data.kind !== "refund" && r.data.categoryId === id).length +
  ctx.records.live("recurring").filter((r) => r.data.categoryId === id).length

/**
 * Удаление категории. Операции непустой категории переносятся в `moveTo` новой правкой —
 * поэтому и подстановка (история — это операции) переходит вместе с ними.
 */
export const deleteCategory = async (
  ctx: LedgerContext,
  id: string,
  options: { readonly moveTo?: string } = {}
): Promise<{ ok: true } | { ok: false; problem: DeleteCategoryProblem }> => {
  const category = ctx.categories().get(id)
  if (!category) return { ok: false, problem: "not-found" }
  const sameKind = [...ctx.categories().values()].filter((c) => c.kind === category.kind)
  if (sameKind.length <= 1) return { ok: false, problem: "last-category" }

  const moved: Array<{ collection: Collection; id: string; data: unknown }> = []
  for (const r of ctx.records.live("operations")) {
    if (r.data.categoryId === id) moved.push({ collection: "operations", id: r.id, data: r.data })
  }
  for (const r of ctx.records.live("recurring")) {
    if (r.data.categoryId === id) moved.push({ collection: "recurring", id: r.id, data: r.data })
  }
  if (moved.length > 0) {
    const target = options.moveTo ? ctx.categories().get(options.moveTo) : undefined
    if (!options.moveTo) return { ok: false, problem: "needs-target" }
    if (!target || target.kind !== category.kind || target.id === id) return { ok: false, problem: "bad-target" }
  }
  await ctx.records.write([
    ...moved.map((m) => ({ ...m, data: { ...(m.data as object), categoryId: options.moveTo! } })),
    { collection: "categories", id, data: categoryData(category), deleted: true }
  ])
  return { ok: true }
}
