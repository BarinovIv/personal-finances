import { formatMoney } from "@fin/domain"
import { dayLabel, type EntryChoice, type EntryPreviewProblem, type Ledger, type OperationView } from "@fin/ledger"
import { useEffect, useRef, useState } from "preact/hooks"
import type { Sync } from "@fin/sync"
import { CategoryBadge } from "../components/CategoryBadge"
import { CategoryGrid } from "../components/CategoryGrid"
import { OperationRow } from "../components/OperationRow"
import { Sheet } from "../components/Sheet"
import { SyncBadge } from "../components/SyncBadge"
import { CheckIcon } from "../icons"
import { navigate, useLedgerVersion } from "../state"
import { showToast } from "../toast"

const problemText: Record<EntryPreviewProblem, string> = {
  "no-amount": "Не вижу сумму — добавьте число, например «кофе 250».",
  "no-description": "Добавьте описание — что это было?",
  "no-category": "Выберите категорию."
}

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
)

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

/** Удаляет операцию с задержкой на анимацию исчезновения; в окне задержки можно отменить. */
const useRemoveWithUndo = (ledger: Ledger) => {
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set())
  const remove = (op: OperationView) => {
    let cancelled = false
    setLeaving((prev) => new Set(prev).add(op.id))
    const unmark = () =>
      setLeaving((prev) => {
        const next = new Set(prev)
        next.delete(op.id)
        return next
      })
    showToast({
      text: `Удалено: ${op.description}`,
      action: {
        label: "Отменить",
        run: () => {
          cancelled = true
          unmark()
        }
      }
    })
    setTimeout(() => {
      unmark()
      if (!cancelled) void ledger.deleteOperation(op.id)
    }, 200)
  }
  return { leaving, remove }
}

