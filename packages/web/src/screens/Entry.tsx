import { formatMoney } from "@fin/domain"
import {
  dayLabel,
  type EntriesChoice,
  type EntryPreview,
  type EntryPreviewProblem,
  type Ledger,
  type OperationView,
  type Undo
} from "@fin/ledger"
import { memo } from "preact/compat"
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks"
import type { Sync } from "@fin/sync"
import { CategoryBadge } from "../components/CategoryBadge"
import { CategoryFilter } from "../components/CategoryFilter"
import { CategoryGrid } from "../components/CategoryGrid"
import { EntryHelp } from "../components/EntryHelp"
import { EntryCalculationError } from "../components/EntryCalculationError"
import { operationTitle } from "../components/OperationBadge"
import { OperationRow } from "../components/OperationRow"
import { Sheet } from "../components/Sheet"
import { SyncBadge } from "../components/SyncBadge"
import { LargeTitle } from "../components/LargeTitle"
import { ArrowUpIcon, SearchIcon, WarningIcon } from "../icons"
import { useAnimatedNumber } from "../animatedNumber"
import { plural } from "../format"
import { navigate, useLedgerVersion } from "../state"
import { limitNotes, showToast } from "../toast"
import { useTabActive } from "../tabActivity"

const problemText: Record<EntryPreviewProblem, string> = {
  "invalid-calculation": "Проверьте выражение: суммы должны быть положительными, число повторов — целым от 1 до 1000. Смешанные действия не поддерживаются.",
  "no-amount": "Не вижу сумму — добавьте число, например «кофе 250».",
  "no-description": "Добавьте описание — что это было?",
  "no-category": "Выберите категорию."
}

/** Сколько тает поиск при закрытии — совпадает с `fin-sink` у `.search-mode.leaving` в styles.css. */
const SEARCH_CLOSE_MS = 200

const NO_CATEGORIES: ReadonlyArray<string> = []

/** Сколько ждать после последнего нажатия, прежде чем самому предложить выбрать категорию. */
const AUTO_PICK_DELAY_MS = 2500

/**
 * Удаляет операцию с задержкой на анимацию исчезновения. «Отменить» в окне задержки просто не даёт удалить,
 * а после него — возвращает операцию вместе с возвратами.
 */
const useRemoveWithUndo = (ledger: Ledger) => {
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set())
  // одна функция на всё время жизни экрана — иначе каждая строка ленты перерисовывалась бы вместе с ним
  const remove = useCallback(
    (op: OperationView) => {
      let cancelled = false
      setLeaving((prev) => new Set(prev).add(op.id))
      const unmark = () =>
        setLeaving((prev) => {
          const next = new Set(prev)
          next.delete(op.id)
          return next
        })
      const deleted = new Promise<Undo | null>((resolve) =>
        setTimeout(() => {
          unmark()
          resolve(cancelled ? null : ledger.deleteOperation(op.id))
        }, 200)
      )
      showToast({
        text: `Удалено: ${operationTitle(op)}`,
        action: {
          label: "Отменить",
          run: () => {
            cancelled = true
            unmark()
            return deleted.then((undo) => undo?.())
          }
        }
      })
    },
    [ledger]
  )
  return { leaving, remove }
}

/**
 * Экран ввода держит только режим поиска; строка ввода, сумма за период и лента — отдельные
 * компоненты со своим состоянием, чтобы набор текста или открытие поиска не перерисовывали ленту.
 */
