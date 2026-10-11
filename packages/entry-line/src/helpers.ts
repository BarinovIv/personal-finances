import { AMOUNT, CURRENCY, DATE_WORDS, MAX_CALCULATION_DEPTH, MISSING_OPERATOR } from "./constants"
import type { Calculation, EntryProblem, ParsedEntryLine, Rational } from "./types"

const rational = (numerator: bigint, denominator = 1n): Rational => {
  if (denominator < 0n) {
    numerator = -numerator
    denominator = -denominator
  }
  let divisor = numerator < 0n ? -numerator : numerator
  let remainder = denominator
  while (remainder !== 0n) [divisor, remainder] = [remainder, divisor % remainder]
  return { numerator: numerator / divisor, denominator: denominator / divisor }
}

export const amountValue = (token: string, fractional = false): Rational | null => {
  const match = AMOUNT.exec(token)
  if (!match) return null
  let text = match[1]!
  const thousands = match[2]
  const fraction = /[.,](\d+)$/.exec(text)?.[1]
  if (!fractional && !thousands && fraction?.length === 3) text = text.replace(/[.,]/, "")
  else if (!fractional && !thousands && fraction !== undefined && fraction.length > 2) return null
  if (!Number.isFinite(Number(text.replace(",", ".")) * (thousands ? 1000 : 1))) return null
  const [whole, decimal = ""] = text.split(/[.,]/)
  return rational(BigInt(`${whole}${decimal}`) * (thousands ? 1000n : 1n), 10n ** BigInt(decimal.length))
}

export const isDateWord = (token: string) => DATE_WORDS.has(token.replace(/^\+/, "").toLowerCase())

/** Знаки внутри названий и часы работы остаются текстом описания. */
export const tokenize = (line: string): Array<string> => line.split(/\s+/).filter(Boolean).flatMap((token, index, tokens) => {
  if (token === "24/7" && /\p{L}/u.test(tokens[index - 1] ?? "") && !AMOUNT.test(tokens[index - 1]!)) return [token]
  const parts = token.split(/([+*/()-])/).filter(Boolean)
  if (!parts.every((part) => /^[+*/()-]$/.test(part) || AMOUNT.test(part) || CURRENCY.test(part))) return [token]
  return parts.flatMap((part, partIndex) => {
    const previous = parts[partIndex - 1] ?? ""
    const missing = (part === "(" && (AMOUNT.test(previous) || previous === ")")) || (AMOUNT.test(part) && previous === ")")
    return missing ? [MISSING_OPERATOR, part] : [part]
  })
})

export const startsCalculation = (token: string) => AMOUNT.test(token) || /^[+*/()-]$/.test(token) || token === MISSING_OPERATOR

export const incomeMarker = (tokens: ReadonlyArray<string>, index: number) =>
  tokens[index] === "+" && /\p{L}/u.test(tokens[index + 1] ?? "") && !AMOUNT.test(tokens[index + 1]!) && !CURRENCY.test(tokens[index + 1]!)

export const takeCalculation = (tokens: ReadonlyArray<string>, start: number): Calculation => {
  let end = start
  let arithmetic = false
  let invalid = false
  let depth = 0
  const operand = (fractional = false): Rational => {
    let sign = 1n
    while (tokens[end] === "+" || tokens[end] === "-") {
      arithmetic = true
      if (tokens[end++] === "-") sign *= -1n
    }
    if (tokens[end] === "(") {
      arithmetic = true
      if (depth >= MAX_CALCULATION_DEPTH) {
        invalid = true
        let nested = 1
        end++
        while (end < tokens.length && nested > 0 && (startsCalculation(tokens[end]!) || CURRENCY.test(tokens[end]!))) {
          if (tokens[end] === "(") nested++
          else if (tokens[end] === ")") nested--
          end++
        }
        return rational(0n)
      }
      end++
      depth++
      const value = sum(fractional)
      depth--
      if (tokens[end] === ")") end++
      else invalid = true
      if (CURRENCY.test(tokens[end] ?? "")) end++
      return { numerator: sign * value.numerator, denominator: value.denominator }
    }
    const first = tokens[end] ?? ""
    const value = amountValue(first, fractional)
    if (value === null) {
      invalid = true
      return rational(0n)
    }
    end++
    if (CURRENCY.test(tokens[end] ?? "")) end++
    return { numerator: sign * value.numerator, denominator: value.denominator }
  }
  const product = (fractional = false): Rational => {
    let value = operand(fractional)
    while (tokens[end] === "*" || tokens[end] === "/" || tokens[end] === MISSING_OPERATOR) {
      const operator = tokens[end++]
      arithmetic = true
      const right = operand(true)
      if (operator === MISSING_OPERATOR || (operator === "/" && right.numerator === 0n)) {
        invalid = true
        value = rational(0n)
      } else value = operator === "*"
        ? rational(value.numerator * right.numerator, value.denominator * right.denominator)
        : rational(value.numerator * right.denominator, value.denominator * right.numerator)
    }
    return value
  }
  const sum = (fractional = false): Rational => {
    let value = product(fractional)
    while ((tokens[end] === "+" || tokens[end] === "-") && !(depth === 0 && incomeMarker(tokens, end))) {
      const operator = tokens[end++]
      arithmetic = true
      const right = product(fractional)
      const leftNumerator = value.numerator * right.denominator
      const rightNumerator = right.numerator * value.denominator
      value = rational(operator === "+" ? leftNumerator + rightNumerator : leftNumerator - rightNumerator, value.denominator * right.denominator)
    }
    return value
  }
  const value = sum()
  // Сохраняем неверные знаки в одном выражении, чтобы оно не исчезло из предпросмотра.
  while (/^[+*/)-]$/.test(tokens[end] ?? "") && !incomeMarker(tokens, end)) {
    invalid = true
    arithmetic = true
    end++
  }
  if (end === start) end++
  // Положительную конечную сумму округляем один раз, включая ровно половину копейки.
  const kopecks = value.numerator > 0n ? (value.numerator * 200n + value.denominator) / (value.denominator * 2n) : 0n
  const valid = !invalid && kopecks > 0n && kopecks <= BigInt(Number.MAX_SAFE_INTEGER)
  return { amount: valid ? Number(kopecks) : null, end, arithmetic }
}

