import { formatMoney, isOutflow } from "@fin/domain"
import type { CategoryView, OperationView } from "@fin/ledger"
import { memo } from "preact/compat"
import { OperationBadge, operationSubtitle, operationTitle } from "./OperationBadge"
import { CheckIcon, CloseIcon, RefundIcon, RepeatIcon, SfSymbol } from "../icons"
import { QuickDeleteButton, SwipeDeleteButton, useSwipeDelete } from "./SwipeDelete"
import { useRecurringHighlight } from "./helpers"
import type { OperationRowProps } from "./types"

/** «−1 500 ₽» для денег, которые ушли (расход, «Отложено», «Одолжил», «Я вернул»), иначе «+1 500 ₽». */
export const signedAmount = (op: Pick<OperationView, "kind" | "amount">) =>
  formatMoney(op.amount, { sign: isOutflow(op.kind) ? "−" : "+" })

/**
 * Строка операции. `onDelete`, если задан, включает свайп влево (тянет за пальцем) и
 * постоянную кнопку «Удалить» — доступную и без жеста, с компьютера. `leaving` проигрывает
 * анимацию исчезновения, не убирая строку из списка сразу (даёт время на «Отменить»).
 */
const OperationRowView = (props: OperationRowProps) => {
  const { op, sub, onDelete, onConfirm, onEditAmount, leaving } = props
  const { row, highlight } = useRecurringHighlight(props)
  const swipe = useSwipeDelete(Boolean(onDelete))
  const label = `Удалить: ${operationTitle(op)}`
  const pending = Boolean(op.recurringId && op.pending)

  return (
    <div ref={row} class={`op-row-wrap${leaving ? " leaving" : ""}${pending ? " pending" : ""}${highlight ? " recurring-new" : ""}`}>
      {/* красная кнопка видна, только пока строка сдвинута — иначе просвечивает в скруглённом углу карточки */}
      <div class={`op-row-swipe${swipe.revealing ? " revealing" : ""}`}>
        {onDelete && <SwipeDeleteButton label={label} onDelete={() => onDelete(op)} />}
        <div class="op-row-content" style={swipe.style}>
          <a
            class="op-row"
            href={`#/op/${op.id}`}
            {...swipe.handlers}
            onClick={(event) => {
              if (op.recurringId && onEditAmount && !event.defaultPrevented) {
                event.preventDefault()
                onEditAmount(op)
              }
            }}
          >
            <OperationBadge op={op} size={40} />
            <span class="op-main">
              <span class="op-desc">
                {op.kind === "refund" && <RefundIcon label="Возврат" />}
                <span>{operationTitle(op)}</span>
                {op.recurringId && <RepeatIcon label="Регулярная операция" />}
              </span>
              <span class="op-sub">{pending ? "Ожидает подтверждения · " : ""}{sub ?? operationSubtitle(op)}</span>
            </span>
            {!(op.recurringId && onEditAmount) && <span class={`op-amount num ${op.kind}`}>{signedAmount(op)}</span>}
          </a>
          {op.recurringId && onEditAmount && (
            <div class="op-recurring-side">
              <span class={`op-amount num ${op.kind}`}>{signedAmount(op)}</span>
              <div class="op-recurring-actions">
                {pending && onConfirm && (
                  <button type="button" class="op-recurring-action confirm" aria-label={`Подтвердить: ${operationTitle(op)}`} onClick={() => onConfirm(op)}>
                    <CheckIcon size={18} />
                  </button>
                )}
                {pending && onDelete && (
                  <button type="button" class="op-recurring-action skip" aria-label={`Пропустить в этом месяце: ${operationTitle(op)}`} onClick={() => onDelete(op)}>
                    <CloseIcon size={18} />
                  </button>
                )}
                <button type="button" class="op-recurring-action" aria-label={`Изменить сумму: ${operationTitle(op)}`} onClick={() => onEditAmount(op)}>
                  <SfSymbol name="square_pencil_fill" size={19} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {onDelete && !pending && <QuickDeleteButton label={label} onDelete={() => onDelete(op)} />}
    </div>
  )
}

const sameCategory = (a: CategoryView | null, b: CategoryView | null) =>
  a === b || (a !== null && b !== null && a.id === b.id && a.name === b.name && a.color === b.color && a.icon === b.icon)

/** Совпадает ли всё, что строка показывает. Журнал на каждый запрос отдаёт новые объекты, поэтому сравниваем по значению. */
const sameOperation = (a: OperationView, b: OperationView) =>
  a === b ||
  (a.id === b.id &&
    a.kind === b.kind &&
    a.amount === b.amount &&
    a.description === b.description &&
    a.recurringId === b.recurringId &&
    a.pending === b.pending &&
    a.date === b.date &&
    a.person === b.person &&
    a.goalId === b.goalId &&
    a.goalName === b.goalName &&
    sameCategory(a.category, b.category))

/**
 * Строка перерисовывается, только если изменилось то, что она показывает: набор в строке ввода,
 * открытие поиска или удаление соседней строки её не трогают.
 */
export const OperationRow = memo(
  OperationRowView,
  (prev, next) =>
    prev.sub === next.sub && prev.leaving === next.leaving && prev.onDelete === next.onDelete &&
    prev.onConfirm === next.onConfirm && prev.onEditAmount === next.onEditAmount &&
    prev.hasSeen === next.hasSeen && prev.markSeen === next.markSeen && sameOperation(prev.op, next.op)
)
