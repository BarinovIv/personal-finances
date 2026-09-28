import type { CategoryData, CategoryKind } from "@fin/domain"

export interface StarterCategory extends CategoryData {
  readonly id: string
}

const expense = (id: string, name: string, color: string): StarterCategory => ({ id, kind: "expense", name, color })
const income = (id: string, name: string, color: string): StarterCategory => ({ id, kind: "income", name, color })

/** Стартовый набор. Эти категории есть без записей в хранилище; правка или удаление создают запись с тем же id. */
export const STARTER_CATEGORIES: ReadonlyArray<StarterCategory> = [
  expense("food", "Продукты", "#3F6E5A"),
  expense("cafe", "Кафе", "#B0602A"),
  expense("transport", "Транспорт", "#2F5B8A"),
  expense("clothes", "Одежда", "#7A4E8C"),
  expense("home", "Дом", "#86693A"),
  expense("health", "Здоровье", "#A23B4B"),
  expense("fun", "Развлечения", "#9A7417"),
  expense("subscriptions", "Подписки", "#4B6B8F"),
  expense("gifts", "Подарки", "#9B4F73"),
  expense("other", "Прочее", "#6B6862"),
  income("salary", "Зарплата", "#2F5D50"),
  income("side", "Подработка", "#3E7C6B"),
  income("other-income", "Прочие доходы", "#5B7F75")
]

/** Цвета для новых категорий — по кругу. */
export const CATEGORY_PALETTE: Record<CategoryKind, ReadonlyArray<string>> = {
  expense: ["#5A6E2F", "#8C4E4E", "#2F7A8A", "#8A5A2F", "#5E4E8C", "#3F5E6E", "#8C7A2F", "#6E3F5A"],
  income: ["#4E7C3E", "#2F6E7A", "#6B7F3E", "#3E5B7C"]
}

export const UNKNOWN_CATEGORY_COLOR = "#8A857C"
