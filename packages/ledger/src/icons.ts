import type { CategoryKind } from "@fin/domain"

/** Встроенный набор пиктограмм категорий; рисуются приложением (см. `@fin/web`). */
export const CATEGORY_ICONS: ReadonlyArray<string> = [
  "cart",
  "cup",
  "car",
  "shirt",
  "home",
  "heart",
  "star",
  "card",
  "gift",
  "dots",
  "banknote",
  "briefcase",
  "wallet",
  "book",
  "plane",
  "plus"
]

const DEFAULT_ICON: Record<CategoryKind, string> = { expense: "dots", income: "wallet" }

/**
 * Иконка категории. У категорий, созданных до появления иконок, поля нет — подставляется
 * иконка по умолчанию для вида категории. Неизвестное имя (например, испорченное при синхронизации)
 * тоже заменяется значением по умолчанию.
 */
export const normalizeIcon = (raw: string | undefined, kind: CategoryKind): string =>
  raw !== undefined && CATEGORY_ICONS.includes(raw) ? raw : DEFAULT_ICON[kind]
