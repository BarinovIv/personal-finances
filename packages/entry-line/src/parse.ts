import { SEPARATOR } from "./constants"
import { parseEntries } from "./helpers"
import type { ParsedEntryLine } from "./types"

export type { EntryProblem, ParsedEntryLine } from "./types"

export const parseEntryLine = (line: string): ParsedEntryLine => {
  const entries = parseEntries([line])
  const first = entries[0]!
  return entries.length === 1 ? first : {
    ...first,
    amount: null,
    problems: ["invalid-calculation", ...first.problems.filter((problem) => problem !== "invalid-calculation")]
  }
}

export const parseEntryLines = (line: string): ReadonlyArray<ParsedEntryLine> => parseEntries(line.split(SEPARATOR))
