import { formatDecimal, formatMoney, parseMoney, type CategoryKind } from "@fin/domain"
import { dayMonth, type Ledger, type RecurringProblem, type RecurringView } from "@fin/ledger"
import { useState } from "preact/hooks"
import { CategoryBadge } from "../components/CategoryBadge"
import { RepeatIcon } from "../icons"

const problemText: Record<RecurringProblem, string> = {
  "not-found": "Регулярная операция уже удалена.",
  "bad-amount": "Проверьте сумму.",
  "no-description": "Добавьте описание.",
  "bad-category": "Выберите категорию.",
  "bad-day": "Число месяца — от 1 до 31."
}

const statusText = (r: RecurringView, today: string) =>
  r.status === "paused"
    ? "на паузе"
    : r.status === "ended"
      ? "завершена"
      : r.nextDate
        ? `следующая ${dayMonth(r.nextDate, today)}`
        : `каждое ${r.dayOfMonth}-е`

interface Draft {
  kind: CategoryKind
  description: string
  amount: string
  categoryId: string
  day: string
}

const RecurringForm = (props: {
  ledger: Ledger
  initial: Draft
  editing: boolean
  onDone: () => void
  onSubmit: (draft: Draft, amount: number) => Promise<{ ok: boolean; problem?: RecurringProblem }>
}) => {
  const [draft, setDraft] = useState(props.initial)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch })
    setError(null)
  }
  const categories = props.ledger.categories(draft.kind)
  const submit = async (e: Event) => {
    e.preventDefault()
    const amount = parseMoney(draft.amount)
    if (amount === null) return setError(problemText["bad-amount"])
    const result = await props.onSubmit(draft, amount)
    if (!result.ok) return setError(problemText[result.problem ?? "bad-amount"])
    props.onDone()
  }
  return (
    <form class="refund-form" onSubmit={submit}>
      {!props.editing && (
        <div class="segmented" role="group" aria-label="Вид операции">
          {(["expense", "income"] as const).map((kind) => (
            <button
              type="button"
              aria-pressed={draft.kind === kind}
              onClick={() => set({ kind, categoryId: props.ledger.categories(kind)[0]?.id ?? "" })}
            >
              {kind === "expense" ? "Расход" : "Доход"}
            </button>
          ))}
        </div>
      )}
      <label class="field">
        <span>Описание</span>
        <input class="text-input" type="text" value={draft.description} onInput={(e) => set({ description: e.currentTarget.value })} />
      </label>
      <div class="inline-form">
        <label class="field grow-field">
          <span>Сумма, ₽</span>
          <input class="text-input num" type="text" inputMode="decimal" value={draft.amount} onInput={(e) => set({ amount: e.currentTarget.value })} />
        </label>
        <label class="field day-field">
          <span>Число</span>
          <input class="text-input num" type="text" inputMode="numeric" value={draft.day} onInput={(e) => set({ day: e.currentTarget.value })} />
        </label>
      </div>
      <label class="field">
        <span>Категория</span>
        <select class="text-input" value={draft.categoryId} onChange={(e) => set({ categoryId: e.currentTarget.value })}>
          {categories.map((c) => (
            <option value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <span class="hint">Если такого числа в месяце нет, операция появится в последний день месяца.</span>
      {error && <span class="hint error">{error}</span>}
      <div class="actions-row">
        <button type="button" class="secondary-button grow" onClick={props.onDone}>
          Отмена
        </button>
        <button type="submit" class="accent-button grow">
          {props.editing ? "Сохранить" : "Добавить"}
        </button>
      </div>
    </form>
  )
}

const RecurringRow = ({ ledger, item }: { ledger: Ledger; item: RecurringView }) => {
  const [editing, setEditing] = useState(false)
  const today = ledger.today()
  if (editing) {
    return (
      <div class="row editing">
        <div class="row-main stack">
          <RecurringForm
            ledger={ledger}
            editing
            initial={{
              kind: item.kind,
              description: item.description,
              amount: formatDecimal(item.amount).replace(/,00$/, ""),
              categoryId: item.category.id,
              day: String(item.dayOfMonth)
            }}
            onDone={() => setEditing(false)}
            onSubmit={(d, amount) =>
              ledger.updateRecurring(item.id, {
                description: d.description,
                amount,
                categoryId: d.categoryId,
                dayOfMonth: Number(d.day)
              })
            }
          />
          <div class="actions-row">
            {item.status === "active" && (
              <button type="button" class="secondary-button grow" onClick={() => void ledger.pauseRecurring(item.id)}>
                Пауза
              </button>
            )}
            {item.status === "paused" && (
              <button type="button" class="secondary-button grow" onClick={() => void ledger.resumeRecurring(item.id)}>
                Возобновить
              </button>
            )}
            {item.status !== "ended" && (
              <button type="button" class="secondary-button danger-button grow" onClick={() => void ledger.endRecurring(item.id)}>
                Завершить
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
  return (
    <div class={`row ${item.status === "active" ? "" : "inactive"}`}>
      <CategoryBadge category={item.category} />
      <div class="row-main">
        <span class="row-title">
          {item.description} <RepeatIcon />
        </span>
        <span class="row-sub">
          {item.category.name} · {statusText(item, today)}
        </span>
      </div>
      <span class={`num op-amount ${item.kind}`}>{formatMoney(item.amount, { sign: item.kind === "income" ? "+" : "−" })}</span>
      <button type="button" class="text-button" onClick={() => setEditing(true)}>
        Изменить
      </button>
    </div>
  )
}

export const RecurringSection = ({ ledger }: { ledger: Ledger }) => {
  const [adding, setAdding] = useState(false)
  const items = ledger.recurring()
  return (
    <section class="section">
      <h2>Регулярные операции</h2>
      <p class="section-note">Раз в месяц в заданное число операция появляется сама. Правка не меняет уже созданные операции.</p>
      {items.length > 0 && (
        <div class="card-list">
          {items.map((item) => (
            <RecurringRow key={`${item.id}:${item.status}:${item.amount}:${item.description}`} ledger={ledger} item={item} />
          ))}
        </div>
      )}
      {adding ? (
        <RecurringForm
          ledger={ledger}
          editing={false}
          initial={{ kind: "expense", description: "", amount: "", categoryId: "subscriptions", day: String(Number(ledger.today().slice(8))) }}
          onDone={() => setAdding(false)}
          onSubmit={(d, amount) =>
            ledger.addRecurring({
              kind: d.kind,
              description: d.description,
              amount,
              categoryId: d.categoryId,
              dayOfMonth: Number(d.day)
            })
          }
        />
      ) : (
        <button type="button" class="secondary-button" onClick={() => setAdding(true)}>
          Добавить регулярную операцию
        </button>
      )}
    </section>
  )
}
