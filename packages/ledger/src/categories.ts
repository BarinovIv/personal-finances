import type { CategoryData, CategoryKind } from "@fin/domain"
import type { PaletteColor } from "./palette"

export interface StarterCategory extends CategoryData {
  readonly id: string
  readonly icon: string
}

const expense = (id: string, name: string, color: PaletteColor, icon: string): StarterCategory => ({
  id,
  kind: "expense",
  name,
  color,
  icon
})
const income = (id: string, name: string, color: PaletteColor, icon: string): StarterCategory => ({
  id,
  kind: "income",
  name,
  color,
  icon
})

/** Стартовый набор. Эти категории есть без записей в хранилище; правка или удаление создают запись с тем же id. */
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

/** Цвет для новой категории, если пользователь его не выбрал, — по кругу. */
export const CATEGORY_PALETTE: ReadonlyArray<PaletteColor> = [
  "blue",
  "green",
  "orange",
  "purple",
  "red",
  "teal",
  "yellow",
  "pink",
  "indigo",
  "brown",
  "gray"
]

export const UNKNOWN_CATEGORY_COLOR: PaletteColor = "gray"
export const UNKNOWN_CATEGORY_ICON = "dots"
