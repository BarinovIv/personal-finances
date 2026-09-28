/** Слова описания без регистра, «ё», пунктуации. */
export const words = (text: string): Array<string> =>
  text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9]+/)
    .filter(Boolean)

const STOP_WORDS = new Set([
  "в",
  "во",
  "на",
  "для",
  "с",
  "со",
  "из",
  "от",
  "по",
  "за",
  "и",
  "к",
  "ко",
  "у",
  "о",
  "об",
  "до",
  "the",
  "a"
])

// Окончания существительных, прилагательных и глаголов, от длинных к коротким.
const ENDINGS = [
  "иями",
  "ями",
  "ами",
  "иях",
  "ием",
  "ией",
  "иям",
  "ого",
  "его",
  "ому",
  "ему",
  "ыми",
  "ими",
  "ах",
  "ях",
  "ам",
  "ям",
  "ом",
  "ем",
  "ой",
  "ей",
  "ий",
  "ый",
  "ая",
  "яя",
  "ое",
  "ее",
  "ие",
  "ые",
  "ую",
  "юю",
  "ов",
  "ев",
  "ия",
  "ья",
  "ье",
  "ии",
  "ью",
  "их",
  "ых",
  "а",
  "я",
  "о",
  "е",
  "и",
  "ы",
  "у",
  "ю",
  "ь",
  "й"
]

/** Упрощённая основа слова: «футболку», «футболки», «футболка» → «футболк». */
export const stem = (word: string): string => {
  let w = word
  if (/[а-я]/.test(w) && w.length > 4 && /(ся|сь)$/.test(w)) w = w.slice(0, -2)
  if (!/[а-я]$/.test(w)) return w
  for (const ending of ENDINGS) {
    if (w.endsWith(ending) && w.length - ending.length >= 2) return w.slice(0, -ending.length)
  }
  return w
}

/** Основы значимых слов описания. */
export const stems = (text: string): Array<string> =>
  words(text)
    .filter((w) => !STOP_WORDS.has(w))
    .map(stem)

/** Ключ описания целиком: «Футболку  для сына» и «футболка для сына» совпадают. */
export const descriptionKey = (text: string): string => stems(text).join(" ")
