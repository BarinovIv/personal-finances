import { formatDecimal, formatMoney, parseMoney } from "@fin/domain"
import { dayLabel, type Ledger, type OperationView, type RepaymentsInfo } from "@fin/ledger"
import { useState } from "preact/hooks"
import { kindLabel } from "../components/OperationBadge"
import { signedAmount } from "../components/OperationRow"
import { Sheet } from "../components/Sheet"
import { ForwardIcon, RefundIcon } from "../icons"
import { showToast } from "../toast"
import { movementProblemText } from "./Debts"

type DebtOperation = OperationView & { kind: "lent" | "borrowed" }

/** Погашение этого долга: по «Одолжил» — «Мне вернули», по «Занял» — «Я вернул». */
const repaymentKind = (debt: DebtOperation) => (debt.kind === "lent" ? "repaid-to-me" : "repaid-by-me")

const RepaymentForm = ({
  ledger,
  debt,
  info,
  onDone
}: {
  ledger: Ledger
  debt: DebtOperation
  info: RepaymentsInfo
  onDone: () => void
}) => {
  const today = ledger.today()
  const kind = repaymentKind(debt)
  const [amount, setAmount] = useState(formatDecimal(info.remaining).replace(/,00$/, ""))
  const [date, setDate] = useState(today)
  const [error, setError] = useState<string | null>(null)

  const submit = async (close: () => void) => {
    const kopecks = parseMoney(amount)
    if (kopecks === null) return setError(movementProblemText["bad-amount"])
    const result = await ledger.addMovement({ kind, debtId: debt.id, amount: kopecks, date })
    if (!result.ok) return setError(movementProblemText[result.problem])
    close()
    const rest = ledger.repayments(debt.id)?.remaining ?? 0
    showToast({
      text: `${kindLabel(kind)} ${formatMoney(kopecks)}. ${rest > 0 ? `Осталось ${formatMoney(rest)}` : "Долг закрыт"}`,
      action: { label: "Отменить", run: () => void result.undo() }
    })
  }

  return (
    <Sheet label={kindLabel(kind)} onClose={onDone}>
      {(close) => (
        <section class="sheet-form">
          <div class="sheet-title">{kindLabel(kind)}</div>
          <div class="card-list">
            <label class="row input-row">
              <span class="row-label">Сумма, ₽</span>
              <input
                id="debt-repayment"
                class="row-input num"
                type="text"
                inputMode="decimal"
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
                id="debt-repayment-date"
                class="row-input"
                type="date"
                value={date}
                max={today}
                onChange={(e) => e.currentTarget.value && setDate(e.currentTarget.value)}
              />
            </label>
          </div>
          <span class="hint">
            Можно погасить часть: осталось {formatMoney(info.remaining)}. Свободные деньги{" "}
            {kind === "repaid-to-me" ? "увеличатся" : "уменьшатся"} в периоде даты погашения.
          </span>
          {error && <div class="hint error">{error}</div>}
          <div class="actions-row">
            <button type="button" class="secondary-button grow" onClick={close}>
              Отмена
            </button>
            <button type="button" class="accent-button grow" onClick={() => void submit(close)}>
              Сохранить
            </button>
          </div>
        </section>
      )}
    </Sheet>
  )
}

/** В карточке долга: погашения, остаток и кнопка «Мне вернули» / «Я вернул», пока долг не закрыт. */
export const DebtRepayments = ({ ledger, debt }: { ledger: Ledger; debt: DebtOperation }) => {
  const [formOpen, setFormOpen] = useState(false)
  const info = ledger.repayments(debt.id)
  if (!info) return null
  const today = ledger.today()
  return (
    <>
      <section class="section">
        {info.items.length > 0 && (
          <>
            <h2 class="section-header">Погашения</h2>
            <div class="card-list">
              {info.items.map((r) => (
                <a class="row row-button" href={`#/op/${r.id}`} key={r.id}>
                  <RefundIcon size={18} />
                  <span class="row-main">
                    <span class="row-title">{dayLabel(r.date, today)}</span>
                  </span>
                  <span class="num op-amount">{signedAmount(r)}</span>
                  <span class="row-chevron">
                    <ForwardIcon size={16} />
                  </span>
                </a>
              ))}
            </div>
          </>
        )}
        <p class="section-footer">
          {info.remaining > 0
            ? `Осталось ${formatMoney(info.remaining)}${info.repaid > 0 ? ` из ${formatMoney(debt.amount)}` : ""}`
            : "Долг закрыт: погашен полностью"}
        </p>
      </section>
      {info.remaining > 0 && (
        <div class="card-list">
          <button type="button" class="row row-button action-row" onClick={() => setFormOpen(true)}>
            <RefundIcon size={18} />
            <span>{kindLabel(repaymentKind(debt))}</span>
          </button>
        </div>
      )}
      {formOpen && <RepaymentForm ledger={ledger} debt={debt} info={info} onDone={() => setFormOpen(false)} />}
    </>
  )
}

/** Долг ли эта операция — у него своя секция погашений в карточке. */
export const isDebtOperation = (op: OperationView): op is DebtOperation => op.kind === "lent" || op.kind === "borrowed"
