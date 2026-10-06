import { formatDecimal, formatMoney, parseMoney } from "@fin/domain"
import { CATEGORY_ICONS, dayMonth, type GoalProblem, type GoalView, type Ledger } from "@fin/ledger"
import type { ComponentChildren } from "preact"
import { useState } from "preact/hooks"
import { CategoryBadge } from "../components/CategoryBadge"
import { Sheet } from "../components/Sheet"
import { SymbolGlyph } from "../categoryIcons"
import { CheckIcon, CloseIcon, ForwardIcon, PlusIcon } from "../icons"

/** У целей нет своего цвета: значок цели всегда одного цвета палитры, иконку выбирает пользователь. */
const GOAL_COLOR = "teal"

export const GoalBadge = ({ goal, size }: { goal: Pick<GoalView, "icon" | "name">; size?: number }) => (
  <CategoryBadge category={{ name: goal.name, icon: goal.icon, color: GOAL_COLOR }} size={size} symbol />
)

/** Полоска прогресса цели; достигнутая — цветом бренда. */
export const GoalBar = ({ goal }: { goal: GoalView }) => (
  <span class="goal-bar">
    <span
      class="goal-bar-fill"
      style={{ width: `${goal.percent}%`, background: goal.reached ? "var(--brand)" : `var(--palette-${GOAL_COLOR})` }}
    />
  </span>
)

/** «по 16 000 ₽ в месяц до 28 февраля», «Цель достигнута», «Срок 15 октября прошёл». */
export const goalStatus = (goal: GoalView, today: string): string | null => {
  if (goal.reached) return "Цель достигнута"
  if (goal.overdue && goal.deadline) return `Срок ${dayMonth(goal.deadline, today)} прошёл`
  if (goal.perMonth !== null && goal.deadline) return `по ${formatMoney(goal.perMonth)} в месяц до ${dayMonth(goal.deadline, today)}`
  return null
}

/** Строка цели в списке и в блоке на дашборде: значок, название, полоска, «20 000 из 100 000 ₽». */
const GoalRow = ({ goal, today }: { goal: GoalView; today: string }) => {
  const status = goalStatus(goal, today)
  return (
    <a class={`row row-button goal-row${goal.archived ? " inactive" : ""}`} href={`#/goal/${encodeURIComponent(goal.id)}`}>
      <GoalBadge goal={goal} />
      <span class="row-main">
        <span class="goal-row-line">
          <span class="row-title">
            {goal.name}
            {goal.reached && (
              <span class="goal-reached" aria-label="Цель достигнута">
                <CheckIcon size={14} />
              </span>
            )}
          </span>
          <span class="goal-percent num">{goal.percent}%</span>
        </span>
        <GoalBar goal={goal} />
        <span class="row-sub">
          <span class="num">
            {formatMoney(goal.saved)} из {formatMoney(goal.target)}
          </span>
          {status && !goal.reached && ` · ${status}`}
        </span>
      </span>
      <span class="row-chevron">
        <ForwardIcon size={16} />
      </span>
    </a>
  )
}

/** Блок «Цели» на дашборде: прогресс каждой действующей цели; заголовок ведёт к списку целей. */
export const GoalsBlock = ({ ledger }: { ledger: Ledger }) => {
  const goals = ledger.goals({ archived: false })
  const today = ledger.today()
  return (
    <section class="section">
      <a href="#/settings/goals" class="goals-head">
        <h2>Цели</h2>
        <ForwardIcon size={16} />
      </a>
      <div class="card-list">
        {goals.map((g) => (
          <GoalRow key={g.id} goal={g} today={today} />
        ))}
        {goals.length === 0 && (
          <a class="row row-button action-row" href="#/settings/goals">
            <PlusIcon />
            <span>Добавить цель</span>
          </a>
        )}
      </div>
    </section>
  )
}

const problemText: Record<GoalProblem, string> = {
  "not-found": "Цель уже удалена.",
  "empty-name": "Введите название.",
  "bad-target": "Укажите сумму цели в рублях, например «100 000».",
  "bad-deadline": "Проверьте срок."
}

export interface GoalDraft {
  readonly name: string
  readonly icon: string
  readonly target: string
  /** Пусто — без срока. */
  readonly deadline: string
}

export const goalDraft = (goal: GoalView): GoalDraft => ({
  name: goal.name,
  icon: goal.icon,
  target: formatDecimal(goal.target).replace(/,00$/, ""),
  deadline: goal.deadline ?? ""
})

const NEW_GOAL: GoalDraft = { name: "", icon: "star", target: "", deadline: "" }

