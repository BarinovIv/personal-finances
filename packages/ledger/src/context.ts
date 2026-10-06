import {
  isMovement,
  isTimeZone,
  liveOperations,
  monthlyLimit,
  paydaysOf,
  SETTINGS_ID,
  STARTER_CATEGORIES,
  todayIn,
  UNKNOWN_CATEGORY_NAME,
  type CategoryKind,
  type IsoDate
} from "@fin/domain"
import { History } from "./categorize"
import { UNKNOWN_CATEGORY_COLOR, UNKNOWN_CATEGORY_ICON } from "./categories"
import { normalizeIcon } from "./icons"
import { normalizePaletteColor } from "./palette"
import type { RecordOf, Records } from "./records"
import type { CategoryView, OperationView } from "./views"

/** Общее для всех частей журнала: записи, часы и производные данные, пересчитываемые при изменениях. */
export class LedgerContext {
  constructor(
    readonly records: Records,
    private readonly now: () => number,
    private readonly defaultTimeZone: string,
    readonly newId: () => string
  ) {}

  today(): IsoDate {
    return todayIn(this.now(), this.timeZone())
  }

  timeZone(): string {
    const record = this.records.get("settings", SETTINGS_ID)
    const zone = record && !record.deleted ? record.data.timeZone : undefined
    return zone && isTimeZone(zone) ? zone : this.defaultTimeZone
  }

  /** Кэш на версию записей. */
  private cached<T>(compute: () => T): () => T {
    let version = -1
    let value: T
    return () => {
      if (version !== this.records.version) {
        value = compute()
        version = this.records.version
      }
      return value
    }
  }

  /** Живые категории: стартовый набор поверх записей. Цвет и иконка нормализуются при чтении (ADR-0004). */
  readonly categories = this.cached(() => {
    const map = new Map<string, CategoryView>()
    for (const starter of STARTER_CATEGORIES) map.set(starter.id, { ...starter, limit: null })
    for (const record of this.records.all("categories")) {
      if (record.deleted) map.delete(record.id)
      else
        map.set(record.id, {
          id: record.id,
          kind: record.data.kind,
          name: record.data.name,
          color: normalizePaletteColor(record.data.color),
          icon: normalizeIcon(record.data.icon, record.data.kind),
          limit: monthlyLimit(record.data)
        })
    }
    return map
  })

  categoryOf(id: string, kind: CategoryKind): CategoryView {
    return (
      this.categories().get(id) ?? {
        id,
        kind,
        name: UNKNOWN_CATEGORY_NAME,
        color: UNKNOWN_CATEGORY_COLOR,
        icon: UNKNOWN_CATEGORY_ICON,
        limit: null
      }
    )
  }

  /** Подходит ли категория операции этого вида. */
  allowed(categoryId: string, kind: CategoryKind): boolean {
    return this.categories().get(categoryId)?.kind === kind
  }

  /** Живые операции: без удалённых и без возвратов удалённого расхода. */
  readonly operations = this.cached(() => liveOperations(this.records.all("operations")))

  /** Дни зарплаты из настроек; по умолчанию 5 и 20. */
  paydays(): ReadonlyArray<number> {
    return paydaysOf(this.records.get("settings", SETTINGS_ID))
  }

  /** История подстановок — только живые расходы и доходы: на возвратах и операциях вне расходов и доходов она не учится. */
  readonly history = this.cached(
    () =>
      new History(
        this.records
          .live("operations")
          .filter((r) => !r.data.pending && (r.data.kind === "expense" || r.data.kind === "income"))
          .map((r) => ({
            kind: r.data.kind as CategoryKind,
            description: r.data.description,
            categoryId: r.data.categoryId,
            at: r.data.categorizedAt
          }))
      )
  )

  /** Категория операции; у возврата — категория исходного расхода, у операций вне расходов и доходов её нет. */
  operationCategory(record: RecordOf<"operations">): CategoryView | null {
    const { data } = record
    if (isMovement(data.kind)) return null
    if (data.kind === "refund" && data.refundOf) {
      const original = this.records.get("operations", data.refundOf)
      if (original) return this.categoryOf(original.data.categoryId, "expense")
    }
    return this.categoryOf(data.categoryId, data.kind === "income" ? "income" : "expense")
  }

  toView(record: RecordOf<"operations">): OperationView {
    const { data } = record
    const original = data.kind === "refund" && data.refundOf ? this.records.get("operations", data.refundOf) : undefined
    const debt = data.repaymentOf ? this.records.get("operations", data.repaymentOf) : undefined
    return {
      id: record.id,
      kind: data.kind,
      amount: data.amount,
      // у возврата описание исходного расхода, даже если его потом поправили
      description: original ? original.data.description : data.description,
      date: data.date,
      category: this.operationCategory(record),
      refundOf: data.refundOf,
      goalId: data.goalId ?? null,
      goalName: (data.goalId ? this.records.get("goals", data.goalId)?.data.name : undefined) ?? null,
      // у погашения человек его долга, даже если долг потом поправили
      person: (debt ? debt.data.person : data.person) ?? null,
      repaymentOf: data.repaymentOf ?? null,
      recurringId: data.recurringId,
      ...(data.pending !== undefined ? { pending: data.pending } : {}),
      createdAt: data.createdAt,
      updatedAt: record.updatedAt
    }
  }
}
