import { formatMoney, isOutflow } from "@fin/domain"
import type { CategoryView, OperationView } from "@fin/ledger"
import { memo } from "preact/compat"
import { OperationBadge, operationSubtitle, operationTitle } from "./OperationBadge"
import { RefundIcon, RepeatIcon } from "../icons"
import { QuickDeleteButton, SwipeDeleteButton, useSwipeDelete } from "./SwipeDelete"

/** «−1 500 ₽» для денег, которые ушли (расход, «Отложено», «Одолжил», «Я вернул»), иначе «+1 500 ₽». */
export const signedAmount = (op: Pick<OperationView, "kind" | "amount">) =>
  formatMoney(op.amount, { sign: isOutflow(op.kind) ? "−" : "+" })

interface OperationRowProps {
  op: OperationView
  sub?: string
  onDelete?: (op: OperationView) => void
  leaving?: boolean
}

/**
 * Строка операции. `onDelete`, если задан, включает свайп влево (тянет за пальцем) и
 * постоянную кнопку «Удалить» — доступную и без жеста, с компьютера. `leaving` проигрывает
 * анимацию исчезновения, не убирая строку из списка сразу (даёт время на «Отменить»).
 */
const OperationRowView = ({ op, sub, onDelete, leaving }: OperationRowProps) => {
  const swipe = useSwipeDelete(Boolean(onDelete))
  const label = `Удалить: ${operationTitle(op)}`

  return (
    <div class={`op-row-wrap${leaving ? " leaving" : ""}`}>
      {/* красная кнопка видна, только пока строка сдвинута — иначе просвечивает в скруглённом углу карточки */}
      <div class={`op-row-swipe${swipe.revealing ? " revealing" : ""}`}>
        {onDelete && <SwipeDeleteButton label={label} onDelete={() => onDelete(op)} />}
        <a class="op-row" href={`#/op/${op.id}`} style={swipe.style} {...swipe.handlers}>
          <OperationBadge op={op} size={40} />
          <span class="op-main">
            <span class="op-desc">
              {op.kind === "refund" && <RefundIcon label="Возврат" />}
              <span>{operationTitle(op)}</span>
              {op.recurringId && <RepeatIcon label="Регулярная операция" />}
            </span>
            <span class="op-sub">{sub ?? operationSubtitle(op)}</span>
          </span>
          <span class={`op-amount num ${op.kind}`}>{signedAmount(op)}</span>
        </a>
      </div>
      {onDelete && <QuickDeleteButton label={label} onDelete={() => onDelete(op)} />}
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
    prev.sub === next.sub && prev.leaving === next.leaving && prev.onDelete === next.onDelete && sameOperation(prev.op, next.op)
)
