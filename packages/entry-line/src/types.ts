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

export interface Calculation {
  readonly amount: number | null
  readonly end: number
  readonly arithmetic: boolean
}

/** Точное число для вычисления без промежуточного округления. */
export interface Rational {
  readonly numerator: bigint
  readonly denominator: bigint
}
