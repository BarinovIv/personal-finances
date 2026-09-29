import { formatDecimal, formatMoney, parseMoney } from "@fin/domain"
import { dayLabel, type Ledger, type OperationView, type RefundProblem, type RefundsInfo, type UpdateProblem } from "@fin/ledger"
import { useEffect, useState } from "preact/hooks"
import { CategoryBadge } from "../components/CategoryBadge"
import { CategoryGrid } from "../components/CategoryGrid"
import { Header } from "../components/Header"
import { signedAmount } from "../components/OperationRow"
import { Sheet } from "../components/Sheet"
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

const deletedText = (op: OperationView) => (op.kind === "refund" ? `Возврат: ${op.description}` : op.description)

const RefundsList = ({
  ledger,
  info,
  onOpenForm
}: {
  ledger: Ledger
  info: RefundsInfo
  onOpenForm: () => void
}) => {
  const today = ledger.today()
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
      {info.remaining > 0 && (
        <button type="button" class="outline-accent-button" onClick={onOpenForm}>
          <RefundIcon size={18} />
          <span>Возврат</span>
        </button>
      )}
    </>
  )
}

const RefundForm = ({
  ledger,
  op,
  info,
  onDone
}: {
  ledger: Ledger
  op: OperationView
  info: RefundsInfo
  onDone: () => void
}) => {
  const today = ledger.today()
  const [amount, setAmount] = useState(amountText(info.remaining))
  const [date, setDate] = useState(today)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const kopecks = parseMoney(amount)
    if (kopecks === null) return setError(refundProblemText["bad-amount"])
    const result = await ledger.addRefund(op.id, { amount: kopecks, date })
    if (!result.ok) return setError(refundProblemText[result.problem])
    onDone()
    showToast({ text: `Возврат ${formatMoney(kopecks)} оформлен` })
  }

  return (
    <Sheet onClose={onDone}>
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
          <button type="button" class="secondary-button grow" onClick={onDone}>
            Отмена
          </button>
          <button type="button" class="accent-button grow" onClick={() => void submit()}>
            Оформить возврат
          </button>
        </div>
      </section>
    </Sheet>
  )
}

const DeleteSheet = ({ op, onConfirm, onClose }: { op: OperationView; onConfirm: () => void; onClose: () => void }) => (
  <Sheet onClose={onClose}>
    <p class="delete-sheet-title">Удалить операцию?</p>
    <p class="hint">
      «{deletedText(op)}» · {formatMoney(op.amount)}
    </p>
    <div class="actions-row">
      <button type="button" class="secondary-button grow" onClick={onClose}>
        Отмена
      </button>
      <button type="button" class="secondary-button danger-button grow" onClick={onConfirm}>
        Удалить
      </button>
    </div>
  </Sheet>
)

const remove = async (ledger: Ledger, op: OperationView) => {
  await ledger.deleteOperation(op.id)
  goBack("/")
  showToast({ text: `Удалено: ${deletedText(op)}`, action: { label: "Отменить", run: () => void ledger.restoreOperation(op.id) } })
}

const ViewCard = ({ ledger, op, onEdit }: { ledger: Ledger; op: OperationView; onEdit: () => void }) => {
  const [refundOpen, setRefundOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const isRefund = op.kind === "refund"
  const info = op.kind === "expense" ? ledger.refunds(op.id) : undefined

  return (
    <>
      <Header
        title={isRefund ? "Возврат" : "Операция"}
        trailing={
          <button type="button" class="header-button" onClick={onEdit}>
            Изменить
          </button>
        }
      />
      <div class="page">
        <section class="op-hero">
          <span class={`op-hero-amount num ${op.kind}`}>{signedAmount(op)}</span>
          <span class="op-hero-category">
            <CategoryBadge category={op.category} size={32} />
            <span>{op.category.name}</span>
          </span>
          <span class="op-hero-desc">{op.description}</span>
          <span class="op-hero-date">{dayLabel(op.date, ledger.today())}</span>
        </section>
        {isRefund && op.refundOf && (
          <a class="refund-row" href={`#/op/${op.refundOf}`}>
            <RefundIcon />
            <span class="grow-text">Исходный расход: {op.description}</span>
          </a>
        )}
        {info && <RefundsList ledger={ledger} info={info} onOpenForm={() => setRefundOpen(true)} />}
      </div>
      <button type="button" class="delete-row" onClick={() => setDeleteOpen(true)}>
        Удалить операцию
      </button>
      {refundOpen && info && <RefundForm ledger={ledger} op={op} info={info} onDone={() => setRefundOpen(false)} />}
      {deleteOpen && <DeleteSheet op={op} onClose={() => setDeleteOpen(false)} onConfirm={() => void remove(ledger, op)} />}
    </>
  )
}

const EditForm = ({ ledger, op, onDone }: { ledger: Ledger; op: OperationView; onDone: () => void }) => {
  const [amount, setAmount] = useState(amountText(op.amount))
  const [description, setDescription] = useState(op.description)
  const [categoryId, setCategoryId] = useState(op.category.id)
  const [date, setDate] = useState(op.date)
  const [error, setError] = useState<string | null>(null)
  const isRefund = op.kind === "refund"
  const categoryKind = op.kind === "income" ? "income" : "expense"
  const categoryName = () => ledger.categories(categoryKind).find((c) => c.id === categoryId)?.name ?? ""

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
    onDone()
  }

  return (
    <>
      <Header
        title={isRefund ? "Возврат" : "Операция"}
        leading={
          <button type="button" class="header-button" onClick={onDone}>
            Отменить
          </button>
        }
        trailing={
          <button type="button" class="header-button" onClick={() => void save()}>
            Готово
          </button>
        }
      />
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
        {isRefund && (
          <p class="hint">
            Возврат по расходу «{op.description}» · {op.category.name}
          </p>
        )}
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
    </>
  )
}

export const OperationScreen = ({ ledger, id }: { ledger: Ledger; id: string }) => {
  useLedgerVersion(ledger)
  const [mode, setMode] = useState<"view" | "edit">("view")
  // при переходе на другую операцию (например, со ссылки исходного расхода) всегда открывается просмотр
  useEffect(() => setMode("view"), [id])
  const op = ledger.operation(id)

  if (!op) {
    return (
      <div class="screen column">
        <Header title="Операция" />
        <div class="empty">Операция удалена</div>
      </div>
    )
  }

  return (
    <SwipeBack onBack={() => goBack("/")}>
      <div class="screen column">
        {mode === "view" ? (
          <ViewCard ledger={ledger} op={op} onEdit={() => setMode("edit")} />
        ) : (
          <EditForm key={`${op.id}:${op.updatedAt}`} ledger={ledger} op={op} onDone={() => setMode("view")} />
        )}
      </div>
    </SwipeBack>
  )
}
