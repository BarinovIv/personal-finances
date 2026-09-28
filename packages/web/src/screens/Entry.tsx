import { formatMoney } from "@fin/domain"
import { dayLabel, type EntryChoice, type EntryPreviewProblem, type Ledger } from "@fin/ledger"
import { useState } from "preact/hooks"
import { CategoryGrid } from "../components/CategoryGrid"
import { OperationRow } from "../components/OperationRow"
import { CheckIcon } from "../icons"
import { useLedgerVersion } from "../state"

const problemText: Record<EntryPreviewProblem, string> = {
  "no-amount": "Не вижу сумму — добавьте число, например «кофе 250».",
  "no-description": "Добавьте описание — что это было?",
  "no-category": "Выберите категорию."
}

export const EntryScreen = ({ ledger }: { ledger: Ledger }) => {
  useLedgerVersion(ledger)
  const [text, setText] = useState("")
  const [choice, setChoice] = useState<EntryChoice>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState("")

  const preview = ledger.preview(text, choice)
  const has = text.trim() !== ""
  const needPick = has && preview.description !== "" && preview.categoryId === null
  const canAdd = has && preview.problems.length === 0
  const category = preview.categoryId
    ? ledger.categories(preview.kind).find((c) => c.id === preview.categoryId)
    : undefined
  const today = ledger.today()

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
      if (first === "no-category") setPickerOpen(true)
      setError(problemText[first])
      return
    }
    const op = result.operation
    setFlash(`Добавлено: ${op.description} · ${op.category.name}`)
    reset()
  }

  return (
    <div class="screen">
      <div class="composer">
        <label for="line">Что потратил или получил?</label>
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
              <span class="dot" style={{ background: category?.color ?? "#B8B2A7" }} />
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
            <span
              class="amount-preview num"
              style={{ color: preview.amount ? (preview.kind === "income" ? "var(--accent)" : "var(--ink)") : "var(--faint)" }}
            >
              {preview.amount ? formatMoney(preview.amount, { sign: preview.kind === "income" ? "+" : "−" }) : "сумма?"}
            </span>
            <button type="button" class="round-button" aria-label="Добавить" disabled={!canAdd} onClick={() => void add()}>
              <CheckIcon />
            </button>
          </div>
        )}
        {has && (needPick || pickerOpen) && (
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
          </div>
        )}
        {error && <div class="hint error">{error}</div>}
        {flash && <div class="flash">{flash}</div>}
      </div>
      <DayList ledger={ledger} />
    </div>
  )
}

const DayList = ({ ledger }: { ledger: Ledger }) => {
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
              <OperationRow key={op.id} op={op} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
