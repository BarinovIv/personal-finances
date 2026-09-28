import type { CategoryKind, IsoDate, OperationKind } from "@fin/domain"

export interface CategoryView {
  readonly id: string
  readonly kind: CategoryKind
  readonly name: string
  readonly color: string
}

export interface OperationView {
  readonly id: string
  readonly kind: OperationKind
  /** Копейки. */
  readonly amount: number
  readonly description: string
  readonly date: IsoDate
  /** Для возврата — категория исходного расхода. */
  readonly category: CategoryView
  readonly refundOf: string | null
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
