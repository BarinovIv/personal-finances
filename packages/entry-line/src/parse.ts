import type { OperationKind } from "@fin/domain"

export type EntryProblem = "no-amount" | "no-description" | "no-person" | "no-goal" | "no-expense"

/** Слова команды в начале операции; плюс всегда означает обычный доход. */
export const ENTRY_COMMANDS: ReadonlyArray<{ readonly text: string; readonly kind: OperationKind }> = [
  { text: "одолжил", kind: "lent" },
  { text: "занял", kind: "borrowed" },
  { text: "мне вернули", kind: "repaid-to-me" },
  { text: "я вернул", kind: "repaid-by-me" },
  { text: "вернул", kind: "repaid-by-me" },
  { text: "возврат", kind: "refund" },
  { text: "отложить", kind: "saved" },
  { text: "отложил", kind: "saved" },
  { text: "снять", kind: "withdrawn" },
  { text: "снял", kind: "withdrawn" }
]

export interface ParsedEntryLine {
  readonly kind: OperationKind
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

  if (kind !== "income") {
    const command = ENTRY_COMMANDS.find(({ text }) => {
      const words = text.split(" ")
      return words.every((word, i) => tokens[i]?.toLowerCase() === word)
    })
    if (command) {
      kind = command.kind
      tokens = tokens.slice(command.text.split(" ").length)
    } else if (tokens.length === 1 && (tokens[0]!.toLowerCase() === "мне" || tokens[0]!.toLowerCase() === "я")) {
      // Начало двухсловной команды тоже не становится описанием расхода.
      kind = tokens[0]!.toLowerCase() === "мне" ? "repaid-to-me" : "repaid-by-me"
      tokens = []
    }
  }

  const amount = takeAmount(tokens)
  const description = (amount ? amount.rest : tokens).join(" ")
  const problems: Array<EntryProblem> = []
  if (!amount) problems.push("no-amount")
  if (!description) problems.push(missingTarget(kind))
  return { kind, amount: amount?.kopecks ?? null, description, dateShift, problems }
}

const missingTarget = (kind: OperationKind): EntryProblem => {
  switch (kind) {
    case "lent":
    case "borrowed":
    case "repaid-to-me":
    case "repaid-by-me":
      return "no-person"
    case "saved":
    case "withdrawn":
      return "no-goal"
    case "refund":
      return "no-expense"
    default:
      return "no-description"
  }
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
  if (groups.length <= 1) return [parseEntryLine(groups[0]?.join(" ") ?? line)]

  const lead = line.trim().replace(/^\+\s*/, "").split(/\s+/)[0]!.toLowerCase()
  const shared = DATE_WORDS.get(lead)
  return groups.map((tokens) => {
    const parsed = parseEntryLine(tokens.join(" "))
    return shared !== undefined && !tokens.some(isDateWord) ? { ...parsed, dateShift: shared } : parsed
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
  const onAmount = isAmount(last) || (CURRENCY.test(last) && isAmount(current.at(-2) ?? ""))
  if (!onAmount) return false
  // «такси 450 вчера» — дата этой же операции, «такси 450 вчера кино 800» — уже следующей
  if (isDateWord(next)) return afterNext !== undefined && isWord(afterNext)
  return next.startsWith("+") || isWord(next)
}

const isAmount = (token: string) => parseAmountToken(token) !== null

const isDateWord = (token: string) => DATE_WORDS.has(token.toLowerCase())

/** Слово описания: с буквами, но не сумма («2к»), не валюта и не дата. */
const isWord = (token: string) => /\p{L}/u.test(token) && !isAmount(token) && !CURRENCY.test(token) && !isDateWord(token)

const DATE_WORDS = new Map([["сегодня", 0], ["вчера", -1], ["позавчера", -2]])

const CURRENCY = /^(₽|р|р\.|руб|руб\.|рублей|рубля)$/i

/** Сумма в конце строки, а если там её нет — в начале. */
const takeAmount = (tokens: ReadonlyArray<string>) => {
  const body = CURRENCY.test(tokens.at(-1) ?? "") ? tokens.slice(0, -1) : tokens
  return amountAtEdge(body, "end") ?? amountAtEdge(tokens, "start")
}

/** Число с разрядами через пробел: «1 500», «1 250 000,50». */
const GROUPED = /^\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?$/

const amountAtEdge = (tokens: ReadonlyArray<string>, edge: "start" | "end") => {
  const take = (n: number) => (edge === "end" ? tokens.slice(-n) : tokens.slice(0, n))
  const rest = (n: number) => (edge === "end" ? tokens.slice(0, tokens.length - n) : tokens.slice(n))
  for (let n = Math.min(tokens.length, 5); n >= 2; n--) {
    const candidate = take(n).join(" ")
    if (GROUPED.test(candidate)) {
      const kopecks = Math.round(Number(candidate.replace(/ /g, "").replace(",", ".")) * 100)
      return validAmount(kopecks) ? { kopecks, rest: rest(n) } : null
    }
  }
  const single = tokens.length > 0 ? parseAmountToken(take(1)[0]!) : null
  return single !== null && single > 0 ? { kopecks: single, rest: rest(1) } : null
}

const AMOUNT = /^(\d+(?:[.,]\d+)?)(к|k|т|тыс\.?)?(₽|р|р\.|руб\.?)?$/i

const validAmount = (kopecks: number) => Number.isSafeInteger(kopecks) && kopecks > 0

/** Один токен суммы → копейки, иначе null. */
const parseAmountToken = (token: string): number | null => {
  const m = AMOUNT.exec(token)
  if (!m) return null
  const [, number, thousands] = m
  let text = number!
  if (!thousands) {
    // «1.500» — разряды, «99.90» — копейки
    const fraction = /[.,](\d+)$/.exec(text)?.[1]
    if (fraction !== undefined && fraction.length === 3) text = text.replace(/[.,]/, "")
    else if (fraction !== undefined && fraction.length > 2) return null
  }
  const value = Number(text.replace(",", ".")) * (thousands ? 1000 : 1)
  const kopecks = Math.round(value * 100)
  return validAmount(kopecks) ? kopecks : null
}