/**
 * Форма цели в выезжающей панели: название, иконка, сумма и необязательный срок.
 * `children` — дополнительные действия под формой (архив, удаление).
 */
export const GoalForm = (props: {
  ledger: Ledger
  initial: GoalDraft
  editing: boolean
  close: () => void
  onSubmit: (input: { name: string; icon: string; target: number; deadline: string | null }) => Promise<{ ok: boolean; problem?: GoalProblem }>
  children?: ComponentChildren
}) => {
  const [draft, setDraft] = useState(props.initial)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<GoalDraft>) => {
    setDraft({ ...draft, ...patch })
    setError(null)
  }
  const submit = async (e: Event) => {
    e.preventDefault()
    const target = parseMoney(draft.target)
    if (target === null) return setError(problemText["bad-target"])
    const result = await props.onSubmit({ name: draft.name, icon: draft.icon, target, deadline: draft.deadline || null })
    if (!result.ok) return setError(problemText[result.problem ?? "bad-target"])
    props.close()
  }
  return (
    <form class="sheet-form" onSubmit={submit}>
      <div class="sheet-title">{props.editing ? "Цель" : "Новая цель"}</div>
      <div class="sheet-title-row">
        <GoalBadge goal={draft} size={36} />
        <input
          class="text-input"
          type="text"
          placeholder="Например, Отпуск"
          aria-label="Название цели"
          value={draft.name}
          onInput={(e) => set({ name: e.currentTarget.value })}
        />
      </div>
      <div class="icon-grid" role="group" aria-label="Иконка цели">
        {CATEGORY_ICONS.map((i) => (
          <button
            key={i}
            type="button"
            class="icon-swatch"
            aria-pressed={i === draft.icon}
            style={i === draft.icon ? { background: `var(--palette-${GOAL_COLOR})` } : undefined}
            onClick={() => set({ icon: i })}
          >
            <SymbolGlyph icon={i} size={16} />
          </button>
        ))}
      </div>
      <div class="card-list">
        <label class="row input-row">
          <span class="row-label">Сумма цели, ₽</span>
          <input
            class="row-input num"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={draft.target}
            onInput={(e) => set({ target: e.currentTarget.value })}
          />
        </label>
        <label class="row input-row">
          <span class="row-label">Срок</span>
          <span class="date-pill">
            <input
              class="row-input"
              type="date"
              aria-label="Срок"
              value={draft.deadline}
              min={props.editing ? undefined : props.ledger.today()}
              onChange={(e) => set({ deadline: e.currentTarget.value })}
            />
            {draft.deadline && (
              <button type="button" class="date-clear" aria-label="Без срока" onClick={() => set({ deadline: "" })}>
                <CloseIcon size={10} />
              </button>
            )}
          </span>
        </label>
      </div>
      <span class="hint">
        {draft.deadline
          ? "Покажу, сколько откладывать в месяц, чтобы успеть к сроку."
          : "Срок необязателен. С ним видно, сколько откладывать в месяц."}
      </span>
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

/** Список целей (из настроек и с блока на дашборде): действующие, затем архив. */
export const GoalsSection = ({ ledger }: { ledger: Ledger }) => {
  const [adding, setAdding] = useState(false)
  const today = ledger.today()
  const goals = ledger.goals()
  const active = goals.filter((g) => !g.archived)
  const archived = goals.filter((g) => g.archived)
  return (
    <>
      <section class="section">
        <div class="card-list">
          {active.map((g) => (
            <GoalRow key={g.id} goal={g} today={today} />
          ))}
          <button type="button" class="row row-button action-row" onClick={() => setAdding(true)}>
            <PlusIcon />
            <span>Добавить цель</span>
          </button>
        </div>
        <p class="section-footer">
          В карточке цели — «Отложить» и «Снять». Это не расходы: они меняют только свободные деньги. Покупку, на которую
          копили, вносите так: «Снять», затем обычный расход.
        </p>
      </section>
      {archived.length > 0 && (
        <section class="section">
          <h2 class="section-header">Архив</h2>
          <div class="card-list">
            {archived.map((g) => (
              <GoalRow key={g.id} goal={g} today={today} />
            ))}
          </div>
        </section>
      )}
      {adding && (
        <Sheet label="Новая цель" onClose={() => setAdding(false)}>
          {(close) => (
            <GoalForm ledger={ledger} editing={false} close={close} initial={NEW_GOAL} onSubmit={(input) => ledger.addGoal(input)} />
          )}
        </Sheet>
      )}
    </>
  )
}