export const EntryScreen = ({ ledger, sync }: { ledger: Ledger; sync: Sync }) => {
  useLedgerVersion(ledger)
  const [text, setText] = useState("")
  const [choice, setChoice] = useState<EntryChoice>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const { leaving, remove } = useRemoveWithUndo(ledger)

  const preview = ledger.preview(text, choice)
  const has = text.trim() !== ""
  const needPick = has && preview.description !== "" && preview.categoryId === null
  const canAdd = has && preview.problems.length === 0
  const category = preview.categoryId
    ? ledger.categories(preview.kind).find((c) => c.id === preview.categoryId)
    : undefined
  const today = ledger.today()
  const currentPeriod = ledger.dashboard({ mode: ledger.dashboardMode(), offset: 0 })

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus()
  }, [searchOpen])

  const reset = () => {
    setText("")
    setChoice({})
    setPickerOpen(false)
    setError(null)
  }

  const add = async () => {
    const result = await ledger.submit(text, choice)
    if (!result.ok) {
      const first = result.problems[0]!
      // без категории открывается выбор — он сам и есть объяснение
      if (first === "no-category") setPickerOpen(true)
      else setError(problemText[first])
      return
    }
    const op = result.operation
    const taught = preview.categorySource === "manual"
    setFlash(taught ? `Запомнил: «${op.description}» → ${op.category.name}` : `Добавлено: ${op.description} · ${op.category.name}`)
    reset()
  }

  const closeSearch = () => {
    setSearchOpen(false)
    setQuery("")
    setFilterCategory(null)
  }

  const categories = [...ledger.categories("expense"), ...ledger.categories("income")]

  return (
    <div class="screen">
      <div class="composer">
        <div class="composer-head">
          <label for="line">Что потратил или получил?</label>
          <div class="composer-tools">
            <button type="button" class="icon-button on-accent" aria-label="Поиск" onClick={() => setSearchOpen(!searchOpen)}>
              <SearchIcon />
            </button>
            <SyncBadge sync={sync} />
          </div>
        </div>
        <input
          id="line"
          class="line-input"
          type="text"
          placeholder="футболка 1500"
          autocomplete="off"
          autocapitalize="off"
          enterKeyHint="done"
          value={text}
          onInput={(e) => {
            const value = e.currentTarget.value
            setText(value)
            setError(null)
            setFlash("")
            if (!value.trim()) {
              setChoice({})
              setPickerOpen(false)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void add()
            }
          }}
        />
        {!has && (
          <div class="hint">
            Например: <b>футболка 1500</b> · <b>+зарплата 95000</b> · <b>вчера такси 450</b> · <b>обед 1.2к</b>
          </div>
        )}
        {has && (
          <div class="recognized">
            <button type="button" class="chip" onClick={() => setPickerOpen(!pickerOpen)}>
              <CategoryBadge category={category ?? { color: "gray", icon: "dots", name: "" }} size={24} />
              <span>{category?.name ?? "Категория?"}</span>
            </button>
            <label class="chip">
              <span>{dayLabel(preview.date, today)}</span>
              <input
                type="date"
                aria-label="Дата операции"
                value={preview.date}
                max={today}
                onChange={(e) => {
                  const date = e.currentTarget.value
                  if (date) setChoice({ ...choice, date })
                }}
              />
            </label>
            <span class="amount-preview num">
              {preview.amount ? formatMoney(preview.amount, { sign: preview.kind === "income" ? "+" : "−" }) : "сумма?"}
            </span>
            <button type="button" class="round-button" aria-label="Добавить" disabled={!canAdd} onClick={() => void add()}>
              <CheckIcon />
            </button>
          </div>
        )}
        {has && (needPick || pickerOpen) && (
          <Sheet onClose={() => setPickerOpen(false)}>
            <div class="picker">
              <div class="picker-title">
                {needPick
                  ? `Куда отнести «${preview.description}»?`
                  : preview.kind === "income"
                    ? "Категория дохода"
                    : "Категория расхода"}
              </div>
              <CategoryGrid
                categories={ledger.categories(preview.kind)}
                selected={preview.categoryId}
                onPick={(categoryId) => {
                  setChoice({ ...choice, categoryId })
                  setPickerOpen(false)
                  setError(null)
                }}
              />
              {needPick && <div class="hint">Выбор запомнится — в следующий раз подставлю сам.</div>}
            </div>
          </Sheet>
        )}
        {error && <div class="hint error">{error}</div>}
        {flash && <div class="flash">{flash}</div>}
        <button type="button" class="composer-spent" onClick={() => navigate("/dashboard")}>
          <span>Потрачено за период</span>
          <strong class="num">{formatMoney(currentPeriod.expenses)}</strong>
        </button>
      </div>
      <div class={`search-panel${searchOpen ? " open" : ""}`}>
        <div class="search-panel-inner">
          <div class="search-row">
            <input
              ref={searchInput}
              class="text-input"
              type="search"
              placeholder="Поиск по описанию или сумме"
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
            <button type="button" class="icon-button" aria-label="Закрыть поиск" onClick={closeSearch}>
              <CloseIcon />
            </button>
          </div>
          <div class="filter-chips" role="group" aria-label="Фильтр по категории">
            <button type="button" class="chip" aria-pressed={filterCategory === null} onClick={() => setFilterCategory(null)}>
              <span>Все</span>
            </button>
            {categories.map((c) => (
              <button
                type="button"
                class="chip"
                key={c.id}
                aria-pressed={filterCategory === c.id}
                onClick={() => setFilterCategory(filterCategory === c.id ? null : c.id)}
              >
                <CategoryBadge category={c} size={20} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {searchOpen ? (
        <SearchResults ledger={ledger} query={query} categoryId={filterCategory} leaving={leaving} onDelete={remove} />
      ) : (
        <DayList ledger={ledger} leaving={leaving} onDelete={remove} />
      )}
    </div>
  )
}

const SearchResults = ({
  ledger,
  query,
  categoryId,
  leaving,
  onDelete
}: {
  ledger: Ledger
  query: string
  categoryId: string | null
  leaving: ReadonlySet<string>
  onDelete: (op: OperationView) => void
}) => {
  const result = ledger.search(query, categoryId)
  return (
    <div class="days">
      <div class="search-summary">
        {result.count} {plural(result.count, "операция", "операции", "операций")} · {formatMoney(result.total)}
      </div>
      {result.count === 0 ? (
        <div class="empty">Ничего не нашлось</div>
      ) : (
        result.days.map((day) => (
          <section class="day" key={day.date}>
            <div class="day-head">
              <span>{day.label}</span>
            </div>
            <div class="card-list">
              {day.items.map((op) => (
                <OperationRow key={op.id} op={op} onDelete={() => onDelete(op)} leaving={leaving.has(op.id)} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

const DayList = ({
  ledger,
  leaving,
  onDelete
}: {
  ledger: Ledger
  leaving: ReadonlySet<string>
  onDelete: (op: OperationView) => void
}) => {
  const days = ledger.days()
  if (days.length === 0) return <div class="empty">Пока нет операций</div>
  return (
    <div class="days">
      {days.map((day) => (
        <section class="day" key={day.date}>
          <div class="day-head">
            <span>{day.label}</span>
            <span class="num">{day.expenseTotal > 0 ? formatMoney(day.expenseTotal, { sign: "−" }) : ""}</span>
          </div>
          <div class="card-list">
            {day.items.map((op) => (
              <OperationRow key={op.id} op={op} onDelete={() => onDelete(op)} leaving={leaving.has(op.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
