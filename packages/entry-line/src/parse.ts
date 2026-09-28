export type EntryProblem = "no-amount" | "no-description"

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

  const amount = takeAmount(tokens)
  const description = (amount ? amount.rest : tokens).join(" ")
  const problems: Array<EntryProblem> = []
  if (!amount) problems.push("no-amount")
  if (!description) problems.push("no-description")
  return { kind, amount: amount?.kopecks ?? null, description, dateShift, problems }
}

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
      return { kopecks: Math.round(Number(candidate.replace(/ /g, "").replace(",", ".")) * 100), rest: rest(n) }
    }
  }
  const single = tokens.length > 0 ? parseAmountToken(take(1)[0]!) : null
  return single !== null && single > 0 ? { kopecks: single, rest: rest(1) } : null
}

const AMOUNT = /^(\d+(?:[.,]\d+)?)(к|k|т|тыс\.?)?(₽|р|р\.|руб\.?)?$/i

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
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}
