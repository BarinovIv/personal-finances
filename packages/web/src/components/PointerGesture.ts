/** Минимальный сдвиг до выбора между свайпом и перестановкой. */
const GESTURE_SLOP = 6

export type PointerGesture = "pending" | "swipe" | "reorder"

/** Первое заметное направление фиксирует жест до отпускания указателя. */
export const pointerGesture = (dx: number, dy: number): PointerGesture => {
  if (Math.max(Math.abs(dx), Math.abs(dy)) <= GESTURE_SLOP) return "pending"
  return Math.abs(dx) > Math.abs(dy) ? "swipe" : "reorder"
}

/** Управление горизонтальным жестом без привязки к DOM-элементу, на котором он начался. */
export interface HorizontalPointerGesture {
  readonly start: (clientX: number) => void
  readonly move: (clientX: number) => void
  readonly end: () => void
}
