import { formatDecimal, formatMoney, parseMoney } from "@fin/domain"
import { dayLabel, type Ledger, type OperationView, type RefundProblem, type UpdateProblem } from "@fin/ledger"
import { useState } from "preact/hooks"
import { CategoryGrid } from "../components/CategoryGrid"
import { Header } from "../components/Header"
import { SwipeBack } from "../components/SwipeBack"
import { RefundIcon } from "../icons"
import { goBack, useLedgerVersion } from "../state"
import { showToast } from "../toast"

const problemText: Record<UpdateProblem, string> = {
  "not-found": "Операция уже удалена.",
  "bad-amount": "Проверьте сумму.",
  "no-description": "Добавьте описание.",
  "bad-category": "Выберите категорию.",
  "below-refunds": "Сумма меньше уже оформленных возвратов."
}

const amountText = (kopecks: number) => formatDecimal(kopecks).replace(/,00$/, "")

const refundProblemText: Record<RefundProblem, string> = {
  "not-refundable": "Возврат оформляется только по расходу.",
  "bad-amount": "Проверьте сумму возврата.",
  "too-much": "Нельзя вернуть больше, чем потрачено."
}

const Refunds = ({ ledger, op }: { ledger: Ledger; op: OperationView }) => {
  const info = ledger.refunds(op.id)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(ledger.today())
  const [error, setError] = useState<string | null>(null)
  if (!info) return null
  const today = ledger.today()

  const submit = async () => {
    const kopecks = parseMoney(amount)
    if (kopecks === null) return setError(refundProblemText["bad-amount"])
    const result = await ledger.addRefund(op.id, { amount: kopecks, date })
    if (!result.ok) return setError(refundProblemText[result.problem])
    setOpen(false)
    showToast({ text: `Возврат ${formatMoney(kopecks)} оформлен` })
  }

  return (
    <>
      {info.items.length > 0 && (
        <section class="refunds">
          <h2>Возвраты</h2>
          {info.items.map((r) => (
            <a class="refund-row" href={`#/op/${r.id}`} key={r.id}>
              <RefundIcon />
              <span class="grow-text">{dayLabel(r.date, today)}</span>
              <span class="num refund-amount">+{formatMoney(r.amount)}</span>
            </a>
          ))}
          <span class="refunds-net">
            {info.remaining > 0
              ? `Итого потрачено с учётом возвратов: ${formatMoney(info.remaining)}`
              : "Деньги вернули полностью"}
          </span>
        </section>
      )}
      {open && (
        <section class="refund-form">
          <h2>Возврат денег</h2>
          <label for="op-refund" class="field-label">
            Сколько вернули, ₽ (можно часть суммы)
          </label>
          <input
            id="op-refund"
            class="text-input num"
            type="text"
            inputMode="decimal"
            value={amount}
            onInput={(e) => setAmount(e.currentTarget.value)}
          />
          <div class="field-row">
            <label for="op-refund-date" class="field-label">
              Дата возврата
            </label>
            <input
              id="op-refund-date"
              class="chip date-chip"
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.currentTarget.value && setDate(e.currentTarget.value)}
            />
          </div>
          <span class="hint">
            Расходы на «{op.category.name}» уменьшатся в периоде даты возврата. В доходы возврат не попадёт.
          </span>
          {error && <div class="hint error">{error}</div>}
          <div class="actions-row">
            <button type="button" class="secondary-button grow" onClick={() => setOpen(false)}>
              Отмена
            </button>
            <button type="button" class="accent-button grow" onClick={() => void submit()}>
              Оформить возврат
            </button>
          </div>
        </section>
      )}
      {!open && info.remaining > 0 && (
        <button
          type="button"
          class="outline-accent-button"
          onClick={() => {
            setAmount(amountText(info.remaining))
            setDate(today)
            setError(null)
            setOpen(true)
          }}
        >
          <RefundIcon size={18} />
          <span>Возврат</span>
        </button>
      )}
    </>
  )
}

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
    goBack("/")
  }

  const categoryName = () => ledger.categories(categoryKind).find((c) => c.id === categoryId)?.name ?? ""

  const remove = async () => {
    await ledger.deleteOperation(op.id)
    goBack("/")
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
        {op.kind === "expense" && <Refunds ledger={ledger} op={op} />}
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
    <SwipeBack onBack={() => goBack("/")}>
      <div class="screen column">
        <Header title={op?.kind === "refund" ? "Возврат" : "Операция"} />
        {op ? <Editor key={`${op.id}:${op.updatedAt}`} ledger={ledger} op={op} /> : <div class="empty">Операция удалена</div>}
      </div>
    </SwipeBack>
  )
}
