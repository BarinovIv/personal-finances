import type { MovementKind, OperationData, OperationKind } from "./records"

/** Куда двигаются свободные деньги: +1 — пришли, −1 — ушли. */
const SIGN: Record<MovementKind, 1 | -1> = {
  saved: -1,
  withdrawn: 1,
  lent: -1,
  borrowed: 1,
  "repaid-to-me": 1,
  "repaid-by-me": -1
}

export const MOVEMENT_KINDS = Object.keys(SIGN) as ReadonlyArray<MovementKind>

/** Операция вне расходов и доходов: без категории, в расходы, доходы и категории не входит. */
export const isMovement = (kind: OperationKind): kind is MovementKind => kind in SIGN

/** Ушли ли деньги: у расхода и у «Отложено», «Одолжил», «Я вернул». */
export const isOutflow = (kind: OperationKind): boolean => kind === "expense" || (isMovement(kind) && SIGN[kind] < 0)

/** Вклад операции в свободные деньги помимо расходов и доходов; у расхода, дохода и возврата — ноль. */
export const movementEffect = (data: Pick<OperationData, "kind" | "amount">): number =>
  isMovement(data.kind) ? SIGN[data.kind] * data.amount : 0

/** Какой долг гасит погашение: «Мне вернули» — «Одолжил», «Я вернул» — «Занял». */
export const DEBT_OF_REPAYMENT = { "repaid-to-me": "lent", "repaid-by-me": "borrowed" } as const

export type RepaymentKind = keyof typeof DEBT_OF_REPAYMENT
export type DebtKind = (typeof DEBT_OF_REPAYMENT)[RepaymentKind]

export const isRepayment = (kind: OperationKind): kind is RepaymentKind => kind in DEBT_OF_REPAYMENT

/**
 * Операция, к которой привязана эта: у возврата — расход, у погашения — долг.
 * Удаление исходной операции удаляет и привязанные.
 */
export const parentOperation = (data: OperationData): string | null =>
  data.kind === "refund" ? data.refundOf : isRepayment(data.kind) ? (data.repaymentOf ?? null) : null