export const entry = (description: string, kind: ParsedEntryLine["kind"], dateShift: number, calculation?: Calculation): ParsedEntryLine => {
  const problems: Array<EntryProblem> = []
  if (!calculation || calculation.amount === null) problems.push(calculation?.arithmetic ? "invalid-calculation" : "no-amount")
  if (!description) problems.push("no-description")
  return { kind, description, dateShift, amount: calculation?.amount ?? null, problems }
}

/** Числа через пробел повторяют последнее описание; явно указанная дата действует дальше. */
export const parseEntries = (chunks: ReadonlyArray<string>): ReadonlyArray<ParsedEntryLine> => {
  const entries: Array<ParsedEntryLine> = []
  let dateShift = 0
  let previous: ParsedEntryLine | undefined
  for (const [chunkIndex, chunk] of chunks.entries()) {
    const chunkEntryStart = entries.length
    const tokens = tokenize(chunk)
    let description: Array<string> = []
    let kind: ParsedEntryLine["kind"] = "expense"
    let index = 0
    while (index < tokens.length) {
      let token = tokens[index]!
      if (isDateWord(token)) {
        if (token.startsWith("+")) kind = "income"
        dateShift = DATE_WORDS.get(token.replace(/^\+/, "").toLowerCase())!
        if (index === tokens.length - 1 && description.length === 0 && entries.length > 0 &&
            !chunks.slice(chunkIndex + 1).some((following) => following.trim())) {
          const last = entries.at(-1)!
          entries[entries.length - 1] = { ...last, dateShift }
        }
        index++
        continue
      }
      if (token.startsWith("+") && (token.length > 1 || index === 0 || incomeMarker(tokens, index))) {
        kind = "income"
        token = token.slice(1)
        if (!token) { index++; continue }
      }
      if (!startsCalculation(token)) {
        description.push(token)
        index++
        continue
      }
      const calculation = takeCalculation(tokens, index)
      index = calculation.end
      const following: Array<string> = []
      let next = index
      while (next < tokens.length && !startsCalculation(tokens[next]!) && !isDateWord(tokens[next]!) && !tokens[next]!.startsWith("+")) {
        following.push(tokens[next]!)
        next++
      }
      if (description.length === 0 && following.length > 0) {
        if (entries.length === chunkEntryStart && !calculation.arithmetic && /^\d+$/.test(token) && following.length === 1 && startsCalculation(tokens[next] ?? "")) {
          description = [token, ...following]
          index = next
          continue
        }
        const hasFollowingAmount = next < tokens.length && startsCalculation(tokens[next]!)
        const count = hasFollowingAmount ? (following.length > 1 ? 1 : previous ? 0 : following.length) : following.length
        description = following.slice(0, count)
        index += count
      }
      const ownDescription = description.length > 0
      const parsed = entry(ownDescription ? description.join(" ") : previous?.description ?? "", ownDescription ? kind : previous?.kind ?? kind, dateShift, calculation)
      entries.push(parsed)
      previous = parsed
      description = []
      kind = "expense"
    }
    if (description.length > 0 || kind === "income") {
      const parsed = entry(description.join(" "), kind, dateShift)
      entries.push(parsed)
      previous = parsed
    }
  }
  return entries.length > 0 ? entries : [entry("", "expense", dateShift)]
}
