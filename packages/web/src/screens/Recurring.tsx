import { formatDecimal, formatMoney, parseMoney, type CategoryKind } from "@fin/domain"
import { dayMonth, type Ledger, type RecurringProblem, type RecurringView } from "@fin/ledger"
import type { ComponentChildren, JSX } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { CategoryBadge } from "../components/CategoryBadge"
import { Sheet } from "../components/Sheet"
import { GripIcon, PlusIcon, RepeatIcon } from "../icons"
import { showToast } from "../toast"

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
  /** Закрыть панель с анимацией — и по «Отмена», и после сохранения. */
  close: () => void
  onSubmit: (draft: Draft, amount: number) => Promise<{ ok: boolean; problem?: RecurringProblem }>
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

/** Как строка сдвинута во время перетаскивания: своя — за пальцем, соседние — уступают место. */
interface RowDrag {
  readonly shift: number
  readonly lifted: boolean
  readonly onGripDown: (e: JSX.TargetedPointerEvent<HTMLSpanElement>) => void
  readonly onGripKey: (e: JSX.TargetedKeyboardEvent<HTMLSpanElement>) => void
}

const RecurringRow = ({ ledger, item, drag }: { ledger: Ledger; item: RecurringView; drag: RowDrag }) => {
  const [editing, setEditing] = useState(false)
  const today = ledger.today()
  const remove = async (close: () => void) => {
    const result = await ledger.deleteRecurring(item.id)
    if (!result.ok) return
    close()
    showToast({ text: `«${item.description}» удалена`, action: { label: "Отменить", run: () => result.undo() } })
  }
  return (
    <>
      <div
        class={`recurring-item${drag.lifted ? " lifted" : ""}`}
        style={drag.shift ? { transform: `translateY(${drag.shift}px)` } : undefined}
      >
        <button
          type="button"
          class={`row row-button ${item.status === "active" ? "" : "inactive"}`}
          aria-label={`Изменить: ${item.description}`}
          onClick={() => setEditing(true)}
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
        <span
          class="drag-handle"
          role="button"
          tabIndex={0}
          aria-label={`Переместить: ${item.description}. Стрелки вверх и вниз`}
          onPointerDown={drag.onGripDown}
          onKeyDown={drag.onGripKey}
        >
          <GripIcon />
        </span>
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

const moved = <T,>(list: ReadonlyArray<T>, from: number, to: number): Array<T> => {
  const out = [...list]
  const [item] = out.splice(from, 1)
  out.splice(to, 0, item!)
  return out
}

export const RecurringSection = ({ ledger }: { ledger: Ledger }) => {
  const [adding, setAdding] = useState(false)
  // перетаскивание: какая строка, откуда, куда встанет и насколько сдвинута за пальцем
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; height: number } | null>(null)
  // порядок после броска — пока журнал его не записал, чтобы строки не мигнули прежним
  const [dropped, setDropped] = useState<ReadonlyArray<string> | null>(null)
  // сразу после броска строки встают на новые места без анимации
  const [settling, setSettling] = useState(false)
  const startY = useRef(0)

  const fresh = ledger.recurring()
  const items = dropped
    ? [...fresh].sort((a, b) => (dropped.indexOf(a.id) + 1 || Infinity) - (dropped.indexOf(b.id) + 1 || Infinity))
    : fresh

  const reorder = (from: number, to: number) => {
    if (from === to) return
    const ids = moved(
      items.map((i) => i.id),
      from,
      to
    )
    setDropped(ids)
    void ledger.reorderRecurring(ids).finally(() => setDropped(null))
  }

  useEffect(() => {
    if (!settling) return
    const frame = requestAnimationFrame(() => setSettling(false))
    return () => cancelAnimationFrame(frame)
  }, [settling])

  const shiftOf = (index: number) => {
    if (!drag) return 0
    if (index === drag.from) return drag.dy
    if (drag.from < index && index <= drag.to) return -drag.height
    if (drag.to <= index && index < drag.from) return drag.height
    return 0
  }

  const rowDrag = (index: number): RowDrag => ({
    shift: shiftOf(index),
    lifted: drag?.from === index,
    onGripDown: (e) => {
      const row = e.currentTarget.parentElement!
      const grip = e.currentTarget
      grip.setPointerCapture(e.pointerId)
      startY.current = e.clientY
      const height = row.offsetHeight
      setDrag({ from: index, to: index, dy: 0, height })
      const onMove = (m: PointerEvent) => {
        const dy = m.clientY - startY.current
        // строку не утащить за край списка
        const clamped = Math.max(-index * height, Math.min((items.length - 1 - index) * height, dy))
        setDrag({ from: index, to: index + Math.round(clamped / height), dy: clamped, height })
      }
      const onUp = (u: PointerEvent) => {
        grip.removeEventListener("pointermove", onMove)
        grip.removeEventListener("pointerup", onUp)
        grip.removeEventListener("pointercancel", onUp)
        const dy = Math.max(-index * height, Math.min((items.length - 1 - index) * height, u.clientY - startY.current))
        setSettling(true)
        setDrag(null)
        if (u.type === "pointerup") reorder(index, index + Math.round(dy / height))
      }
      grip.addEventListener("pointermove", onMove)
      grip.addEventListener("pointerup", onUp)
      grip.addEventListener("pointercancel", onUp)
    },
    onGripKey: (e) => {
      const step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0
      const to = index + step
      if (!step || to < 0 || to >= items.length) return
      e.preventDefault()
      reorder(index, to)
    }
  })

  return (
    <section class="section">
      <div class={`card-list${drag ? " reordering" : ""}${settling ? " settling" : ""}`}>
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
        меняется перетаскиванием за значок справа.
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
