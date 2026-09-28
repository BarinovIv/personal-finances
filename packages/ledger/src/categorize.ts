import type { CategoryKind } from "@fin/domain"
import { DICTIONARY } from "./dictionary"
import { descriptionKey, stems } from "./words"

export type CategorySource = "manual" | "history" | "dictionary"

export interface Suggestion {
  readonly categoryId: string
  readonly source: "history" | "dictionary"
}

interface Compiled {
  readonly phrases: ReadonlyArray<{ readonly stems: ReadonlyArray<string>; readonly categoryId: string }>
  /** Основа слова → категории (у расходов и доходов могут быть свои). */
  readonly words: ReadonlyMap<string, ReadonlyArray<string>>
}

const compile = (dictionary: Record<string, string>): Compiled => {
  const phrases: Array<{ stems: Array<string>; categoryId: string }> = []
  const words = new Map<string, Array<string>>()
  for (const [categoryId, list] of Object.entries(dictionary)) {
    for (const entry of list.split(",")) {
      const s = stems(entry)
      if (s.length === 0) continue
      if (s.length === 1) {
        const list = words.get(s[0]!) ?? []
        if (!list.includes(categoryId)) list.push(categoryId)
        words.set(s[0]!, list)
      } else phrases.push({ stems: s, categoryId })
    }
  }
  phrases.sort((a, b) => b.stems.length - a.stems.length)
  return { phrases, words }
}

let compiled: Compiled | undefined
const dictionary = () => (compiled ??= compile(DICTIONARY))

const containsRun = (haystack: ReadonlyArray<string>, needle: ReadonlyArray<string>) => {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

interface Choice {
  readonly categoryId: string
  readonly at: number
}

/** Операция, по которой учится подстановка. */
export interface HistoryEntry {
  readonly kind: CategoryKind
  readonly description: string
  readonly categoryId: string
  /** Когда выбрана категория: побеждает последний выбор. */
  readonly at: number
}

/** История: последняя категория для каждого описания и для каждого слова. Отдельной памяти нет. */
export class History {
  private readonly byDescription = new Map<string, Choice>()
  private readonly byWord = new Map<string, Choice>()

  constructor(entries: Iterable<HistoryEntry>) {
    for (const entry of entries) {
      const choice = { categoryId: entry.categoryId, at: entry.at }
      remember(this.byDescription, `${entry.kind}|${descriptionKey(entry.description)}`, choice)
      for (const s of new Set(stems(entry.description))) remember(this.byWord, `${entry.kind}|${s}`, choice)
    }
  }

  description(kind: CategoryKind, description: string) {
    return this.byDescription.get(`${kind}|${descriptionKey(description)}`)
  }

  word(kind: CategoryKind, stem: string) {
    return this.byWord.get(`${kind}|${stem}`)
  }
}

const remember = (map: Map<string, Choice>, key: string, choice: Choice) => {
  const current = map.get(key)
  if (!current || current.at <= choice.at) map.set(key, choice)
}

/**
 * Категория по описанию: сначала история (всё описание, потом отдельные слова), затем словарь.
 * `allowed` отсекает удалённые категории и категории другого вида.
 */
export const suggestCategory = (
  description: string,
  kind: CategoryKind,
  history: History,
  allowed: (categoryId: string) => boolean
): Suggestion | null => {
  const words = stems(description)
  if (words.length === 0) return null
  const pick = (categoryId: string | undefined, source: Suggestion["source"]) =>
    categoryId !== undefined && allowed(categoryId) ? { categoryId, source } : null

  const exact = pick(history.description(kind, description)?.categoryId, "history")
  if (exact) return exact
  for (const w of words) {
    const byWord = pick(history.word(kind, w)?.categoryId, "history")
    if (byWord) return byWord
  }

  const dict = dictionary()
  for (const phrase of dict.phrases) {
    if (containsRun(words, phrase.stems)) {
      const found = pick(phrase.categoryId, "dictionary")
      if (found) return found
    }
  }
  for (const w of words) {
    for (const categoryId of dict.words.get(w) ?? []) {
      const found = pick(categoryId, "dictionary")
      if (found) return found
    }
  }
  // «продуктовый» → «продукт»: начало слова, если основа из словаря достаточно длинная
  for (const w of words) {
    for (const [stem, categoryIds] of dict.words) {
      if (stem.length < 5 || !w.startsWith(stem)) continue
      for (const categoryId of categoryIds) {
        const found = pick(categoryId, "dictionary")
        if (found) return found
      }
    }
  }
  return null
}
