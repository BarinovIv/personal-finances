import type { CategoryData, CategoryKind } from "./records"

export interface StarterCategory extends CategoryData {
  readonly id: string
  readonly icon: string
}

const starter =
  (kind: CategoryKind) =>
  (id: string, name: string, color: string, icon: string): StarterCategory => ({ id, kind, name, color, icon })
const expense = starter("expense")
const income = starter("income")

/**
 * Стартовый набор. Эти категории есть без записей в хранилище; правка или удаление создают запись с тем же id.
 * Цвет — название из палитры (ADR-0004).
 */
export const STARTER_CATEGORIES: ReadonlyArray<StarterCategory> = [
  expense("food", "Продукты", "green", "cart"),
  expense("cafe", "Кафе", "orange", "cup"),
  expense("transport", "Транспорт", "blue", "car"),
  expense("clothes", "Одежда", "purple", "shirt"),
  expense("home", "Дом", "brown", "home"),
  expense("health", "Здоровье", "red", "heart"),
  expense("fun", "Развлечения", "yellow", "star"),
  expense("subscriptions", "Подписки", "indigo", "card"),
  expense("gifts", "Подарки", "pink", "gift"),
  expense("other", "Прочее", "gray", "dots"),
  income("salary", "Зарплата", "teal", "banknote"),
  income("side", "Подработка", "green", "briefcase"),
  income("other-income", "Прочие доходы", "gray", "wallet")
]

/** Название категории, которой нет: удалённой или неизвестной. */
export const UNKNOWN_CATEGORY_NAME = "Без категории"
