import { formatMoney, parseMoney } from "@fin/domain"
import { dayLabel, type GoalView, type Ledger, type MovementProblem } from "@fin/ledger"
import { useState } from "preact/hooks"
import { Header } from "../components/Header"
import { kindLabel } from "../components/OperationBadge"
import { signedAmount } from "../components/OperationRow"
import { Sheet } from "../components/Sheet"
import { SwipeBack } from "../components/SwipeBack"
import { CheckIcon, ForwardIcon } from "../icons"
import { goBack, useLedgerVersion } from "../state"
import { showToast } from "../toast"
import { GoalBadge, GoalBar, GoalForm, goalDraft, goalStatus } from "./Goals"

type GoalMove = "saved" | "withdrawn"

/** У «Отложить» и «Снять» бывают только эти проблемы; остальные относятся к долгам. */
const moveProblemText = (problem: MovementProblem) =>
  problem === "too-much" ? "Нельзя снять больше, чем накоплено." : problem === "no-goal" ? "Цель уже удалена." : "Проверьте сумму."

/** «Отложить» или «Снять»: сумма и дата, по умолчанию сегодня. */
const MoveSheet = ({ ledger, goal, kind, onDone }: { ledger: Ledger; goal: GoalView; kind: GoalMove; onDone: () => void }) => {
  const today = ledger.today()
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const title = kind === "saved" ? `Отложить на «${goal.name}»` : `Снять с «${goal.name}»`

  const submit = async (close: () => void) => {
    const kopecks = parseMoney(amount)
    if (kopecks === null) return setError(moveProblemText("bad-amount"))
    const result = await ledger.addMovement({ kind, goalId: goal.id, amount: kopecks, date })
    if (!result.ok) return setError(moveProblemText(result.problem))
    close()
    showToast({
      text: `${kind === "saved" ? "Отложено" : "Снято"} ${formatMoney(kopecks)} · ${goal.name}`,
      action: { label: "Отменить", run: () => void result.undo() }
    })
  }

  return (
    <Sheet label={title} onClose={onDone}>
      {(close) => (
        <form
          class="sheet-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit(close)
          }}
        >
          <div class="sheet-title">{title}</div>
          <div class="card-list">
            <label class="row input-row">
              <span class="row-label">Сумма, ₽</span>
              <input
                class="row-input num"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onInput={(e) => {
                  setAmount(e.currentTarget.value)
                  setError(null)
                }}
              />
            </label>
            <label class="row input-row">
              <span class="row-label">Дата</span>
              <input
                class="row-input"
                type="date"
                value={date}
                max={today}
                onChange={(e) => e.currentTarget.value && setDate(e.currentTarget.value)}
              />
            </label>
          </div>
          <span class="hint">
            {kind === "saved"
              ? "Не расход: свободные деньги периода этой даты уменьшатся, расходы не изменятся."
              : `Накоплено ${formatMoney(goal.saved)}. Покупку, на которую копили, внесите после снятия обычным расходом.`}
          </span>
          {error && <span class="hint error">{error}</span>}
          <div class="actions-row">
            <button type="button" class="secondary-button grow" onClick={close}>
              Отмена
            </button>
            <button type="submit" class="accent-button grow">
              {kind === "saved" ? "Отложить" : "Снять"}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  )
}

