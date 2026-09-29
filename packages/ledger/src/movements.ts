import { DEBT_OF_REPAYMENT, type IsoDate, type OperationData, type RepaymentKind } from "@fin/domain"
import type { LedgerContext } from "./context"
import { writeUndoable, type Undo } from "./undo"
import type { OperationView } from "./views"

interface MovementBase {
  /** Копейки. */
  readonly amount: number
  /** По умолчанию сегодня. */
  readonly date?: IsoDate
  /** Необязательный комментарий. */
  readonly description?: string
}

interface GoalMovementInput extends MovementBase {
  readonly kind: "saved" | "withdrawn"
  readonly goalId: string
}

interface DebtInput extends MovementBase {
  readonly kind: "lent" | "borrowed"
  readonly person: string
}

/** Погашение долга; по умолчанию — весь остаток. */
interface RepaymentInput extends Omit<MovementBase, "amount"> {
  readonly kind: RepaymentKind
  readonly debtId: string
  readonly amount?: number
}

/** Что создать: операция вне расходов и доходов. Кнопки для них — у целей и долгов. */
export type MovementInput = GoalMovementInput | DebtInput | RepaymentInput

export type MovementProblem =
  | "bad-amount"
  | "no-goal"
  | "no-person"
  /** Погашение ссылается не на живой долг своего вида: «Мне вернули» — только по «Одолжил», «Я вернул» — по «Занял». */
  | "not-a-debt"
  /** Погашений больше долга или снято больше, чем накоплено на цели. */
  | "too-much"

export type MovementResult =
  /** `undo` удаляет эту операцию. */
  | { readonly ok: true; readonly operation: OperationView; readonly undo: Undo }
  | { readonly ok: false; readonly problem: MovementProblem }

export interface RepaymentsInfo {
  /** Уже погашено, копейки. */
  readonly repaid: number
  /** Остаток долга. Ноль — долг закрыт. */
  readonly remaining: number
  /** Сначала новые. */
  readonly items: ReadonlyArray<OperationView>
}

/** Сумма живых погашений долга, копейки. `except` — погашение, которое сейчас правят. */
export const repaidAmount = (ctx: LedgerContext, debtId: string, except?: string): number =>
  ctx
    .operations()
    .filter((r) => r.data.repaymentOf === debtId && r.id !== except)
    .reduce((sum, r) => sum + r.data.amount, 0)

/** Накоплено на цели: отложено − снято, копейки. `except` — операция, которую сейчас правят. */
export const goalSavings = (ctx: LedgerContext, goalId: string, except?: string): number =>
  ctx
    .operations()
    .filter((r) => r.data.goalId === goalId && r.id !== except)
    .reduce((sum, r) => sum + (r.data.kind === "saved" ? r.data.amount : r.data.kind === "withdrawn" ? -r.data.amount : 0), 0)

/** Сначала новые: по дате, в один день — по времени создания. */
export const byDateDesc =(a: OperationData, b: OperationData) =>
  a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1

/** Погашения долга; для операций, которые не долг, — undefined. */
export const repaymentsOf = (ctx: LedgerContext, debtId: string): RepaymentsInfo | undefined => {
  const record = ctx.records.get("operations", debtId)
  if (!record || record.deleted || (record.data.kind !== "lent" && record.data.kind !== "borrowed")) return undefined
  const items = ctx
    .operations()
    .filter((r) => r.data.repaymentOf === debtId)
    .sort((a, b) => byDateDesc(a.data, b.data))
    .map((r) => ctx.toView(r))
  const repaid = items.reduce((sum, r) => sum + r.amount, 0)
  return { repaid, remaining: record.data.amount - repaid, items }
}

/** Что не так с правкой операции вне расходов и доходов (часть `UpdateProblem`). */
export type MovementUpdateProblem = "bad-amount" | "bad-category" | "below-repayments" | "no-person"

/**
 * Проверка правки операции вне расходов и доходов: категории у неё нет, у долга есть человек,
 * погашений не больше долга, снято с цели не больше накопленного.
 */
export const movementUpdateProblem = (
  ctx: LedgerContext,
  id: string,
  current: OperationData,
  next: OperationData
): MovementUpdateProblem | null => {
  if (next.categoryId !== current.categoryId) return "bad-category"
  switch (next.kind) {
    case "lent":
    case "borrowed":
      if (!next.person) return "no-person"
      return next.amount < repaidAmount(ctx, id) ? "below-repayments" : null
    case "repaid-to-me":
    case "repaid-by-me": {
      const debt = next.repaymentOf ? ctx.records.get("operations", next.repaymentOf) : undefined
      return debt && next.amount + repaidAmount(ctx, debt.id, id) > debt.data.amount ? "bad-amount" : null
    }
    case "saved":
    case "withdrawn": {
      const effect = next.kind === "saved" ? next.amount : -next.amount
      return next.goalId && goalSavings(ctx, next.goalId, id) + effect < 0 ? "bad-amount" : null
    }
    default:
      return null
  }
}

/** Операция вне расходов и доходов: без категории, в расходы, доходы и категории не входит, но двигает свободные деньги. */
export const addMovement = async (ctx: LedgerContext, input: MovementInput): Promise<MovementResult> => {
  let refs: Pick<OperationData, "goalId" | "person" | "repaymentOf">
  let amount = input.amount
  let limit = Infinity
  switch (input.kind) {
    case "saved":
    case "withdrawn": {
      // цель — живая запись коллекции целей; на архивной цели можно и отложить, и снять
      const goal = input.goalId ? ctx.records.get("goals", input.goalId) : undefined
      if (!goal || goal.deleted) return { ok: false, problem: "no-goal" }
      if (input.kind === "withdrawn") limit = goalSavings(ctx, input.goalId)
      refs = { goalId: input.goalId }
      break
    }
    case "lent":
    case "borrowed": {
      const person = input.person.trim()
      if (!person) return { ok: false, problem: "no-person" }
      refs = { person }
      break
    }
    default: {
      const info = repaymentsOf(ctx, input.debtId)
      if (!info || ctx.records.get("operations", input.debtId)?.data.kind !== DEBT_OF_REPAYMENT[input.kind]) {
        return { ok: false, problem: "not-a-debt" }
      }
      amount ??= info.remaining
      limit = info.remaining
      refs = { repaymentOf: input.debtId }
    }
  }
  // долг уже погашен или на цели ничего нет — снимать и гасить нечего
  if (limit <= 0) return { ok: false, problem: "too-much" }
  if (amount === undefined || !Number.isInteger(amount) || amount <= 0) return { ok: false, problem: "bad-amount" }
  if (amount > limit) return { ok: false, problem: "too-much" }

  const id = ctx.newId()
  const stamp = ctx.records.stamp()
  const data: OperationData = {
    kind: input.kind,
    amount,
    description: input.description?.trim() ?? "",
    categoryId: "",
    date: input.date ?? ctx.today(),
    createdAt: stamp,
    categorizedAt: stamp,
    refundOf: null,
    recurringId: null,
    ...refs
  }
  const undo = await writeUndoable(ctx.records, [{ collection: "operations", id, data }], stamp)
  return { ok: true, operation: ctx.toView(ctx.records.get("operations", id)!), undo }
}
