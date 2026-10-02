import { formatDecimal, formatMoney, parseMoney, type CategoryKind } from "@fin/domain"
import { dayMonth, type Ledger, type MakeRecurringProblem, type RecurringView } from "@fin/ledger"
import type { ComponentChildren } from "preact"
import { useState } from "preact/hooks"
import { CategoryBadge } from "../components/CategoryBadge"
import { type RowDrag, useReorderableRows } from "../components/ReorderableRows"
import { Sheet } from "../components/Sheet"
import { QuickDeleteButton, SwipeDeleteButton, useSwipeDelete } from "../components/SwipeDelete"
import { GripIcon, PlusIcon, RepeatIcon } from "../icons"
import { showToast } from "../toast"

const problemText: Record<MakeRecurringProblem, string> = {
  "not-found": "Регулярная операция уже удалена.",
  "bad-amount": "Проверьте сумму.",
  "no-description": "Добавьте описание.",
  "bad-category": "Выберите категорию.",
  "bad-day": "Число месяца — от 1 до 31.",
  "not-expense": "Регулярной можно сделать только операцию расхода.",
  "already-recurring": "Расход уже связан с регулярной операцией."
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

export const RecurringForm = (props: {
  ledger: Ledger
  initial: Draft
  editing: boolean
  fixedKind?: boolean
  /** Закрыть панель с анимацией — и по «Отмена», и после сохранения. */
  close: () => void
  onSubmit: (draft: Draft, amount: number) => Promise<{ ok: boolean; problem?: MakeRecurringProblem }>
  children?: ComponentChildren
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
    props.close()
  }
  return (
    <form class="sheet-form" onSubmit={submit}>
      <div class="sheet-title">{props.editing ? "Регулярная операция" : "Новая регулярная операция"}</div>
      {!props.editing && !props.fixedKind && (
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
      <div class="card-list">
        <label class="row input-row">
          <span class="row-label">Описание</span>
          <input
            class="row-input"
            type="text"
            placeholder="Например, Кинопоиск"
            value={draft.description}
            onInput={(e) => set({ description: e.currentTarget.value })}
          />
        </label>
        <label class="row input-row">
          <span class="row-label">Сумма, ₽</span>
          <input
            class="row-input num"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={draft.amount}
            onInput={(e) => set({ amount: e.currentTarget.value })}
          />
        </label>
        <label class="row input-row">
          <span class="row-label">Число месяца</span>
          <input
            class="row-input num"
            type="text"
            inputMode="numeric"
            value={draft.day}
            onInput={(e) => set({ day: e.currentTarget.value })}
          />
        </label>
        <label class="row input-row">
          <span class="row-label">Категория</span>
          <select class="row-input" value={draft.categoryId} onChange={(e) => set({ categoryId: e.currentTarget.value })}>
            {categories.map((c) => (
              <option value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>
      <span class="hint">Если такого числа в месяце нет, операция появится в последний день месяца.</span>
      {error && <span class="hint error">{error}</span>}
      {props.children}
      <div class="actions-row">
        <button type="button" class="secondary-button grow" onClick={props.close}>
          Отмена
        </button>
        <button type="submit" class="accent-button grow">
          {props.editing ? "Сохранить" : "Добавить"}
        </button>
      </div>
    </form>
  )
}

/** Сколько тает удалённая свайпом строка — совпадает с `fin-row-out` у `.reorderable-item.leaving` в styles.css. */
const ROW_OUT_MS = 200

const RecurringRow = ({ ledger, item, drag }: { ledger: Ledger; item: RecurringView; drag: RowDrag }) => {
  const [editing, setEditing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const swipe = useSwipeDelete(true)
  const today = ledger.today()
  const deleteWithUndo = async () => {
    const result = await ledger.deleteRecurring(item.id)
    if (!result.ok) return false
    showToast({ text: `«${item.description}» удалена`, action: { label: "Отменить", run: () => result.undo() } })
    return true
  }
  const remove = async (close: () => void) => {
    if (await deleteWithUndo()) close()
  }
  // строка сперва тает, потом удаляется; удалить не вышло — возвращается
  const swipeRemove = () => {
    setLeaving(true)
    window.setTimeout(() => void deleteWithUndo().then((ok) => ok || setLeaving(false)), ROW_OUT_MS)
  }
  const deleteLabel = `Удалить: ${item.description}`
  return (
    <>
      <div
        class={`reorderable-item${drag.lifted ? " lifted" : ""}${leaving ? " leaving" : ""}`}
        style={drag.shift ? { transform: `translateY(${drag.shift}px)` } : undefined}
      >
        <div class={`op-row-swipe${swipe.revealing ? " revealing" : ""}`}>
          <SwipeDeleteButton label={deleteLabel} onDelete={swipeRemove} />
          <div class="reorderable-slide" style={swipe.style}>
            <button
              type="button"
              class={`row row-button ${item.status === "active" ? "" : "inactive"}`}
              aria-label={`Изменить: ${item.description}`}
              onClick={() => setEditing(true)}
              {...swipe.handlers}
            >
              <CategoryBadge category={item.category} />
              <span class="row-main">
                <span class="row-title">
                  {item.description} <RepeatIcon />
                </span>
                <span class="row-sub">
                  {item.category.name} · {statusText(item, today)}
                </span>
              </span>
              <span class={`num op-amount ${item.kind}`}>{formatMoney(item.amount, { sign: item.kind === "income" ? "+" : "−" })}</span>
            </button>
            <QuickDeleteButton label={deleteLabel} onDelete={swipeRemove} />
            <span
              class="drag-handle"
              role="button"
              tabIndex={0}
              aria-label={`Переместить: ${item.description}. Стрелки вверх и вниз`}
              onPointerDown={(event) => drag.onGripDown(event, swipe.gesture)}
              onKeyDown={drag.onGripKey}
            >
              <GripIcon />
            </span>
          </div>
        </div>
      </div>
      {editing && (
        <Sheet label={`Регулярная операция «${item.description}»`} onClose={() => setEditing(false)}>
          {(close) => (
            <RecurringForm
              ledger={ledger}
              editing
              close={close}
              initial={{
                kind: item.kind,
                description: item.description,
                amount: formatDecimal(item.amount).replace(/,00$/, ""),
                categoryId: item.category.id,
                day: String(item.dayOfMonth)
              }}
              onSubmit={(d, amount) =>
                ledger.updateRecurring(item.id, {
                  description: d.description,
                  amount,
                  categoryId: d.categoryId,
                  dayOfMonth: Number(d.day)
                })
              }
            >
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
                  <button type="button" class="secondary-button grow" onClick={() => void ledger.endRecurring(item.id)}>
                    Завершить
                  </button>
                )}
                <button type="button" class="secondary-button danger-button grow" onClick={() => void remove(close)}>
                  Удалить
                </button>
              </div>
            </RecurringForm>
          )}
        </Sheet>
      )}
    </>
  )
}

export const RecurringSection = ({ ledger }: { ledger: Ledger }) => {
  const [adding, setAdding] = useState(false)
  const { items, rowDrag, reordering, settling } = useReorderableRows(ledger.recurring(), (ids) =>
    ledger.reorderRecurring(ids)
  )

  return (
    <section class="section">
      <div class={`card-list${reordering ? " reordering" : ""}${settling ? " settling" : ""}`}>
        {items.map((item, index) => (
          <RecurringRow
            key={`${item.id}:${item.status}:${item.amount}:${item.description}`}
            ledger={ledger}
            item={item}
            drag={rowDrag(index)}
          />
        ))}
        <button type="button" class="row row-button action-row" onClick={() => setAdding(true)}>
          <PlusIcon />
          <span>Добавить регулярную операцию</span>
        </button>
      </div>
      <p class="section-footer">
        Раз в месяц в заданное число операция появляется сама. Правка и удаление не меняют уже созданные операции. Порядок
        меняется перетаскиванием за значок справа, свайп влево удаляет.
      </p>
      {adding && (
        <Sheet label="Новая регулярная операция" onClose={() => setAdding(false)}>
          {(close) => (
            <RecurringForm
              ledger={ledger}
              editing={false}
              close={close}
              initial={{ kind: "expense", description: "", amount: "", categoryId: "subscriptions", day: String(Number(ledger.today().slice(8))) }}
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
          )}
        </Sheet>
      )}
    </section>
  )
}
