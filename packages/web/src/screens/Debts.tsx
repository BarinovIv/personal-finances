import { formatMoney, parseMoney } from "@fin/domain"
import { dayLabel, type DebtView, type Ledger, type MovementProblem, type PersonDebts } from "@fin/ledger"
import { useState } from "preact/hooks"
import { kindLabel, OperationBadge } from "../components/OperationBadge"
import { signedAmount } from "../components/OperationRow"
import { Sheet } from "../components/Sheet"
import { ForwardIcon, PlusIcon } from "../icons"
import { showToast } from "../toast"

type DebtKind = "lent" | "borrowed"

export const movementProblemText: Record<MovementProblem, string> = {
  "bad-amount": "Проверьте сумму.",
  "no-goal": "Выберите цель.",
  "no-person": "Укажите, кто.",
  "not-a-debt": "Долг уже удалён.",
  "too-much": "Нельзя погасить больше остатка."
}

/** Кто кому должен по сальдо человека. */
const balanceText = (balance: number) => (balance > 0 ? "должен мне" : balance < 0 ? "я должен" : "в расчёте")

/** «20 сентября · осталось 1 500 ₽» — остаток, только если долг уже гасили. */
const openDebtSub = (debt: DebtView, today: string) =>
  dayLabel(debt.operation.date, today) + (debt.repaid > 0 ? ` · осталось ${formatMoney(debt.remaining)}` : "")

/** Строка долга — ведёт в его карточку, где оформляются погашения. */
const DebtRow = ({ debt, title, sub }: { debt: DebtView; title: string; sub: string }) => (
  <a class={`row row-button${debt.remaining > 0 ? "" : " inactive"}`} href={`#/op/${debt.operation.id}`}>
    <OperationBadge op={debt.operation} size={32} />
    <span class="row-main">
      <span class="row-title">{title}</span>
      <span class="row-sub">{sub}</span>
    </span>
    <span class="num op-amount">{signedAmount(debt.operation)}</span>
    <span class="row-chevron">
      <ForwardIcon size={16} />
    </span>
  </a>
)

/** Человек: сальдо сверху, под ним его незакрытые долги. */
const PersonSection = ({ person, today }: { person: PersonDebts; today: string }) => (
  <section class="section">
    <div class="card-list">
      <div class="row">
        <span class="row-main">
          <span class="row-title debt-person">{person.name}</span>
          <span class="row-sub">{balanceText(person.balance)}</span>
        </span>
        {person.balance !== 0 && (
          <span class={`num debt-balance${person.balance > 0 ? " owed-to-me" : ""}`}>{formatMoney(Math.abs(person.balance))}</span>
        )}
      </div>
      {person.open.map((debt) => (
        <DebtRow
          key={debt.operation.id}
          debt={debt}
          title={kindLabel(debt.operation.kind) + (debt.operation.description ? ` · ${debt.operation.description}` : "")}
          sub={openDebtSub(debt, today)}
        />
      ))}
    </div>
  </section>
)

