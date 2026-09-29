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
import { OperationRow } from "../components/OperationRow"
import { Sheet } from "../components/Sheet"
import { SyncBadge } from "../components/SyncBadge"
import { LargeTitle } from "../components/LargeTitle"
import { ArrowUpIcon, SearchIcon } from "../icons"
import { allowanceItems } from "../allowance"
import { plural } from "../format"
import { navigate, useLedgerVersion } from "../state"
import { showToast } from "../toast"

const problemText: Record<EntryPreviewProblem, string> = {
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
        text: `Удалено: ${op.description}`,
        action: {
          label: "Отменить",
          run: () => {
            cancelled = true
            unmark()
            void deleted.then((undo) => undo?.())
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

/** Потрачено за текущий период и сколько можно тратить в день — пересчитывается только при изменении журнала. */
const SpentHero = memo(({ ledger }: { ledger: Ledger }) => {
  useLedgerVersion(ledger)
  const currentPeriod = ledger.dashboard({ mode: ledger.dashboardMode(), offset: 0 })
  const { allowance } = currentPeriod
  return (
    <button type="button" class="spent-hero" onClick={() => navigate("/dashboard")}>
      <h1 class="visually-hidden">Ввод</h1>
      <span class="spent-hero-label">Потрачено за период</span>
      <span class="spent-hero-value num">{formatMoney(currentPeriod.expenses)}</span>
      {allowance && (
        <span class="spent-hero-allowance">
          {allowanceItems(allowance).map((item) => (
            <span class="spent-hero-stat" key={item.label}>
              <span class="spent-hero-stat-label">{item.label}</span>
              <span class={`spent-hero-stat-value num${item.over ? " over" : ""}`}>{item.value}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  )
})

/** Строка ввода с распознаванием; её состояние живёт здесь, чтобы набор текста не трогал остальной экран. */
const Composer = memo(({ ledger, reveal }: { ledger: Ledger; reveal: boolean }) => {
  useLedgerVersion(ledger)
  const [text, setText] = useState("")
  const [choice, setChoice] = useState<EntriesChoice>({})
  // для какой операции строки открыт выбор категории
  const [pickerFor, setPickerFor] = useState<number | null>(null)
  // шторка выбора сама всплывает, только когда строка дописана и набор затих
  const [autoPick, setAutoPick] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const previews = ledger.previewEntries(text, choice)
  const first = previews[0]!
  const many = previews.length > 1
  const has = text.trim() !== ""
  const needsPick = (p: EntryPreview) => p.description !== "" && p.categoryId === null
  const canAdd = has && previews.every((p) => p.problems.length === 0)
  const categoryOf = (p: EntryPreview) =>
    p.categoryId ? ledger.categories(p.kind).find((c) => c.id === p.categoryId) : undefined
  const today = ledger.today()
  const awaiting = previews.findIndex((p) => needsPick(p) && !p.problems.includes("no-amount"))
  const picking = !has ? null : (pickerFor ?? (autoPick && awaiting >= 0 ? awaiting : null))
  const picked = picking === null ? undefined : previews[picking]

  useEffect(() => {
    setAutoPick(false)
    if (awaiting < 0) return
    const timer = window.setTimeout(() => setAutoPick(true), AUTO_PICK_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [text, awaiting])

  const reset = () => {
    setText("")
    setChoice({})
    setPickerFor(null)
    setError(null)
  }

  const pick = (index: number, categoryId: string) => {
    const categoryIds = previews.map((_, i) => (i === index ? categoryId : (choice.categoryIds?.[i] ?? null)))
    setChoice({ ...choice, categoryIds })
    setError(null)
  }

  const add = async () => {
    const result = await ledger.submitEntries(text, choice)
    if (!result.ok) {
      const problem = result.problems[0]!
      // без категории открывается выбор — он сам и есть объяснение
      if (problem === "no-category") setPickerFor(result.index)
      else setError(many ? `«${previews[result.index]!.description || "…"}»: ${problemText[problem]}` : problemText[problem])
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
      const taught = first.categorySource === "manual"
      // строка ввода создаёт только расходы и доходы — у них категория есть всегда
      const category = op.category!.name
      done = taught ? `Запомнил: «${op.description}» → ${category}` : `Добавлено: ${op.description} · ${category}`
    }
    // «Отменить» удаляет всё сохранённое строкой и возвращает её в поле — поправить опечатку и сохранить заново
    const line = text
    const lineChoice = choice
    showToast({
      text: done,
      action: {
        label: "Отменить",
        run: () => {
          // фокус — прямо в нажатии, иначе телефон не откроет клавиатуру
          input.current?.focus()
          void result.undo().then(({ ok }) => {
            if (!ok) return
            setText(line)
            setChoice(lineChoice)
            setError(null)
          })
        }
      }
    })
    reset()
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
            if (!value.trim()) {
              setChoice({})
              setPickerFor(null)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void add()
            }
          }}
        />
        {has && (
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
      ) : (
        <div class="hint">
          Например: <b>футболка 1500</b> · <b>+зарплата 95000</b> · <b>вчера такси 450</b> · <b>шаурма 340 такси 500</b>
        </div>
      )}
      {picking !== null && picked && (
        <Sheet label="Выбор категории" onClose={() => setPickerFor(null)}>
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
                  pick(picking, categoryId)
                  // держим панель открытой, пока она уезжает — иначе она пропала бы мгновенно
                  setPickerFor(picking)
                  close()
                }}
              />
              {needsPick(picked) && <div class="hint">Выбор запомнится — в следующий раз подставлю сам.</div>}
            </div>
          )}
        </Sheet>
      )}
      {error && <div class="hint error">{error}</div>}
    </div>
  )
})

/**
 * Лента по дням — и обычная, и результаты поиска. Один и тот же экземпляр в обоих режимах:
 * при открытии поиска с пустым запросом строки не пересоздаются и не проигрывают появление заново.
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
            <div class="empty">{found ? "Ничего не нашлось" : "Пока нет операций"}</div>
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
