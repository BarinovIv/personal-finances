import { ENTRY_COMMANDS, parseEntryLine, parseEntryLines } from "@fin/entry-line"
import type { OperationKind } from "@fin/domain"
import type { LedgerContext } from "./context"
import { debtPeople, debtsOverview } from "./debts"
import { goalSavings } from "./movements"
import { refundedAmount } from "./operations"

const normalized = (text: string) => text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ")
const label = (text: string) => text.trim().replace(/\s+/g, " ")

const targets = (ctx: LedgerContext, kind: OperationKind): ReadonlyArray<string> => {
  switch (kind) {
    case "saved":
    case "withdrawn":
      return ctx.records.live("goals")
        .filter((goal) => kind === "saved" || goalSavings(ctx, goal.id) > 0)
        .map((goal) => goal.data.name)
    case "lent":
    case "borrowed":
      return debtPeople(ctx)
    case "repaid-to-me":
    case "repaid-by-me": {
      const direction = kind === "repaid-to-me" ? "lent" : "borrowed"
      return debtsOverview(ctx).people
        .filter((person) => person.open.some((debt) => debt.operation.kind === direction))
        .map((person) => person.name)
    }
    case "refund":
      return ctx.operations()
        .filter((operation) => operation.data.kind === "expense" && operation.data.amount > refundedAmount(ctx, operation.id))
        .map((operation) => operation.data.description)
    default:
      return []
  }
}

/** Находим незавершённую последнюю операцию через общий разбор, сохраняя исходные пробелы и разделители. */
const unfinished = (line: string): string | null => {
  const last = parseEntryLines(line).at(-1)!
  if (last.amount !== null || last.kind === "income") return null
  for (const token of line.matchAll(/[^\s;,]+/g)) {
    const suffix = line.slice(token.index)
    const parsed = parseEntryLine(suffix)
    if (parsed.kind === last.kind && parsed.description === last.description && parsed.amount === null && parseEntryLines(suffix).length === 1) {
      return suffix
    }
  }
  return null
}

/** Полная строка с дописанным окончанием: введённая часть никогда не меняется, суммы не подсказываются. */
export const completeEntry = (ctx: LedgerContext, line: string): string | null => {
  const chunk = unfinished(line)
  if (!chunk) return null
  for (const token of chunk.matchAll(/\S+/g)) {
    // Перед командой допустимо слово даты, которое общий разбор убирает из описания.
    const before = parseEntryLine(chunk.slice(0, token.index))
    if (before.description || before.amount !== null || before.kind !== "expense") continue
    const body = chunk.slice(token.index)
    const key = normalized(body)
    for (const command of ENTRY_COMMANDS) {
      const commandKey = normalized(command.text)
      if (key === commandKey) return line + " "
      if (key.startsWith(commandKey + " ")) {
        const words = body.match(/\S+/g)!.slice(0, command.text.split(" ").length)
        const commandEnd = words.reduce((offset, word) => body.indexOf(word, offset) + word.length, 0)
        const prefix = normalized(body.slice(commandEnd).replace(/^\s+/, ""))
        const names = new Map<string, string>()
        for (const candidate of targets(ctx, command.kind).map(label)) {
          const key = normalized(candidate)
          if (key.startsWith(prefix) && !names.has(key)) names.set(key, candidate)
        }
        const matches = [...names.values()]
        if (matches.length !== 1) return null
        const suffix = matches[0]!.slice(prefix.length)
        return suffix ? line + suffix : null
      }
    }
    const command = ENTRY_COMMANDS.find(({ text }) => normalized(text).startsWith(key))
    if (command) return line + command.text.slice(key.length) + " "
  }
  return null
}
