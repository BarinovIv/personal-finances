import { parseMoney } from "@fin/domain"
import { useState } from "preact/hooks"
import { amountText, confirmRecurringOperation } from "../helpers"
import { updateProblemText } from "../constants"
import { useLedgerVersion } from "../state"
import { operationTitle } from "./OperationBadge"
import { Sheet } from "./Sheet"
import type { RecurringAmountSheetProps } from "./types"

export const RecurringAmountSheet = ({ ledger, op, onClose, details = false }: RecurringAmountSheetProps) => {
  useLedgerVersion(ledger)
  const current = ledger.operation(op.id)
  const [amount, setAmount] = useState(amountText(op.amount))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const save = async (close: () => void) => {
    if (saving) return
    const kopecks = parseMoney(amount)
    if (kopecks === null) return setError(updateProblemText["bad-amount"])
    setSaving(true)
    const problem = await confirmRecurringOperation(ledger, current ?? op, kopecks)
    if (problem) {
      setSaving(false)
      return setError(problem)
    }
    close()
  }

  return (
    <Sheet label="Сумма регулярной операции" onClose={onClose}>
      {(close) => (
        <form class="sheet-form" onSubmit={(event) => { event.preventDefault(); void save(close) }}>
          <div class="sheet-title">{operationTitle(current ?? op)}</div>
          <div class="card-list">
            <label class="row input-row">
              <span class="row-label">Сумма, ₽</span>
              <input class="row-input num" type="text" inputMode="decimal" aria-label="Сумма, ₽" value={amount}
                onInput={(event) => { setAmount(event.currentTarget.value); setError(null) }} />
            </label>
          </div>
          <p class="hint">{current?.pending ? "Сохранение подтвердит операцию. " : ""}Сумма изменится только в этом месяце.</p>
          {error && <div class="hint error">{error}</div>}
          <div class="actions-row">
            <button type="button" class="secondary-button grow" onClick={close}>Отмена</button>
            <button type="submit" class="accent-button grow" disabled={saving || !current}>{current?.pending ? "Подтвердить" : "Сохранить"}</button>
          </div>
          {details && <a class="text-button center" href={`#/op/${op.id}`} onClick={onClose}>Подробнее</a>}
        </form>
      )}
    </Sheet>
  )
}
