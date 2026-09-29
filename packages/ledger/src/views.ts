import type { CategoryKind, IsoDate, OperationKind } from "@fin/domain"

export interface CategoryView {
  readonly id: string
  readonly kind: CategoryKind
  readonly name: string
  /** Название цвета из палитры (ADR-0004), не hex. */
  readonly color: string
  readonly icon: string
}

export interface OperationView {
  readonly id: string
  readonly kind: OperationKind
  /** Копейки. */
  readonly amount: number
  readonly description: string
  readonly date: IsoDate
  /** Для возврата — категория исходного расхода. У операций вне расходов и доходов категории нет. */
  readonly category: CategoryView | null
  readonly refundOf: string | null
  /** Для «Отложено» и «Снято» — цель. */
  readonly goalId: string | null
  /** Для «Одолжил» и «Занял» — человек; у погашения — человек его долга. */
  readonly person: string | null
  /** Для погашения — долг («Одолжил» или «Занял»). */
  readonly repaymentOf: string | null
  readonly recurringId: string | null
  readonly createdAt: number
  readonly updatedAt: number
}

export interface DayGroup {
  readonly date: IsoDate
  /** «Сегодня», «Вчера», «26 сентября». */
  readonly label: string
  /** Расходы дня минус возвраты, копейки. */
  readonly expenseTotal: number
  readonly incomeTotal: number
  /** Сначала новые. */
  readonly items: ReadonlyArray<OperationView>
}
