import type { IsoDate, Period, OperationData } from "@fin/domain"
import type { LedgerContext } from "./context"
import type { RecordOf } from "./records"
import type { OperationView } from "./views"

export interface DebtView {
  /** Сама операция «Одолжил» или «Занял». */
  readonly operation: OperationView
  /** Уже погашено, копейки. */
  readonly repaid: number
  /** Остаток, копейки. Ноль — долг закрыт. */
  readonly remaining: number
}

export interface PersonDebts {
  /** Как имя записано в последнем введённом долге этого человека. */
  readonly name: string
  /** Сальдо по незакрытым долгам, копейки: больше нуля — человек должен мне, меньше — я ему. */
  readonly balance: number
  /** Незакрытые долги, сначала новые. */
  readonly open: ReadonlyArray<DebtView>
}

export interface DebtsOverview {
  /** Люди с незакрытыми долгами, по алфавиту. */
  readonly people: ReadonlyArray<PersonDebts>
  /** Закрытые долги, сначала новые. */
  readonly closed: ReadonlyArray<DebtView>
}

/** Один человек — без регистра, лишних пробелов и различия «ё» и «е»: «Пётр» и « петр » — одно лицо. */
const personKey = (name: string) => name.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ")

const newestFirst = (a: RecordOf<"operations">, b: RecordOf<"operations">) =>
  a.data.date === b.data.date ? b.data.createdAt - a.data.createdAt : a.data.date < b.data.date ? 1 : -1

const isDebt = (data: OperationData) => (data.kind === "lent" || data.kind === "borrowed") && Boolean(data.person)

/** Живые долги, сначала новые. */
const debtRecords = (ctx: LedgerContext) =>
  ctx
    .operations()
    .filter((r) => isDebt(r.data))
    .sort(newestFirst)

/** Имена людей из долгов: ключ → как записано в последнем введённом долге. Порядок — от недавних к давним. */
const personNames = (debts: ReadonlyArray<RecordOf<"operations">>) => {
  const names = new Map<string, string>()
  for (const r of [...debts].sort((a, b) => b.data.createdAt - a.data.createdAt)) {
    const key = personKey(r.data.person!)
    if (!names.has(key)) names.set(key, r.data.person!.trim())
  }
  return names
}

/** Подсказки для поля «Кто»: уже встречавшиеся в долгах люди, сначала недавние. */
export const debtPeople = (ctx: LedgerContext): ReadonlyArray<string> => [...personNames(debtRecords(ctx)).values()]

/** Долги по людям с сальдо и отдельно закрытые. */
export const debtsOverview = (ctx: LedgerContext): DebtsOverview => {
  const debts = debtRecords(ctx)
  const names = personNames(debts)
  const repaid = new Map<string, number>()
  for (const r of ctx.operations()) {
    if (r.data.repaymentOf) repaid.set(r.data.repaymentOf, (repaid.get(r.data.repaymentOf) ?? 0) + r.data.amount)
  }
  const people = new Map<string, { name: string; balance: number; open: Array<DebtView> }>()
  const closed: Array<DebtView> = []
  for (const record of debts) {
    const done = repaid.get(record.id) ?? 0
    const debt: DebtView = { operation: ctx.toView(record), repaid: done, remaining: record.data.amount - done }
    if (debt.remaining <= 0) {
      closed.push(debt)
      continue
    }
    const key = personKey(record.data.person!)
    const person = people.get(key) ?? { name: names.get(key)!, balance: 0, open: [] }
    person.balance += record.data.kind === "lent" ? debt.remaining : -debt.remaining
    person.open.push(debt)
    people.set(key, person)
  }
  return {
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    closed
  }
}

export interface DashboardDebt {
  readonly operation: OperationView
  readonly remaining: number
  readonly repaidInPeriod: number
  readonly overdue: boolean
}

export interface DashboardDebtGroup {
  readonly items: ReadonlyArray<DashboardDebt>
  readonly remaining: number
  readonly repaidInPeriod: number
}

export interface DashboardDebts {
  readonly asOf: IsoDate
  readonly borrowed: DashboardDebtGroup
  readonly lent: DashboardDebtGroup
  readonly reserve: number
}

/** Остатки по дату состояния и фактические погашения выбранного периода. */
export const dashboardDebts = (ctx: LedgerContext, period: Period, asOf: IsoDate, isCurrent: boolean): DashboardDebts => {
  const operations = ctx.operations().filter((record) => record.data.date <= asOf)
  const items = (kind: "borrowed" | "lent"): DashboardDebtGroup => {
    const debts = operations.filter((record) => record.data.kind === kind).map((record): DashboardDebt => {
      const repayments = operations.filter((repayment) => repayment.data.repaymentOf === record.id)
      const remaining = record.data.amount - repayments.reduce((sum, repayment) => sum + repayment.data.amount, 0)
      return {
        operation: ctx.toView(record), remaining,
        repaidInPeriod: repayments.filter((repayment) => repayment.data.date >= period.start)
          .reduce((sum, repayment) => sum + repayment.data.amount, 0),
        overdue: remaining > 0 && record.data.dueDate !== undefined && record.data.dueDate < asOf
      }
    }).filter((debt) => debt.remaining > 0 || debt.repaidInPeriod > 0)
    debts.sort((a, b) => {
      if (a.overdue !== b.overdue) { return a.overdue ? -1 : 1 }
      const aDue = a.operation.dueDate ?? "9999-99-99"
      const bDue = b.operation.dueDate ?? "9999-99-99"
      return aDue.localeCompare(bDue) || a.operation.date.localeCompare(b.operation.date) || a.operation.id.localeCompare(b.operation.id)
    })
    return {
      items: debts,
      remaining: debts.reduce((sum, debt) => sum + debt.remaining, 0),
      repaidInPeriod: debts.reduce((sum, debt) => sum + debt.repaidInPeriod, 0)
    }
  }
  const borrowed = items("borrowed")
  const reserve = isCurrent ? borrowed.items.filter((debt) => debt.operation.dueDate && debt.operation.dueDate <= period.end)
    .reduce((sum, debt) => sum + debt.remaining, 0) : 0
  return { asOf, borrowed, lent: items("lent"), reserve }
}
