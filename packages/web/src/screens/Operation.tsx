import { formatDecimal, formatMoney, isMovement, parseMoney } from "@fin/domain"
import { dayLabel, type Ledger, type OperationView, type RefundProblem, type RefundsInfo, type UpdateProblem } from "@fin/ledger"
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks"
import { CategoryBadge } from "../components/CategoryBadge"
import { CategoryGrid } from "../components/CategoryGrid"
import { Header } from "../components/Header"
import { kindLabel, OperationBadge, operationTitle } from "../components/OperationBadge"
import { signedAmount } from "../components/OperationRow"
import { Sheet } from "../components/Sheet"
import { SwipeBack } from "../components/SwipeBack"
import { CheckIcon, CloseIcon, EditIcon, ForwardIcon, RefundIcon, RepeatIcon, TrashIcon } from "../icons"
import { canNavigate, goBack, setNavigationGuard, useLedgerVersion } from "../state"
import { limitNotes, showToast } from "../toast"
import { DebtRepayments, isDebtOperation } from "./Debt"
import { RecurringForm } from "./Recurring"

const problemText: Record<UpdateProblem, string> = {
  "not-found": "Операция уже удалена.",
  "bad-amount": "Проверьте сумму.",
  "no-description": "Добавьте описание.",
  "bad-category": "Выберите категорию.",
  "below-refunds": "Сумма меньше уже оформленных возвратов.",
  "below-repayments": "Сумма меньше уже погашенного.",
  "no-person": "Укажите, кто."
}

const amountText = (kopecks: number) => formatDecimal(kopecks).replace(/,00$/, "")

const refundProblemText: Record<RefundProblem, string> = {
  "not-refundable": "Возврат оформляется только по расходу.",
  "bad-amount": "Проверьте сумму возврата.",
  "too-much": "Нельзя вернуть больше, чем потрачено."
}

const deletedText = operationTitle