/** Форма нового долга: «Одолжил» (кому) или «Занял» (у кого). */
const DebtForm = ({ ledger, initialKind, close }: { ledger: Ledger; initialKind: DebtKind; close: () => void }) => {
  const today = ledger.today()
  const people = ledger.debtPeople()
  const [kind, setKind] = useState<DebtKind>(initialKind)
  const [person, setPerson] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const typed = person.trim().toLowerCase()
  // подсказки — уже встречавшиеся люди; пока имя не введено целиком, показываем подходящие
  const suggestions = people.filter((p) => p.toLowerCase() !== typed && p.toLowerCase().includes(typed)).slice(0, 6)

  const submit = async (e: Event) => {
    e.preventDefault()
    const kopecks = parseMoney(amount)
    if (kopecks === null) return setError(movementProblemText["bad-amount"])
    const result = await ledger.addMovement({ kind, person, amount: kopecks, date, description })
    if (!result.ok) return setError(movementProblemText[result.problem])
    close()
    showToast({
      text: `${kindLabel(kind)}: ${result.operation.person} · ${formatMoney(kopecks)}`,
      action: { label: "Отменить", run: () => result.undo() }
    })
  }

  return (
    <form class="sheet-form" onSubmit={submit}>
      <div class="sheet-title">Новый долг</div>
      <div class="segmented" role="group" aria-label="Вид долга">
        {(["lent", "borrowed"] as const).map((k) => (
          <button type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {kindLabel(k)}
          </button>
        ))}
      </div>
      <div class="card-list">
        <label class="row input-row">
          <span class="row-label">{kind === "lent" ? "Кому" : "У кого"}</span>
          <input
            id="debt-person"
            class="row-input"
            type="text"
            autocomplete="off"
            placeholder="Имя"
            value={person}
            onInput={(e) => {
              setPerson(e.currentTarget.value)
              setError(null)
            }}
          />
        </label>
        <label class="row input-row">
          <span class="row-label">Сумма, ₽</span>
          <input
            id="debt-amount"
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
            id="debt-date"
            class="row-input"
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.currentTarget.value && setDate(e.currentTarget.value)}
          />
        </label>
        <label class="row input-row">
          <span class="row-label">Описание</span>
          <input
            id="debt-desc"
            class="row-input"
            type="text"
            placeholder="необязательно"
            value={description}
            onInput={(e) => setDescription(e.currentTarget.value)}
          />
        </label>
      </div>
      {suggestions.length > 0 && (
        <div class="person-chips" role="group" aria-label="Уже встречались">
          {suggestions.map((p) => (
            <button type="button" class="chip" key={p} onClick={() => setPerson(p)}>
              {p}
            </button>
          ))}
        </div>
      )}
      <span class="hint">
        {kind === "lent"
          ? "Свободные деньги уменьшатся, расходы — нет. Когда вернут, отметьте это в карточке долга."
          : "Свободные деньги увеличатся, доходы — нет. Когда вернёте, отметьте это в карточке долга."}
      </span>
      {error && <span class="hint error">{error}</span>}
      <div class="actions-row">
        <button type="button" class="secondary-button grow" onClick={close}>
          Отмена
        </button>
        <button type="submit" class="accent-button grow">
          Сохранить
        </button>
      </div>
    </form>
  )
}

/** Экран долгов: по людям с сальдо, закрытые — отдельно. */
export const DebtsSection = ({ ledger }: { ledger: Ledger }) => {
  const [adding, setAdding] = useState<DebtKind | null>(null)
  const today = ledger.today()
  const { people, closed } = ledger.debts()
  return (
    <>
      <section class="section">
        <div class="card-list">
          <button type="button" class="row row-button action-row" onClick={() => setAdding("lent")}>
            <PlusIcon />
            <span>Одолжил</span>
          </button>
          <button type="button" class="row row-button action-row" onClick={() => setAdding("borrowed")}>
            <PlusIcon />
            <span>Занял</span>
          </button>
        </div>
        <p class="section-footer">
          {people.length === 0 && closed.length === 0
            ? "Долгов нет. Долги и погашения видны в ленте и меняют свободные деньги, но в расходы и доходы не входят."
            : "Долги и погашения видны в ленте и меняют свободные деньги, но в расходы и доходы не входят."}
        </p>
      </section>
      {people.map((person) => (
        <PersonSection key={person.name} person={person} today={today} />
      ))}
      {closed.length > 0 && (
        <section class="section">
          <h2 class="section-header">Закрытые</h2>
          <div class="card-list">
            {closed.map((debt) => (
              <DebtRow
                key={debt.operation.id}
                debt={debt}
                title={debt.operation.person ?? ""}
                sub={`${kindLabel(debt.operation.kind)} · ${dayLabel(debt.operation.date, today)}`}
              />
            ))}
          </div>
        </section>
      )}
      {adding && (
        <Sheet label="Новый долг" onClose={() => setAdding(null)}>
          {(close) => <DebtForm ledger={ledger} initialKind={adding} close={close} />}
        </Sheet>
      )}
    </>
  )
}
