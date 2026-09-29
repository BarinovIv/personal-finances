import { liveOperations, paydaysOf, SETTINGS_ID, todayIn, type CategoryKind, type IsoDate } from "@fin/domain"
import { History } from "./categorize"
import { STARTER_CATEGORIES, UNKNOWN_CATEGORY_COLOR, UNKNOWN_CATEGORY_ICON } from "./categories"
import { normalizeIcon } from "./icons"
import { normalizePaletteColor } from "./palette"
import type { RecordOf, Records } from "./records"
import type { CategoryView, OperationView } from "./views"

/** Общее для всех частей журнала: записи, часы и производные данные, пересчитываемые при изменениях. */
export class LedgerContext {
  constructor(
    readonly records: Records,
    private readonly now: () => number,
    private readonly timeZone: string,
    readonly newId: () => string
  ) {}

  today(): IsoDate {
    return todayIn(this.now(), this.timeZone)
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
    for (const starter of STARTER_CATEGORIES) map.set(starter.id, starter)
    for (const record of this.records.all("categories")) {
      if (record.deleted) map.delete(record.id)
      else
        map.set(record.id, {
          id: record.id,
          kind: record.data.kind,
          name: record.data.name,
          color: normalizePaletteColor(record.data.color),
          icon: normalizeIcon(record.data.icon, record.data.kind)
        })
    }
    return map
  })

  categoryOf(id: string, kind: CategoryKind): CategoryView {
    return (
      this.categories().get(id) ?? { id, kind, name: "Без категории", color: UNKNOWN_CATEGORY_COLOR, icon: UNKNOWN_CATEGORY_ICON }
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

  /** История подстановок — только живые расходы и доходы. */
  readonly history = this.cached(
    () =>
      new History(
        this.records
          .live("operations")
          .filter((r) => r.data.kind !== "refund")
          .map((r) => ({
            kind: r.data.kind as CategoryKind,
            description: r.data.description,
            categoryId: r.data.categoryId,
            at: r.data.categorizedAt
          }))
      )
  )

  /** Категория операции; у возврата — категория исходного расхода. */
  operationCategory(record: RecordOf<"operations">): CategoryView {
    const { data } = record
    if (data.kind === "refund" && data.refundOf) {
      const original = this.records.get("operations", data.refundOf)
      if (original) return this.categoryOf(original.data.categoryId, "expense")
    }
    return this.categoryOf(data.categoryId, data.kind === "income" ? "income" : "expense")
  }

  toView(record: RecordOf<"operations">): OperationView {
    const { data } = record
    const original = data.kind === "refund" && data.refundOf ? this.records.get("operations", data.refundOf) : undefined
    return {
      id: record.id,
      kind: data.kind,
      amount: data.amount,
      // у возврата описание исходного расхода, даже если его потом поправили
      description: original ? original.data.description : data.description,
      date: data.date,
      category: this.operationCategory(record),
      refundOf: data.refundOf,
      recurringId: data.recurringId,
      createdAt: data.createdAt,
      updatedAt: record.updatedAt
    }
  }
}