/** Заголовок экрана операции. */
const screenTitle = (op: OperationView) =>
  op.kind === "refund" ? "Возврат" : isMovement(op.kind) ? kindLabel(op.kind) : "Операция"

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
        <section class="section">
          <h2 class="section-header">Возвраты</h2>
          <div class="card-list">
            {info.items.map((r) => (
              <a class="row row-button" href={`#/op/${r.id}`} key={r.id}>
                <RefundIcon size={18} />
                <span class="row-main">
                  <span class="row-title">{dayLabel(r.date, today)}</span>
                </span>
                <span class="num refund-amount">+{formatMoney(r.amount)}</span>
                <span class="row-chevron">
                  <ForwardIcon size={16} />
                </span>
              </a>
            ))}
          </div>
          <p class="section-footer">
            {info.remaining > 0
              ? `Итого потрачено с учётом возвратов: ${formatMoney(info.remaining)}`
              : "Деньги вернули полностью"}
          </p>
        </section>
      )}
      {info.remaining > 0 && (
        <div class="card-list">
          <button type="button" class="row row-button action-row" onClick={onOpenForm}>
            <RefundIcon size={18} />
            <span>Оформить возврат</span>
          </button>
        </div>
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

  const submit = async (close: () => void) => {
    const kopecks = parseMoney(amount)
    if (kopecks === null) return setError(refundProblemText["bad-amount"])
    const result = await ledger.addRefund(op.id, { amount: kopecks, date })
    if (!result.ok) return setError(refundProblemText[result.problem])
    close()
    showToast({ text: `Возврат ${formatMoney(kopecks)} оформлен`, action: { label: "Отменить", run: () => result.undo() } })
  }

  return (
    <Sheet label="Возврат денег" onClose={onDone}>
      {(close) => (
        <section class="sheet-form">
          <div class="sheet-title">Возврат денег</div>
          <div class="card-list">
            <label class="row input-row">
              <span class="row-label">Сумма, ₽</span>
              <input
                id="op-refund"
                class="row-input num"
                type="text"
                inputMode="decimal"
                value={amount}
                onInput={(e) => setAmount(e.currentTarget.value)}
              />
            </label>
            <label class="row input-row">
              <span class="row-label">Дата</span>
              <input
                id="op-refund-date"
                class="row-input"
                type="date"
                value={date}
                max={today}
                onChange={(e) => e.currentTarget.value && setDate(e.currentTarget.value)}
              />
            </label>
          </div>
          <span class="hint">
            Можно вернуть часть суммы. Расходы на «{op.category?.name}» уменьшатся в периоде даты возврата, в доходы возврат
            не попадёт.
          </span>
          {error && <div class="hint error">{error}</div>}
          <div class="actions-row">
            <button type="button" class="secondary-button grow" onClick={close}>
              Отмена
            </button>
            <button type="button" class="accent-button grow" onClick={() => void submit(close)}>
              Оформить
            </button>
          </div>
        </section>
      )}
    </Sheet>
  )
}

/** Подтверждение удаления — как action sheet в iOS: разрушительное действие и отдельная «Отмена». */
const DeleteSheet = ({ op, onConfirm, onClose }: { op: OperationView; onConfirm: () => void; onClose: () => void }) => (
  <Sheet label="Удаление операции" onClose={onClose}>
    {(close) => (
      <div class="sheet-form">
        <div class="sheet-title">Удалить операцию?</div>
        <p class="hint center">
          «{deletedText(op)}» · {formatMoney(op.amount)}
        </p>
        <div class="stacked-actions">
          <button type="button" class="secondary-button danger-button" onClick={onConfirm}>
            Удалить
          </button>
          <button type="button" class="secondary-button" onClick={close}>
            Отмена
          </button>
        </div>
      </div>
    )}
  </Sheet>
)

const remove = async (ledger: Ledger, op: OperationView) => {
  const undo = await ledger.deleteOperation(op.id)
  goBack("/")
  showToast({ text: `Удалено: ${deletedText(op)}`, action: { label: "Отменить", run: () => undo() } })
}

interface CardDraft {
  amount: string
  description: string
  categoryId: string
  date: string
}

interface CardEditor {
  draft: CardDraft
  change: (field: keyof CardDraft, value: string) => void
  save: () => void
  saving: boolean
  dirty: boolean
  error: string | null
}

const ViewCard = ({ ledger, op, onEdit, editor }: { ledger: Ledger; op: OperationView; onEdit?: () => void; editor?: CardEditor }) => {
  const [refundOpen, setRefundOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [recurringOpen, setRecurringOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const isRefund = op.kind === "refund"
  const movement = isMovement(op.kind)
  const info = op.kind === "expense" ? ledger.refunds(op.id) : undefined
  const category = editor ? ledger.categories(op.kind === "income" ? "income" : "expense").find((c) => c.id === editor.draft.categoryId) : op.category

  return (
    <>
      <Header
        title={screenTitle(op)}
        trailing={
          editor ? (
            <button type="button" class="glass-button prominent" aria-label="Сохранить изменения" disabled={editor.saving || !editor.dirty} onClick={editor.save}>
              <CheckIcon size={20} />
            </button>
          ) : (
            <button type="button" class="glass-button text" onClick={onEdit}>Изменить</button>
          )
        }
      />
      <div class="page">
        <section class="op-hero">
          <OperationBadge op={editor ? { ...op, category: category ?? null } : op} size={64} />
          {editor ? (
            <>
              <label class={`op-hero-amount op-inline-amount num ${op.kind}`}>
                <span aria-hidden="true">{op.kind === "income" ? "+" : "−"}</span>
                <input id="op-amount" type="text" inputMode="decimal" aria-label="Сумма, ₽" disabled={editor.saving}
                  style={{ width: `${Math.max(1, editor.draft.amount.length) + 0.3}ch` }}
                  value={editor.draft.amount} onInput={(e) => editor.change("amount", e.currentTarget.value)} />
                <span aria-hidden="true">₽</span>
                <span class="op-edit-hint" aria-hidden="true"><EditIcon /></span>
              </label>
              <label class="op-inline-description-field">
                <input id="op-desc" class="op-hero-desc op-inline-description" type="text" aria-label="Описание" disabled={editor.saving}
                  style={{ width: `${Math.max(6, [...editor.draft.description].length)}ch` }}
                  value={editor.draft.description} onInput={(e) => editor.change("description", e.currentTarget.value)} />
                <span class="op-edit-hint" aria-hidden="true"><EditIcon /></span>
              </label>
            </>
          ) : (
            <><span class={`op-hero-amount num ${op.kind}`}>{signedAmount(op)}</span><span class="op-hero-desc">{operationTitle(op)}</span></>
          )}
        </section>
        <div class="card-list">
          {editor ? (
            <button type="button" class="row row-button info-row" aria-label="Выбрать категорию" disabled={editor.saving} onClick={() => setCategoryOpen(true)}>
              <span class="row-label">Категория</span>
              <span class="row-value">{category && <CategoryBadge category={category} size={22} />}{category?.name ?? "Выберите"}</span>
              <span class="row-chevron"><ForwardIcon size={16} /></span>
            </button>
          ) : op.category && (
            <div class="row info-row">
              <span class="row-label">Категория</span>
              <span class="row-value">
                <CategoryBadge category={op.category} size={22} />
                {op.category.name}
              </span>
            </div>
          )}
          {movement && (
            <div class="row info-row">
              <span class="row-label">Вид</span>
              <span class="row-value">{kindLabel(op.kind)}</span>
            </div>
          )}
          {op.person && (
            <div class="row info-row">
              <span class="row-label">Кто</span>
              <span class="row-value">{op.person}</span>
            </div>
          )}
          {movement && op.description && (
            <div class="row info-row">
              <span class="row-label">Описание</span>
              <span class="row-value">{op.description}</span>
            </div>
          )}
          {editor ? (
            <label class="row input-row info-row">
              <span class="row-label">Дата</span>
              <input id="op-date" class="row-input op-inline-date" type="date" aria-label="Дата" max={ledger.today()} disabled={editor.saving}
                value={editor.draft.date} onInput={(e) => editor.change("date", e.currentTarget.value)} />
            </label>
          ) : <div class="row info-row">
            <span class="row-label">Дата</span>
            <span class="row-value">{dayLabel(op.date, ledger.today())}</span>
          </div>}
          {isRefund && op.refundOf && (
            <a class="row row-button info-row" href={`#/op/${op.refundOf}`}>
              <span class="row-label">Исходный расход</span>
              <span class="row-value">{op.description}</span>
              <span class="row-chevron">
                <ForwardIcon size={16} />
              </span>
            </a>
          )}
          {op.goalId && (
            <a class="row row-button info-row" href={`#/goal/${encodeURIComponent(op.goalId)}`}>
              <span class="row-label">Цель</span>
              <span class="row-value">{op.goalName ?? "—"}</span>
              <span class="row-chevron">
                <ForwardIcon size={16} />
              </span>
            </a>
          )}
          {op.repaymentOf && (
            <a class="row row-button info-row" href={`#/op/${op.repaymentOf}`}>
              <span class="row-label">Долг</span>
              <span class="row-value">{op.person}</span>
              <span class="row-chevron">
                <ForwardIcon size={16} />
              </span>
            </a>
          )}
        </div>
        {editor?.error && <div class="hint error" role="alert">{editor.error}</div>}
        {movement && <p class="section-footer">Не расход и не доход: в дашборд и категории не попадает, но меняет свободные деньги.</p>}
        {info && <RefundsList ledger={ledger} info={info} onOpenForm={() => setRefundOpen(true)} />}
        {isDebtOperation(op) && <DebtRepayments ledger={ledger} debt={op} />}
        <div class="card-list">
          {op.kind === "expense" && !op.recurringId && (
            <button type="button" class="row row-button action-row" onClick={() => setRecurringOpen(true)}>
              <RepeatIcon size={18} />
              <span>Сделать регулярной</span>
            </button>
          )}
          <button type="button" class="row row-button action-row destructive" onClick={() => setDeleteOpen(true)}>
            <TrashIcon size={18} />
            <span>Удалить операцию</span>
          </button>
        </div>
      </div>
      {categoryOpen && editor && (
        <Sheet label="Категория операции" onClose={() => setCategoryOpen(false)}>
          {(close) => <section class="sheet-form">
            <div class="sheet-title">Категория</div>
            <CategoryGrid categories={ledger.categories(op.kind === "income" ? "income" : "expense")} selected={editor.draft.categoryId}
              onPick={(id) => { editor.change("categoryId", id); close() }} />
            <p class="hint">Правки сохранятся после нажатия галочки.</p>
          </section>}
        </Sheet>
      )}
      {refundOpen && info && <RefundForm ledger={ledger} op={op} info={info} onDone={() => setRefundOpen(false)} />}
      {recurringOpen && (
        <Sheet label="Новая регулярная операция" onClose={() => setRecurringOpen(false)}>
          {(close) => (
            <RecurringForm
              ledger={ledger}
              editing={false}
              fixedKind
              close={close}
              initial={{
                kind: "expense",
                description: op.description,
                amount: amountText(op.amount),
                categoryId: op.category?.id ?? "",
                day: String(Number(op.date.slice(8)))
              }}
              onSubmit={async (draft, amount) => {
                const result = await ledger.makeRecurring(op.id, {
                  description: draft.description,
                  amount,
                  categoryId: draft.categoryId,
                  dayOfMonth: Number(draft.day)
                })
                if (result.ok) showToast({
                  text: "Расход стал регулярным",
                  action: { label: "Отменить", run: () => result.undo() }
                })
                return result
              }}
            >
              <span class="hint">Повторения начнутся после сегодня. Уже внесённый расход сохранится.</span>
            </RecurringForm>
          )}
        </Sheet>
      )}
      {deleteOpen && <DeleteSheet op={op} onClose={() => setDeleteOpen(false)} onConfirm={() => void remove(ledger, op)} />}
    </>
  )
}

const cardDraft = (op: OperationView): CardDraft => ({
  amount: amountText(op.amount), description: op.description, categoryId: op.category?.id ?? "", date: op.date
})

const draftChanged = (draft: CardDraft, saved: CardDraft) =>
  draft.amount !== saved.amount || draft.description !== saved.description || draft.categoryId !== saved.categoryId || draft.date !== saved.date

/** Один черновик на карточку; обновление журнала не заменяет внесённые правки. */
const InlineCard = ({ ledger, op }: { ledger: Ledger; op: OperationView }) => {
  const [draft, setDraft] = useState(() => cardDraft(op))
  const baseline = useRef(cardDraft(op))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const dirty = draftChanged(draft, baseline.current)
  const deleted = !ledger.operation(op.id)
  const currentDirty = useRef(dirty)
  currentDirty.current = dirty

  useLayoutEffect(() => {
    if (currentDirty.current || pending.current) return
    baseline.current = cardDraft(op)
    setDraft(baseline.current)
  }, [op.updatedAt, dirty])

  useLayoutEffect(() => {
    const approve = () => !pending.current && (!currentDirty.current || window.confirm('Отбросить несохранённые правки? Нажмите "Отмена", чтобы остаться.'))
    const cleanup = setNavigationGuard(approve)
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!currentDirty.current && !pending.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", beforeUnload)
    return () => { cleanup(); window.removeEventListener("beforeunload", beforeUnload) }
  }, [])

  const save = async () => {
    if (pending.current || !currentDirty.current) return
    const amount = parseMoney(draft.amount)
    if (amount === null) return setError(problemText["bad-amount"])
    if (!draft.date || draft.date > ledger.today()) return setError("Выберите дату не позднее сегодня.")
    pending.current = true
    setSaving(true)
    setError(null)
    try {
      const result = await ledger.updateOperation(op.id, { amount, description: draft.description, categoryId: draft.categoryId, date: draft.date })
      if (!result.ok) return setError(problemText[result.problem])
      const learned = draft.categoryId !== op.category?.id
      const category = ledger.categories(op.kind === "income" ? "income" : "expense").find((c) => c.id === draft.categoryId)
      const saved = ledger.operation(op.id)
      if (saved) {
        baseline.current = cardDraft(saved)
        currentDirty.current = false
        setDraft(baseline.current)
      }
      showToast({
        text: learned ? `Сохранено. Запомню: "${draft.description.trim()}" → ${category?.name ?? ""}` : "Сохранено",
        notes: limitNotes(result.warnings),
        action: { label: "Отменить", run: () => result.undo() }
      })
    } catch {
      setError("Не удалось сохранить. Правки остались в карточке; попробуйте ещё раз.")
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  if (deleted && !dirty) return <><Header title="Операция" /><div class="empty">Операция удалена</div></>

  return <ViewCard ledger={ledger} op={op} editor={{
    draft, dirty, saving, error: error ?? (deleted ? "Операция уже удалена. Несохранённые правки остались в карточке." : null), save: () => void save(),
    change: (field, value) => { if (!pending.current) setDraft((previous) => ({ ...previous, [field]: value })) }
  }} />
}

const EditForm = ({ ledger, op, onDone }: { ledger: Ledger; op: OperationView; onDone: () => void }) => {
  const [amount, setAmount] = useState(amountText(op.amount))
  const [description, setDescription] = useState(op.description)
  const [categoryId, setCategoryId] = useState(op.category?.id ?? "")
  const [person, setPerson] = useState(op.person ?? "")
  const [date, setDate] = useState(op.date)
  const [error, setError] = useState<string | null>(null)
  const isRefund = op.kind === "refund"
  const movement = isMovement(op.kind)
  // у долга человек свой, у погашения — человек долга, его здесь не правят
  const hasPerson = op.kind === "lent" || op.kind === "borrowed"
  const categoryKind = op.kind === "income" ? "income" : "expense"
  const categoryName = () => ledger.categories(categoryKind).find((c) => c.id === categoryId)?.name ?? ""

  const save = async () => {
    const kopecks = parseMoney(amount)
    if (kopecks === null) return setError(problemText["bad-amount"])
    const result = await ledger.updateOperation(
      op.id,
      isRefund
        ? { amount: kopecks, date }
        : movement
          ? { amount: kopecks, description, date, ...(hasPerson ? { person } : {}) }
          : { amount: kopecks, description, categoryId, date }
    )
    if (!result.ok) return setError(problemText[result.problem])
    const learned = !isRefund && !movement && categoryId !== op.category?.id
    showToast({
      text: learned ? `Сохранено. Запомню: «${description.trim()}» → ${categoryName()}` : "Сохранено",
      notes: limitNotes(result.warnings),
      action: { label: "Отменить", run: () => result.undo() }
    })
    onDone()
  }

  return (
    <>
      <Header
        title={screenTitle(op)}
        leading={
          <button type="button" class="glass-button" aria-label="Отменить" onClick={onDone}>
            <CloseIcon size={20} />
          </button>
        }
        trailing={
          <button type="button" class="glass-button prominent" aria-label="Готово" onClick={() => void save()}>
            <CheckIcon size={20} />
          </button>
        }
      />
      <div class="page form">
        <label class="amount-field">
          <input
            id="op-amount"
            class="amount-input num"
            type="text"
            inputMode="decimal"
            aria-label="Сумма, ₽"
            // поле по ширине числа, чтобы «₽» стоял вплотную; ch — ширина цифры
            style={{ width: `${Math.max(1, amount.length) + 0.2}ch` }}
            value={amount}
            onInput={(e) => setAmount(e.currentTarget.value)}
          />
          <span class="amount-currency">₽</span>
        </label>
        <div class="card-list">
          {hasPerson && (
            <label class="row input-row">
              <span class="row-label">Кто</span>
              <input id="op-person" class="row-input" type="text" value={person} onInput={(e) => setPerson(e.currentTarget.value)} />
            </label>
          )}
          {!isRefund && (
            <label class="row input-row">
              <span class="row-label">Описание</span>
              <input
                id="op-desc"
                class="row-input"
                type="text"
                value={description}
                placeholder={movement ? "необязательно" : undefined}
                onInput={(e) => setDescription(e.currentTarget.value)}
              />
            </label>
          )}
          <label class="row input-row">
            <span class="row-label">Дата</span>
            <input
              id="op-date"
              class="row-input"
              type="date"
              value={date}
              max={ledger.today()}
              onChange={(e) => e.currentTarget.value && setDate(e.currentTarget.value)}
            />
          </label>
        </div>
        {!isRefund && !movement && (
          <section class="section">
            <h2 class="section-header">Категория</h2>
            <CategoryGrid categories={ledger.categories(categoryKind)} selected={categoryId} onPick={setCategoryId} />
            {categoryId !== op.category?.id && (
              <p class="section-footer accent">
                Запомню: «{description.trim()}» → {categoryName()}. Следующая такая операция попадёт туда же.
              </p>
            )}
          </section>
        )}
        {isRefund && (
          <p class="section-footer">
            Возврат по расходу «{op.description}» · {op.category?.name}
          </p>
        )}
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
  const retained = useRef<OperationView | null>(null)
  const live = ledger.operation(id)
  if (live) retained.current = live
  // Удаление при обмене не стирает открытый черновик: сохранение объяснит, что записи уже нет.
  const previous = retained.current
  const op = live ?? (previous?.id === id && (previous.kind === "expense" || previous.kind === "income") ? previous : null)

  if (!op) {
    return (
      <div class="screen column">
        <Header title="Операция" />
        <div class="empty">Операция удалена</div>
      </div>
    )
  }

  return (
    <SwipeBack canGoBack={canNavigate} onBack={(options) => goBack("/", { ...options, skipGuard: true })}>
      <div class="screen column">
        {op.kind === "expense" || op.kind === "income" ? (
          <InlineCard key={op.id} ledger={ledger} op={op} />
        ) : mode === "view" ? (
          <ViewCard ledger={ledger} op={op} onEdit={() => setMode("edit")} />
        ) : (
          <EditForm key={`${op.id}:${op.updatedAt}`} ledger={ledger} op={op} onDone={() => setMode("view")} />
        )}
      </div>
    </SwipeBack>
  )
}