/** Правка цели; под формой — архив и удаление (только пустой цели). */
const EditSheet = ({ ledger, goal, onDone }: { ledger: Ledger; goal: GoalView; onDone: () => void }) => {
  const remove = async () => {
    const result = await ledger.deleteGoal(goal.id)
    if (!result.ok) return
    goBack("/settings/goals")
    showToast({ text: `Цель «${goal.name}» удалена`, action: { label: "Отменить", run: () => void result.undo() } })
  }
  return (
    <Sheet label={`Цель «${goal.name}»`} onClose={onDone}>
      {(close) => (
        <GoalForm
          ledger={ledger}
          editing
          close={close}
          initial={goalDraft(goal)}
          onSubmit={(input) => ledger.updateGoal(goal.id, input)}
        >
          <div class="actions-row">
            <button
              type="button"
              class="secondary-button grow"
              onClick={() => {
                void ledger.archiveGoal(goal.id, !goal.archived)
                close()
              }}
            >
              {goal.archived ? "Вернуть из архива" : "В архив"}
            </button>
            <button type="button" class="secondary-button danger-button grow" disabled={goal.saved !== 0} onClick={() => void remove()}>
              Удалить
            </button>
          </div>
          {goal.saved !== 0 && <span class="hint">Удалить можно только цель, на которой ничего не накоплено.</span>}
        </GoalForm>
      )}
    </Sheet>
  )
}

const GoalCard = ({ ledger, goal }: { ledger: Ledger; goal: GoalView }) => {
  const [moving, setMoving] = useState<GoalMove | null>(null)
  const [editing, setEditing] = useState(false)
  const today = ledger.today()
  const status = goalStatus(goal, today)
  const history = ledger.goalHistory(goal.id)

  return (
    <>
      <Header
        title="Цель"
        back="#/settings/goals"
        trailing={
          <button type="button" class="glass-button text" onClick={() => setEditing(true)}>
            Изменить
          </button>
        }
      />
      <div class="page">
        <section class="op-hero goal-hero">
          <GoalBadge goal={goal} size={64} />
          <span class="op-hero-desc">{goal.name}</span>
          <span class="op-hero-amount num">{formatMoney(goal.saved)}</span>
          <span class="goal-hero-target num">
            из {formatMoney(goal.target)} · {goal.percent}%
          </span>
          <GoalBar goal={goal} />
          {status && (
            <span class={`goal-status${goal.reached ? " reached" : goal.overdue ? " overdue" : ""}`}>
              {goal.reached && <CheckIcon size={16} />}
              {status}
            </span>
          )}
          {goal.archived && <span class="goal-status">В архиве</span>}
        </section>
        <div class="actions-row">
          <button type="button" class="accent-button grow" onClick={() => setMoving("saved")}>
            Отложить
          </button>
          <button type="button" class="secondary-button grow" disabled={goal.saved <= 0} onClick={() => setMoving("withdrawn")}>
            Снять
          </button>
        </div>
        <section class="section">
          <h2 class="section-header">История</h2>
          {history.length > 0 ? (
            <div class="card-list">
              {history.map((op) => (
                <a class="row row-button" href={`#/op/${op.id}`} key={op.id}>
                  <span class="row-main">
                    <span class="row-title">{kindLabel(op.kind)}</span>
                    <span class="row-sub">{[dayLabel(op.date, today), op.description].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span class={`num op-amount ${op.kind}`}>{signedAmount(op)}</span>
                  <span class="row-chevron">
                    <ForwardIcon size={16} />
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p class="section-footer">Пока ничего не отложено.</p>
          )}
        </section>
      </div>
      {moving && <MoveSheet ledger={ledger} goal={goal} kind={moving} onDone={() => setMoving(null)} />}
      {editing && <EditSheet ledger={ledger} goal={goal} onDone={() => setEditing(false)} />}
    </>
  )
}

/** Карточка цели: накоплено, прогресс, «Отложить» и «Снять», история операций цели. */
export const GoalScreen = ({ ledger, id }: { ledger: Ledger; id: string }) => {
  useLedgerVersion(ledger)
  const goal = ledger.goal(id)
  if (!goal) {
    return (
      <div class="screen column">
        <Header title="Цель" back="#/settings/goals" />
        <div class="empty">Цель удалена</div>
      </div>
    )
  }
  return (
    <SwipeBack onBack={(options) => goBack("/settings/goals", options)}>
      <div class="screen column">
        <GoalCard ledger={ledger} goal={goal} />
      </div>
    </SwipeBack>
  )
}
