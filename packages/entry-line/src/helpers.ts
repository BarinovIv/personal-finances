import { AMOUNT, CURRENCY, DATE_WORDS, GROUPED, MAX_CALCULATOR_ENTRIES } from "./constants"

export const validAmount = (kopecks: number) => Number.isSafeInteger(kopecks) && kopecks > 0

/** Один токен суммы → копейки, иначе null. */
export const parseAmountToken = (token: string, allowZero = false): number | null => {
  const m = AMOUNT.exec(token)
  if (!m) return null
  const [, number, thousands] = m
  let text = number!
  if (!thousands) {
    // "1.500" — разряды, "99.90" — копейки
    const fraction = /[.,](\d+)$/.exec(text)?.[1]
    if (fraction !== undefined && fraction.length === 3) text = text.replace(/[.,]/, "")
    else if (fraction !== undefined && fraction.length > 2) return null
  }
  const value = Number(text.replace(",", ".")) * (thousands ? 1000 : 1)
  const kopecks = Math.round(value * 100)
  return validAmount(kopecks) || (allowZero && kopecks === 0) ? kopecks : null
}

export const isAmount = (token: string) => parseAmountToken(token) !== null

export const amountAtEdge = (tokens: ReadonlyArray<string>, edge: "start" | "end", allowZero = false) => {
  const take = (n: number) => (edge === "end" ? tokens.slice(-n) : tokens.slice(0, n))
  const rest = (n: number) => (edge === "end" ? tokens.slice(0, tokens.length - n) : tokens.slice(n))
  for (let n = Math.min(tokens.length, 5); n >= 2; n--) {
    const candidate = take(n).join(" ")
    if (GROUPED.test(candidate)) {
      const kopecks = Math.round(Number(candidate.replace(/ /g, "").replace(",", ".")) * 100)
      return validAmount(kopecks) || (allowZero && kopecks === 0) ? { kopecks, rest: rest(n) } : null
    }
  }
  const single = tokens.length > 0 ? parseAmountToken(take(1)[0]!, allowZero) : null
  return single !== null ? { kopecks: single, rest: rest(1) } : null
}

/** Сумма в конце строки, а если там её нет — в начале. */
export const takeAmount = (tokens: ReadonlyArray<string>, allowZero = false) => {
  const body = CURRENCY.test(tokens.at(-1) ?? "") ? tokens.slice(0, -1) : tokens
  return amountAtEdge(body, "end", allowZero) ?? amountAtEdge(tokens, "start", allowZero)
}

/** Разделяет арифметические знаки рядом с числами, сохраняя плюс дохода и знаки в описании. */
const calculatorTokens = (line: string) =>
  line.split(/\s+/).filter(Boolean).flatMap((token, i, tokens) => {
    const parts = token.split(/([+*/-])/).filter(Boolean)
    const previousParts = tokens[i - 1]?.split(/[+*/-]/).filter(Boolean) ?? []
    const followsAmount = previousParts.length > 0 && previousParts.every((part) => AMOUNT.test(part) || CURRENCY.test(part))
    // "магазин 24/7" — описание, в том числе рядом с вычисляемой суммой.
    const openingHours = token === "24/7" && /\p{L}/u.test(tokens[i - 1] ?? "") && !followsAmount
    const numeric = parts.every((part) => /^[+*/-]$/.test(part) || AMOUNT.test(part) || CURRENCY.test(part))
    const followsOperator = i > 0 && /^[+*/-]$/.test(tokens[i - 1]!)
    return numeric && !openingHours && (!/^[+*/-]/.test(token) || followsAmount || followsOperator) ? parts : [token]
  })

/** null — обычная сумма; пустой массив сумм — некорректное выражение. */
export const takeCalculation = (tokens: ReadonlyArray<string>) => {
  const original = tokens.filter((t) => !DATE_WORDS.has(t.toLowerCase()))
  if (original[0]?.startsWith("+")) original[0] = original[0].slice(1)
  if (CURRENCY.test(original.at(-1) ?? "")) original.pop()
  const ordinary = takeAmount(original)
  // Компактное "24/7" внутри описания не должно перехватывать обычную сумму с края.
  if (ordinary?.rest.some((token) => /^[\d.,]+[+*/-][\d.,+*/-]+$/.test(token)) &&
      !ordinary.rest.some((token) => /^[+*/-]/.test(token))) return null
  const body = calculatorTokens(original.join(" "))
  const operatorAt = body.findIndex((t, i) => i > 0 && /^[+*/-]$/.test(t) &&
    (AMOUNT.test(body[i - 1]!) || (CURRENCY.test(body[i - 1]!) && AMOUNT.test(body[i - 2] ?? ""))))
  if (operatorAt < 0) return null

  const first = takeAmount(body.slice(0, operatorAt), true)
  if (!first) return { amounts: [], rest: body.slice(0, operatorAt) }
  let rest = first.rest
  const parts = body.slice(operatorAt)
  const operators = parts.filter((t) => /^[+*/-]$/.test(t))
  if (operators.length > 1 && !operators.every((t) => t === "+")) return { amounts: [], rest }
  const amounts = [first.kopecks]
  while (parts.length > 0) {
    const operator = parts.shift()!
    const nextOperator = parts.findIndex((t) => /^[+*/-]$/.test(t))
    const operand = nextOperator < 0 ? parts.splice(0) : parts.splice(0, nextOperator)
    const last = amounts.at(-1)!
    if (operator === "*" || operator === "/") {
      const numeric = operand[0]?.match(/^\d+(?:[.,]\d+)?$/)?.[0]
      const factor = numeric === undefined ? NaN : Number(numeric.replace(",", "."))
      if (operand.length > 1) {
        if (rest.length > 0 || nextOperator >= 0) return { amounts: [], rest }
        rest = operand.slice(1)
      }
      if (operator === "*") {
        if (!/^\d+(?:[.,]0+)?$/.test(numeric ?? "") || !Number.isInteger(factor) || factor < 1 || factor > MAX_CALCULATOR_ENTRIES)
          return { amounts: [], rest }
        amounts.push(...Array<number>(factor - 1).fill(last))
      } else amounts[amounts.length - 1] = Math.round(last / factor)
    } else {
      const parsed = takeAmount(operand, true)
      if (!parsed || (parsed.rest.length > 0 && (rest.length > 0 || nextOperator >= 0))) return { amounts: [], rest }
      if (parsed.rest.length > 0) rest = parsed.rest
      if (operator === "+") amounts.push(parsed.kopecks)
      else if (operator === "-") amounts[amounts.length - 1] = last - parsed.kopecks
      else return { amounts: [], rest }
    }
    if (!amounts.every(validAmount) || amounts.length > MAX_CALCULATOR_ENTRIES) return { amounts: [], rest }
  }
  return { amounts, rest }
}
