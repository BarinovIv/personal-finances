import type { CategoryKind } from "@fin/domain"
import type { CategoryView, Ledger } from "@fin/ledger"
import { memo } from "preact/compat"
import { useState } from "preact/hooks"
import { plural } from "../format"
import { CheckIcon, ChevronDownIcon, CloseIcon } from "../icons"
import { CategoryBadge } from "./CategoryBadge"
import { Sheet } from "./Sheet"
import { useLedgerVersion } from "../state"

const KINDS: ReadonlyArray<{ kind: CategoryKind; title: string }> = [
  { kind: "expense", title: "Расходы" },
  { kind: "income", title: "Доходы" }
]

const summary = (picked: ReadonlyArray<CategoryView>) =>
  picked.length === 1 ? picked[0]!.name : `${picked.length} ${plural(picked.length, "категория", "категории", "категорий")}`

/**
 * Фильтр ленты по нескольким категориям: кнопка-«таблетка» с выбранными иконками внахлёст
 * и панель со списком, где категории отмечаются галочками. Лента за панелью обновляется сразу.
 * Не перерисовывается на каждую букву поискового запроса; за переименованием категорий следит сам.
 */
export const CategoryFilter = memo(({
  ledger,
  selected,
  onChange
}: {
  ledger: Ledger
  selected: ReadonlyArray<string>
  onChange: (ids: ReadonlyArray<string>) => void
}) => {
  useLedgerVersion(ledger)
  const [open, setOpen] = useState(false)
  const all = [...ledger.categories("expense"), ...ledger.categories("income")]
  const picked = all.filter((c) => selected.includes(c.id))
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])

  return (
    <>
      <div class="filter-bar">
        <button
          type="button"
          class={`chip filter-trigger${picked.length > 0 ? " active" : ""}`}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {picked.length > 0 && (
            <span class="badge-stack" aria-hidden="true">
              {picked.slice(0, 3).map((c) => (
                <CategoryBadge key={c.id} category={c} size={22} />
              ))}
            </span>
          )}
          <span class="filter-trigger-label">{picked.length > 0 ? summary(picked) : "Все категории"}</span>
          <ChevronDownIcon />
        </button>
        {picked.length > 0 && (
          <button type="button" class="filter-clear" aria-label="Сбросить фильтр по категориям" onClick={() => onChange([])}>
            <CloseIcon size={14} />
          </button>
        )}
      </div>
      {open && (
        <Sheet label="Фильтр по категориям" onClose={() => setOpen(false)}>
          {(close) => (
            <div class="sheet-form">
              <div class="sheet-title">Категории</div>
              {KINDS.map(({ kind, title }) => {
                const list = ledger.categories(kind)
                const allOn = list.every((c) => selected.includes(c.id))
                return (
                  <section class="section" key={kind}>
                    <div class="section-header-row">
                      <h2 class="section-header">{title}</h2>
                      <button
                        type="button"
                        class="text-button small"
                        onClick={() =>
                          onChange(
                            allOn
                              ? selected.filter((id) => !list.some((c) => c.id === id))
                              : [...selected, ...list.filter((c) => !selected.includes(c.id)).map((c) => c.id)]
                          )
                        }
                      >
                        {allOn ? "Снять все" : "Выбрать все"}
                      </button>
                    </div>
                    <div class="card-list">
                      {list.map((c) => {
                        const on = selected.includes(c.id)
                        return (
                          <button
                            type="button"
                            key={c.id}
                            class="row row-button check-row"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() => toggle(c.id)}
                          >
                            <CategoryBadge category={c} />
                            <span class="row-main">
                              <span class="row-title">{c.name}</span>
                            </span>
                            <span class={`check-mark${on ? " on" : ""}`} aria-hidden="true">
                              <CheckIcon size={14} />
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
              <div class="actions-row sheet-footer">
                <button type="button" class="secondary-button grow" disabled={selected.length === 0} onClick={() => onChange([])}>
                  Сбросить
                </button>
                <button type="button" class="accent-button grow" onClick={close}>
                  Готово
                </button>
              </div>
            </div>
          )}
        </Sheet>
      )}
    </>
  )
})
