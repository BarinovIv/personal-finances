import { CURRENCY, DATE_WORDS } from "./constants"
import { isAmount, takeAmount, takeCalculation } from "./helpers"

export type EntryProblem = "no-amount" | "no-description" | "invalid-calculation"

export interface ParsedEntryLine {
  readonly kind: "expense" | "income"
  /** Копейки или null, если суммы нет. */
  readonly amount: number | null
  readonly description: string
  /** 0 — сегодня, −1 — вчера, −2 — позавчера. */
  readonly dateShift: number
  readonly problems: ReadonlyArray<EntryProblem>
}

export const parseEntryLine = (line: string): ParsedEntryLine => {
  let text = line.trim()
  let kind: ParsedEntryLine["kind"] = "expense"
  if (text.startsWith("+")) {
    kind = "income"
    text = text.slice(1).trim()
  }
  let tokens = text.split(/\s+/).filter(Boolean)

  let dateShift = 0
  const dateAt = tokens.findIndex((t) => DATE_WORDS.has(t.toLowerCase()))
  if (dateAt >= 0) {
    dateShift = DATE_WORDS.get(tokens[dateAt]!.toLowerCase())!
    tokens = tokens.filter((_, i) => i !== dateAt)
  }

  const calculation = takeCalculation(tokens)
  const amount = calculation
    ? { kopecks: calculation.amounts.length === 1 ? calculation.amounts[0]! : null, rest: calculation.rest }
    : takeAmount(tokens)
  const description = (amount ? amount.rest : tokens).join(" ")
  const problems: Array<EntryProblem> = []
  if (calculation && calculation.amounts.length !== 1) problems.push("invalid-calculation")
  else if (!amount) problems.push("no-amount")
  if (!description) problems.push("no-description")
  return { kind, amount: amount?.kopecks ?? null, description, dateShift, problems }
}

/**
 * Строка с несколькими операциями: «шаурма 340 шашлык 400 такси 500» или через запятую.
 * Операция кончается на сумме, за которой идёт слово, поэтому «2 кофе 500» и «футболка 1 500» — одна операция.
 * Слово даты в начале строки относится ко всем операциям, у которых нет своего.
 */
export const parseEntryLines = (line: string): ReadonlyArray<ParsedEntryLine> => {
  const groups = line
    .split(SEPARATOR)
    .flatMap((chunk) => splitAfterAmounts(chunk.split(/\s+/).filter(Boolean)))

  const lead = line.trim().replace(/^\+\s*/, "").split(/\s+/)[0]!.toLowerCase()
  const shared = DATE_WORDS.get(lead)
  if (groups.length === 0) return [parseEntryLine(line)]
  return groups.flatMap((tokens) => {
    const parsed = parseEntryLine(tokens.join(" "))
    const dated = shared !== undefined && !tokens.some(isDateWord) ? { ...parsed, dateShift: shared } : parsed
    const calculation = takeCalculation(tokens)
    return calculation && calculation.amounts.length > 1
      ? calculation.amounts.map((amount) => ({ ...dated, amount, problems: dated.problems.filter((p) => p !== "invalid-calculation") }))
      : [dated]
  })
}

/** Явный разделитель операций; запятая перед цифрой — это копейки («99,90»). */
const SEPARATOR = /[;\n]|,(?!\d)/

const splitAfterAmounts = (tokens: ReadonlyArray<string>): Array<Array<string>> => {
  const groups: Array<Array<string>> = []
  let current: Array<string> = []
  tokens.forEach((token, i) => {
    current.push(token)
    if (endsEntry(current, tokens[i + 1], tokens[i + 2])) {
      groups.push(current)
      current = []
    }
  })
  if (current.length > 0) groups.push(current)
  return groups
}

const endsEntry = (current: ReadonlyArray<string>, next: string | undefined, afterNext: string | undefined) => {
  if (next === undefined || !current.some(isWord)) return false
  const last = current.at(-1)!
  const onAmount = isAmount(last) || (CURRENCY.test(last) && isAmount(current.at(-2) ?? "")) || takeCalculation(current) !== null
  if (!onAmount) return false
  // «такси 450 вчера» — дата этой же операции, «такси 450 вчера кино 800» — уже следующей
  if (isDateWord(next)) return afterNext !== undefined && isWord(afterNext)
  if (next === "+" && (afterNext === undefined || (!isWord(afterNext) && !isDateWord(afterNext)))) return false
  if (/^\+\d/.test(next) && (afterNext === undefined || !isWord(afterNext))) return false
  return next.startsWith("+") || isWord(next)
}

const isDateWord = (token: string) => DATE_WORDS.has(token.toLowerCase())

/** Слово описания: с буквами, но не сумма («2к»), не валюта и не дата. */
const isWord = (token: string) => /\p{L}/u.test(token) && !isAmount(token) && !CURRENCY.test(token) && !isDateWord(token) && takeCalculation([token]) === null
