import { formatMoney, isOutflow } from "@fin/domain"
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
import { CategoryFilter } from "../components/CategoryFilter"
import { CategoryGrid } from "../components/CategoryGrid"
import { EntryHelp } from "../components/EntryHelp"
import { kindLabel, OperationBadge, operationTitle } from "../components/OperationBadge"
import { OperationRow } from "../components/OperationRow"
import { Sheet } from "../components/Sheet"
import { SyncBadge } from "../components/SyncBadge"
import { LargeTitle } from "../components/LargeTitle"
import { ArrowUpIcon, SearchIcon } from "../icons"
import { useAnimatedNumber } from "../animatedNumber"
import { plural } from "../format"
import { navigate, useLedgerVersion } from "../state"
import { limitNotes, showToast } from "../toast"
import { useTabActive } from "../tabActivity"

const problemText: Record<EntryPreviewProblem, string> = {
  "no-amount": "Не вижу сумму — добавьте число, например «кофе 250».",
  "no-description": "Добавьте описание — что это было?",
  "no-category": "Выберите категорию.",
  "no-expense": "Не найдена покупка, по которой можно оформить возврат.",
  "choose-target": "Выберите покупку для возврата.",
  "too-much": "Сумма больше остатка покупки."
}

const showPreviewProblem = (problem: EntryPreviewProblem) =>
  problem !== "no-amount" && problem !== "no-description" && problem !== "no-category" && problem !== "choose-target"

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
  const [targetFor, setTargetFor] = useState<number | null>(null)
  // шторка выбора сама всплывает, только когда строка дописана и набор затих
  const [autoPick, setAutoPick] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [caretAtEnd, setCaretAtEnd] = useState(true)
  const [composing, setComposing] = useState(false)
  const [inputScroll, setInputScroll] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const pendingChoice = useRef<EntriesChoice | null>(null)

  const previews = ledger.previewEntries(text, choice)
  const first = previews[0]!
  const many = previews.length > 1
  const has = text.trim() !== ""
  const needsPick = (p: EntryPreview) =>
    (p.kind === "expense" || p.kind === "income") && p.description !== "" && p.categoryId === null
  // без категории отправить можно: отправка откроет выбор категории
  const canAdd = has && previews.every((p) =>
    p.problems.every((problem) => problem === "no-category" || problem === "choose-target")
  )
  const categoryOf = (p: EntryPreview) =>
    p.categoryId ? ledger.categories(p.kind === "income" ? "income" : "expense").find((c) => c.id === p.categoryId) : undefined
  const previewLabel = (p: EntryPreview) =>
    p.kind === "expense" || p.kind === "income"
      ? categoryOf(p)?.name ?? "Категория?"
      : kindLabel(p.kind) + (p.problems.includes("choose-target") ? " · Выбрать" : "")
  const openPreview = (p: EntryPreview, index: number) => {
    if (p.kind === "expense" || p.kind === "income") setPickerFor(index)
    else if (p.targets.length > 0) setTargetFor(index)
  }
  const completion = inputFocused && caretAtEnd && !composing ? ledger.completeEntry(text) : null
  const updateCaret = (field: HTMLInputElement) =>
    setCaretAtEnd(field.selectionStart === field.value.length && field.selectionEnd === field.value.length)
  const acceptCompletion = () => {
    if (!completion) return
    setText(completion)
    setChoice({ ...choice, targetIds: undefined })
    setError(null)
    input.current?.focus()
    requestAnimationFrame(() => input.current?.setSelectionRange(completion.length, completion.length))
  }
  const today = ledger.today()
  const awaiting = previews.findIndex((p) => needsPick(p) && !p.problems.includes("no-amount"))
  const picking = !has ? null : (pickerFor ?? (autoPick && awaiting >= 0 ? awaiting : null))
  const picked = picking === null ? undefined : previews[picking]

  useEffect(() => {
    setAutoPick(false)
    if (!active || helpOpen || targetFor !== null || awaiting < 0) return
    const timer = window.setTimeout(() => setAutoPick(true), AUTO_PICK_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [text, awaiting, active, helpOpen, targetFor])

  // шторка поверх открытой клавиатуры закрыта ею наполовину — убираем клавиатуру
  useEffect(() => {
    if (active && (picking !== null || targetFor !== null)) input.current?.blur()
  }, [picking !== null, targetFor !== null, active])

  const reset = () => {
    setText("")
    setChoice({})
    setPickerFor(null)
    setTargetFor(null)
    setError(null)
  }

  const pick = (index: number, categoryId: string): EntriesChoice => {
    const categoryIds = previews.map((_, i) => (i === index ? categoryId : (choice.categoryIds?.[i] ?? null)))
    const next = { ...choice, categoryIds }
    setChoice(next)
    setError(null)
    return next
  }

  const pickTarget = (index: number, targetId: string): EntriesChoice => {
    const targetIds = previews.map((_, i) => (i === index ? targetId : (choice.targetIds?.[i] ?? null)))
    const next = { ...choice, targetIds }
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
      else if (problem === "choose-target") setTargetFor(result.index)
      else
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
      const category = op.category?.name
      done = taught && category
        ? `Запомнил: "${op.description}" → ${category}`
        : `Добавлено: ${operationTitle(op)} · ${category ?? kindLabel(op.kind)}`
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

  const signed = (p: EntryPreview) => formatMoney(p.amount!, { sign: isOutflow(p.kind) ? "−" : "+" })
  const finishPicker = () => {
    setPickerFor(null)
    setTargetFor(null)
    setAutoPick(false)
    const nextChoice = pendingChoice.current
    pendingChoice.current = null
    if (nextChoice) void add(nextChoice)
  }
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
  const targetPreview = targetFor === null ? undefined : previews[targetFor]
  const issue = has ? previews.find((p) => p.amount !== null && p.problems.some(showPreviewProblem)) : undefined
  const issueProblem = issue?.problems.find(showPreviewProblem)

  return (
    <div class={`composer${reveal ? " reveal" : ""}`}>
      <div class={`composer-field${has ? " filled" : ""}`}>
        <div class="line-entry">
          {completion && (
            <div class="entry-completion" aria-hidden="true">
              <span style={{ transform: `translateX(-${inputScroll}px)` }}>
                <span class="entry-completion-typed">{text}</span>{completion.slice(text.length)}
              </span>
            </div>
          )}
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
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onSelect={(e) => updateCaret(e.currentTarget)}
            onClick={(e) => updateCaret(e.currentTarget)}
            onKeyUp={(e) => updateCaret(e.currentTarget)}
            onScroll={(e) => setInputScroll(e.currentTarget.scrollLeft)}
            onInput={(e) => {
              const value = e.currentTarget.value
              setText(value)
              setCaretAtEnd(e.currentTarget.selectionStart === value.length && e.currentTarget.selectionEnd === value.length)
              setInputScroll(e.currentTarget.scrollLeft)
              setChoice({ ...choice, targetIds: undefined })
              setError(null)
              if (!value.trim()) {
                setChoice({})
                setPickerFor(null)
                setTargetFor(null)
              }
            }}
            onKeyDown={(e) => {
              if (e.isComposing) return
              if (completion && e.currentTarget.selectionStart === text.length && e.currentTarget.selectionEnd === text.length
                && (e.key === "Tab" || e.key === "ArrowRight") && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault()
                acceptCompletion()
              } else if (e.key === "Enter") {
                e.preventDefault()
                void add()
              }
            }}
          />
        </div>
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
        {has && (
          <button type="button" class="send-button" aria-label="Добавить" disabled={!canAdd} onClick={() => void add()}>
            <ArrowUpIcon />
          </button>
        )}
      </div>
      {completion && (
        <button type="button" class="entry-completion-accept" aria-label={`Дополнить: ${completion.slice(text.length)}`}
          onPointerDown={(e) => e.preventDefault()} onClick={acceptCompletion}>
          Дополнить
        </button>
      )}
      {has && many ? (
        <div class="recognized-many">
          <div class="card-list">
            {previews.map((p, i) => {
              const category = categoryOf(p)
              return (
                <button type="button" class="row row-button recognized-row" key={i} onClick={() => openPreview(p, i)}>
                  <OperationBadge op={{ kind: p.kind, category: category ?? null }} size={32} />
                  <span class="row-main">
                    <span class="row-title">{p.description || "что это?"}</span>
                    <span class="row-sub">
                      {previewLabel(p)}
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
          <button type="button" class="chip" onClick={() => openPreview(first, 0)}>
            <OperationBadge op={{ kind: first.kind, category: categoryOf(first) ?? null }} size={22} />
            <span>{previewLabel(first)}</span>
          </button>
          {dateChip}
          <span class={`amount-preview num ${first.kind}`}>{first.amount ? signed(first) : "сумма?"}</span>
        </div>
      ) : null}
      {active && helpOpen && <EntryHelp onClose={() => setHelpOpen(false)} />}
      {active && !helpOpen && targetFor === null && picking !== null && picked && (picked.kind === "expense" || picked.kind === "income") && (
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
                categories={ledger.categories(picked.kind === "income" ? "income" : "expense")}
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
      {active && !helpOpen && targetFor !== null && targetPreview && (
        <Sheet key={`target-${targetFor}`} label="Выбор покупки" onClose={finishPicker}>
          {(close) => (
            <div class="picker">
              <div class="sheet-title">Выберите покупку для возврата</div>
              <div class="card-list">
                {targetPreview.targets.map((target) => (
                  <button type="button" class="row row-button" key={target.id} onClick={() => {
                    pendingChoice.current = pickTarget(targetFor, target.id)
                    close()
                  }}>
                    <span class="row-main">
                      <span class="row-title">{target.label}</span>
                      <span class="row-sub">{target.date ? dayLabel(target.date, today) + " · " : ""}Осталось: {formatMoney(target.remaining)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Sheet>
      )}
      {!error && issueProblem && <div class="hint error" role="status">{problemText[issueProblem]}</div>}
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
