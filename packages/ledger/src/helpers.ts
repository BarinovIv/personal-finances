import { CATEGORY_EMOJI_PATTERN, CATEGORY_EMOJI_SEGMENTER } from "./constants"

/** Один эмодзи, включая составные символы, модификаторы и флаги. */
export const isCategoryEmoji = (icon: string): boolean => {
  const [first, second] = CATEGORY_EMOJI_SEGMENTER.segment(icon)
  return first !== undefined && second === undefined && CATEGORY_EMOJI_PATTERN.test(icon)
}
