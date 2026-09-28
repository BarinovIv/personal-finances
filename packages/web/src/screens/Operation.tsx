import { formatDecimal, parseMoney } from "@fin/domain"
import type { Ledger, OperationView, UpdateProblem } from "@fin/ledger"
import { useState } from "preact/hooks"
import { CategoryGrid } from "../components/CategoryGrid"
import { BackIcon } from "../icons"
import { navigate, useLedgerVersion } from "../state"
import { showToast } from "../toast"

const problemText: Record<UpdateProblem, string> = {
  "not-found": "Операция уже удалена.",
  "bad-amount": "Проверьте сумму.",
  "no-description": "Добавьте описание.",
  "bad-category": "Выберите категорию.",
  "below-refunds": "Сумма меньше уже оформленных возвратов."
}

const amountText = (kopecks: number) => formatDecimal(kopecks).replace(/,00$/, "")

export const Header = ({ title, back = "#/" }: { title: string; back?: string }) => (
  <header class="screen-header">
    <a href={back} class="back-link">
      <BackIcon />
      <span>Назад</span>
    </a>
    <span class="screen-title">{title}</span>
  </header>
)

const Editor = ({ ledger, op }: { ledger: Ledger; op: OperationView }) => {
  const [amount, setAmount] = useState(amountText(op.amount))
  const [description, setDescription] = useState(op.description)
  const [categoryId, setCategoryId] = useState(op.category.id)
  const [date, setDate] = useState(op.date)
  const [error, setError] = useState<string | null>(null)
  const isRefund = op.kind === "refund"
  const categoryKind = op.kind === "income" ? "income" : "expense"

  const save = async () => {
    const kopecks = parseMoney(amount)
    if (kopecks === null) return setError(problemText["bad-amount"])
    const result = await ledger.updateOperation(
      op.id,
      isRefund ? { amount: kopecks, date } : { amount: kopecks, description, categoryId, date }
    )
    if (!result.ok) return setError(problemText[result.problem])
    const learned = !isRefund && categoryId !== op.category.id
    showToast({ text: learned ? `Сохранено. Запомню: «${description.trim()}» → ${categoryName()}` : "Сохранено" })
    navigate("/")
  }

  const categoryName = () => ledger.categories(categoryKind).find((c) => c.id === categoryId)?.name ?? ""

  const remove = async () => {
    await ledger.deleteOperation(op.id)
    navigate("/")
    showToast({ text: `Удалено: ${op.description}`, action: { label: "Отменить", run: () => void ledger.restoreOperation(op.id) } })
  }

  return (
    <>
      <div class="page form">
        <div class="field">
          <label for="op-amount">Сумма, ₽</label>
          <input
            id="op-amount"
            class="text-input amount-input num"
            type="text"
            inputMode="decimal"
            value={amount}
            onInput={(e) => setAmount(e.currentTarget.value)}
          />
        </div>
        {!isRefund && (
          <div class="field">
            <label for="op-desc">Описание</label>
            <input
              id="op-desc"
              class="text-input"
              type="text"
              value={description}
              onInput={(e) => setDescription(e.currentTarget.value)}
            />
          </div>
        )}
        {!isRefund && (
          <div class="field">
            <span class="field-label">Категория</span>
            <CategoryGrid categories={ledger.categories(categoryKind)} selected={categoryId} onPick={setCategoryId} />
            {categoryId !== op.category.id && (
              <span class="hint accent">
                Запомню: «{description.trim()}» → {categoryName()}. Следующая такая операция попадёт туда же.
              </span>
            )}
          </div>
        )}
        {isRefund && <p class="hint">Возврат по расходу «{op.description}» · {op.category.name}</p>}
        <div class="field-row">
          <label for="op-date" class="field-label">
            Дата
          </label>
          <input
            id="op-date"
            class="chip date-chip"
            type="date"
            value={date}
            max={ledger.today()}
            onChange={(e) => e.currentTarget.value && setDate(e.currentTarget.value)}
          />
        </div>
        {error && <div class="hint error">{error}</div>}
      </div>
      <div class="actions">
        <button type="button" class="primary-button" onClick={() => void save()}>
          Сохранить
        </button>
        <div class="actions-row">
          <button type="button" class="secondary-button danger-button grow" onClick={() => void remove()}>
            Удалить
          </button>
        </div>
      </div>
    </>
  )
}

export const OperationScreen = ({ ledger, id }: { ledger: Ledger; id: string }) => {
  useLedgerVersion(ledger)
  const op = ledger.operation(id)
  return (
    <div class="screen column">
      <Header title={op?.kind === "refund" ? "Возврат" : "Операция"} />
      {op ? <Editor key={`${op.id}:${op.updatedAt}`} ledger={ledger} op={op} /> : <div class="empty">Операция удалена</div>}
    </div>
  )
}