export const EntryScreen = ({ ledger, sync }: { ledger: Ledger; sync: Sync }) => {
  // "closing" — поиск ещё виден и тает, лента вернётся, когда он уйдёт
  const [search, setSearch] = useState<"closed" | "open" | "closing">("closed")
  const [composerReveal, setComposerReveal] = useState(false)
  const [query, setQuery] = useState("")
  const [filterCategories, setFilterCategories] = useState<ReadonlyArray<string>>(NO_CATEGORIES)
  const searchInput = useRef<HTMLInputElement>(null)
  const { leaving, remove } = useRemoveWithUndo(ledger)

  const searchOpen = search !== "closed"

  useEffect(() => {
    if (search === "open") searchInput.current?.focus()
  }, [search])

  /** Закрытие зеркалит открытие: поиск тает, затем строка ввода и лента въезжают на его место. */
  const closeSearch = () => {
    if (search !== "open") return
    searchInput.current?.blur()
    const finish = () => {
      setSearch("closed")
      setQuery("")
      setFilterCategories(NO_CATEGORIES)
      setComposerReveal(true)
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finish()
    setSearch("closing")
    window.setTimeout(finish, SEARCH_CLOSE_MS)
  }

  return (
    <LargeTitle
      title="Ввод"
      heading={<SpentHero ledger={ledger} />}
      actions={
        <>
          <SyncBadge sync={sync} />
          <button
            type="button"
            class={`glass-button${search === "open" ? " active" : ""}`}
            aria-label="Поиск"
            aria-pressed={search === "open"}
            onClick={() => (search === "open" ? closeSearch() : search === "closed" && setSearch("open"))}
          >
            <SearchIcon />
          </button>
        </>
      }
    >
      {searchOpen ? (
        <div class={`search-mode${search === "closing" ? " leaving" : ""}`}>
          <div class="search-bar">
            <label class="search-field">
              <SearchIcon size={17} />
              <input
                ref={searchInput}
                type="search"
                placeholder="Описание или сумма"
                aria-label="Поиск по описанию или сумме"
                value={query}
                onInput={(e) => setQuery(e.currentTarget.value)}
              />
            </label>
            <button type="button" class="text-button" onClick={closeSearch}>
              Отмена
            </button>
          </div>
          <CategoryFilter ledger={ledger} selected={filterCategories} onChange={setFilterCategories} />
        </div>
      ) : (
        <Composer ledger={ledger} reveal={composerReveal} />
      )}
      <Feed
        ledger={ledger}
        searching={searchOpen}
        query={query}
        categoryIds={filterCategories}
        motion={search === "closing" ? "leaving" : search === "closed" && composerReveal ? "reveal" : null}
        leaving={leaving}
        onDelete={remove}
      />
    </LargeTitle>
  )
}

/** Потрачено за текущий период — пересчитывается только при изменении журнала. */
const SpentHero = memo(({ ledger }: { ledger: Ledger }) => {
  useLedgerVersion(ledger)
  const currentPeriod = ledger.dashboard({ mode: ledger.dashboardMode(), offset: 0 })
  const expenses = useAnimatedNumber(currentPeriod.expenses)
  return (
    <button type="button" class="spent-hero" onClick={() => navigate("/dashboard")}>
      <h1 class="visually-hidden">Ввод</h1>
      <span class="spent-hero-label">Потрачено за период</span>
      <span class="spent-hero-value num">{formatMoney(expenses)}</span>
    </button>
  )
})

/** Строка ввода с распознаванием; её состояние живёт здесь, чтобы набор текста не трогал остальной экран. */
const Composer = memo(({ ledger, reveal }: { ledger: Ledger; reveal: boolean }) => {
  useLedgerVersion(ledger)
  const active = useTabActive()
  const [text, setText] = useState("")
  const [choice, setChoice] = useState<EntriesChoice>({})
  // для какой операции строки открыт выбор категории
  const [pickerFor, setPickerFor] = useState<number | null>(null)
  // шторка выбора сама всплывает, только когда строка дописана и набор затих
  const [autoPick, setAutoPick] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [calculationErrorOpen, setCalculationErrorOpen] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const pendingChoice = useRef<EntriesChoice | null>(null)

  const previews = ledger.previewEntries(text, choice)
  const first = previews[0]!
  const many = previews.length > 1
  const has = text.trim() !== ""
  const invalidCalculation = previews.some((p) => p.problems.includes("invalid-calculation"))
  const needsPick = (p: EntryPreview) => p.description !== "" && p.categoryId === null
  // без категории отправить можно: отправка откроет выбор категории
  const canAdd = has && previews.every((p) => p.problems.every((problem) => problem === "no-category"))
  const categoryOf = (p: EntryPreview) =>
    p.categoryId ? ledger.categories(p.kind).find((c) => c.id === p.categoryId) : undefined
  const today = ledger.today()
  const awaiting = previews.findIndex((p) => needsPick(p) && p.problems.every((problem) => problem === "no-category"))
  const picking = !has ? null : (pickerFor ?? (autoPick && awaiting >= 0 ? awaiting : null))
  const picked = picking === null ? undefined : previews[picking]

  useEffect(() => {
    setAutoPick(false)
    if (!active || helpOpen || calculationErrorOpen || invalidCalculation || awaiting < 0) return
    const timer = window.setTimeout(() => setAutoPick(true), AUTO_PICK_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [text, awaiting, active, helpOpen, calculationErrorOpen, invalidCalculation])

  // шторка поверх открытой клавиатуры закрыта ею наполовину — убираем клавиатуру
  useEffect(() => {
    if (active && picking !== null) input.current?.blur()
  }, [picking !== null, active])

  const reset = () => {
    setText("")
    setChoice({})
    setPickerFor(null)
    setError(null)
    setCalculationErrorOpen(false)
  }

  const pick = (index: number, categoryId: string): EntriesChoice => {
    const categoryIds = previews.map((_, i) => (i === index ? categoryId : (choice.categoryIds?.[i] ?? null)))
    const next = { ...choice, categoryIds }
    setChoice(next)
    setError(null)
    return next
  }

  const add = async (submittedChoice: EntriesChoice = choice) => {
    const submittedPreviews = ledger.previewEntries(text, submittedChoice)
    const submittedFirst = submittedPreviews[0]!
    const submittedMany = submittedPreviews.length > 1
    const result = await ledger.submitEntries(text, submittedChoice)
    if (!result.ok) {
      const problem = result.problems[0]!
      // без категории открывается выбор — он сам и есть объяснение
      if (problem === "no-category") setPickerFor(result.index)
      else if (problem !== "invalid-calculation")
        setError(
          submittedMany
            ? `«${submittedPreviews[result.index]!.description || "…"}»: ${problemText[problem]}`
            : problemText[problem]
        )
      return
    }
    const ops = result.operations
    let done: string
    if (ops.length > 1) {
      const total = ops.reduce((sum, op) => sum + (op.kind === "expense" ? op.amount : 0), 0)
      const count = `${ops.length} ${plural(ops.length, "операция", "операции", "операций")}`
      done = total > 0 ? `Добавлено: ${count} · ${formatMoney(total, { sign: "−" })}` : `Добавлено: ${count}`
    } else {
      const op = ops[0]!
      const taught = submittedFirst.categorySource === "manual"
      // строка ввода создаёт только расходы и доходы — у них категория есть всегда
      const category = op.category!.name
      done = taught ? `Запомнил: "${op.description}" → ${category}` : `Добавлено: ${op.description} · ${category}`
    }
    // «Отменить» удаляет всё сохранённое строкой и возвращает её в поле — поправить опечатку и сохранить заново
    const line = text
    const lineChoice = submittedChoice
    showToast({
      text: done,
      notes: limitNotes(result.warnings),
      action: {
        label: "Отменить",
        run: () => {
          // фокус — прямо в нажатии, иначе телефон не откроет клавиатуру
          input.current?.focus()
          return result.undo().then((outcome) => {
            if (!outcome.ok) return outcome
            setText(line)
            setChoice(lineChoice)
            setError(null)
            return outcome
          })
        }
      }
    })
    reset()
  }

  const finishPicker = () => {
    setPickerFor(null)
    setAutoPick(false)
    const nextChoice = pendingChoice.current
    pendingChoice.current = null
    if (nextChoice) void add(nextChoice)
  }
  const signed = (p: EntryPreview) => formatMoney(p.amount!, { sign: p.kind === "income" ? "+" : "−" })
  const sameDate = previews.every((p) => p.date === first.date)
  const dateChip = (
    <label class="chip">
      <span>{sameDate ? dayLabel(first.date, today) : "Разные дни"}</span>
      <input
        type="date"
        aria-label={many ? "Дата всех операций" : "Дата операции"}
        value={first.date}
        max={today}
        onChange={(e) => {
          const date = e.currentTarget.value
          if (date) setChoice({ ...choice, date })
        }}
      />
    </label>
  )
  const expenses = previews.reduce((sum, p) => sum + (p.kind === "expense" ? (p.amount ?? 0) : 0), 0)

  return (
    <div class={`composer${reveal ? " reveal" : ""}`}>
      <div class={`composer-field${has ? " filled" : ""}`}>
        <input
          ref={input}
          id="line"
          aria-label="Что потратил или получил?"
          aria-invalid={invalidCalculation || undefined}
          class="line-input"
          type="text"
          placeholder="футболка 1500"
          autocomplete="off"
          autocapitalize="off"
          enterKeyHint="done"
          value={text}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onInput={(e) => {
            const value = e.currentTarget.value
            setText(value)
            setError(null)
            setCalculationErrorOpen(false)
            if (!value.trim()) {
              setChoice({})
              setPickerFor(null)
            }
          }}
          onKeyDown={(e) => {
            if (e.isComposing) return
            if (e.key === "Enter") {
              e.preventDefault()
              void add()
            }
          }}
        />
        {!inputFocused && text === "" && (
          <span class="entry-help-trigger">
            <button
              type="button"
              class="entry-help-icon"
              aria-label="Примеры ввода"
              aria-describedby="entry-help-tooltip"
              aria-haspopup="dialog"
              aria-expanded={helpOpen}
              onClick={() => setHelpOpen(true)}
            >
              <span aria-hidden="true">?</span>
            </button>
            <span id="entry-help-tooltip" role="tooltip">Примеры ввода</span>
          </span>
        )}
        {invalidCalculation ? (
          <button
            type="button"
            class="entry-error-trigger"
            aria-label="Ошибка в выражении"
            aria-haspopup="dialog"
            aria-expanded={calculationErrorOpen}
            onClick={() => {
              input.current?.blur()
              setPickerFor(null)
              setAutoPick(false)
              setCalculationErrorOpen(true)
            }}
          >
            <WarningIcon />
          </button>
        ) : has && (
          <button type="button" class="send-button" aria-label="Добавить" disabled={!canAdd} onClick={() => void add()}>
            <ArrowUpIcon />
          </button>
        )}
      </div>
      {has && many ? (
        <div class="recognized-many">
          <div class="card-list">
            {previews.map((p, i) => {
              const category = categoryOf(p)
              return (
                <button type="button" class="row row-button recognized-row" key={i} onClick={() => setPickerFor(i)}>
                  <CategoryBadge category={category ?? { color: "gray", icon: "dots", name: "" }} size={32} />
                  <span class="row-main">
                    <span class="row-title">{p.description || "что это?"}</span>
                    <span class="row-sub">
                      {category ? category.name : <span class="missing">Категория?</span>}
                      {!sameDate && ` · ${dayLabel(p.date, today)}`}
                    </span>
                  </span>
                  <span class={`op-amount num ${p.kind}`}>{p.amount ? signed(p) : "сумма?"}</span>
                </button>
              )
            })}
          </div>
          <div class="recognized">
            {dateChip}
            <span class="amount-preview num">{expenses > 0 ? formatMoney(expenses, { sign: "−" }) : ""}</span>
          </div>
        </div>
      ) : has ? (
        <div class="recognized">
          <button type="button" class="chip" onClick={() => setPickerFor(pickerFor === null ? 0 : null)}>
            <CategoryBadge category={categoryOf(first) ?? { color: "gray", icon: "dots", name: "" }} size={22} />
            <span>{categoryOf(first)?.name ?? "Категория?"}</span>
          </button>
          {dateChip}
          <span class={`amount-preview num ${first.kind}`}>{first.amount ? signed(first) : "сумма?"}</span>
        </div>
      ) : null}
      {active && helpOpen && <EntryHelp onClose={() => setHelpOpen(false)} />}
      {active && !helpOpen && !calculationErrorOpen && picking !== null && picked && (
        <Sheet
          key={`category-${picking}`}
          label="Выбор категории"
          onClose={finishPicker}
        >
          {(close) => (
            <div class="picker">
              <div class="sheet-title">
                {needsPick(picked) || many
                  ? `Куда отнести «${picked.description}»?`
                  : picked.kind === "income"
                    ? "Категория дохода"
                    : "Категория расхода"}
              </div>
              <CategoryGrid
                categories={ledger.categories(picked.kind)}
                selected={picked.categoryId}
                onPick={(categoryId) => {
                  pendingChoice.current = pick(picking, categoryId)
                  close()
                }}
              />
              {needsPick(picked) && <div class="hint">Выбор запомнится — в следующий раз подставлю сам.</div>}
            </div>
          )}
        </Sheet>
      )}
      {active && calculationErrorOpen && invalidCalculation && (
        <EntryCalculationError
          message={problemText["invalid-calculation"]}
          onClose={() => setCalculationErrorOpen(false)}
        />
      )}
      {error && <div class="hint error">{error}</div>}
    </div>
  )
})

/**
 * Лента по дням — и обычная, и результаты поиска. Один и тот же экземпляр в обоих режимах:
 * при открытии поиска с пустым запросом строки не пересоздаются и сохраняют состояние свайпа.
 * `motion` — как лента уходит вместе с поиском ("leaving") и возвращается после него ("reveal").
 */
const Feed = memo(
  ({
    ledger,
    searching,
    query,
    categoryIds,
    motion,
    leaving,
    onDelete
  }: {
    ledger: Ledger
    searching: boolean
    query: string
    categoryIds: ReadonlyArray<string>
    motion: "leaving" | "reveal" | null
    leaving: ReadonlySet<string>
    onDelete: (op: OperationView) => void
  }) => {
    const version = useLedgerVersion(ledger)
    // подписи дней («Сегодня», «Вчера») зависят от даты — пересчитываем и при её смене
    const today = ledger.today()
    const found = useMemo(
      () => (searching ? ledger.search(query, categoryIds) : null),
      [ledger, version, today, searching, query, categoryIds]
    )
    const all = useMemo(() => (searching ? null : ledger.days()), [ledger, version, today, searching])
    const days = found?.days ?? all ?? []

    return (
      <div class={`feed${motion ? ` ${motion}` : ""}`}>
        <div class="days">
          {found && (
            <div class="search-summary">
              {found.count} {plural(found.count, "операция", "операции", "операций")} · {formatMoney(found.total)}
            </div>
          )}
          {days.length === 0 ? (
            <div class="empty">{found ? "Ничего не нашлось" : "Пока нет операций. Введите расход или доход строкой выше — здесь появится ваша лента."}</div>
          ) : (
            days.map((day) => (
              <section class="day" key={day.date}>
                <div class="day-head">
                  <span>{day.label}</span>
                  {!found && <span class="num">{day.expenseTotal > 0 ? formatMoney(day.expenseTotal, { sign: "−" }) : ""}</span>}
                </div>
                <div class="card-list">
                  {day.items.map((op) => (
                    <OperationRow key={op.id} op={op} onDelete={onDelete} leaving={leaving.has(op.id)} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    )
  }
)
