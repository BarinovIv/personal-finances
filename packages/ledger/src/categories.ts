import type { PaletteColor } from "./palette"

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
