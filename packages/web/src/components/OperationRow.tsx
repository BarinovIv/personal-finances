import { formatMoney, isOutflow } from "@fin/domain"
import type { CategoryView, OperationView } from "@fin/ledger"
import type { JSX } from "preact"
import { memo } from "preact/compat"
import { useRef, useState } from "preact/hooks"
import { OperationBadge, operationSubtitle, operationTitle } from "./OperationBadge"
import { RefundIcon, RepeatIcon, TrashIcon } from "../icons"

/** «−1 500 ₽» для денег, которые ушли (расход, «Отложено», «Одолжил», «Я вернул»), иначе «+1 500 ₽». */
export const signedAmount = (op: Pick<OperationView, "kind" | "amount">) =>
  formatMoney(op.amount, { sign: isOutflow(op.kind) ? "−" : "+" })

const REVEAL = 84

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
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const open = useRef(false)
  const startX = useRef<number | null>(null)
  const baseX = useRef(0)

  const onPointerDown = (e: JSX.TargetedPointerEvent<HTMLAnchorElement>) => {
    if (!onDelete) return
    e.currentTarget.setPointerCapture(e.pointerId)
    startX.current = e.clientX
    baseX.current = open.current ? -REVEAL : 0
    setDragging(true)
  }
  const onPointerMove = (e: JSX.TargetedPointerEvent<HTMLAnchorElement>) => {
    if (!onDelete || startX.current === null) return
    const delta = e.clientX - startX.current
    setDragX(Math.min(0, Math.max(-REVEAL - 24, baseX.current + delta)))
  }
  const endDrag = () => {
    if (!onDelete || startX.current === null) return
    startX.current = null
    setDragging(false)
    open.current = dragX < -REVEAL / 2
    setDragX(open.current ? -REVEAL : 0)
  }

  return (
    <div class={`op-row-wrap${leaving ? " leaving" : ""}`}>
      {/* красная кнопка видна, только пока строка сдвинута — иначе просвечивает в скруглённом углу карточки */}
      <div class={`op-row-swipe${dragX !== 0 ? " revealing" : ""}`}>
        {onDelete && (
          <button type="button" class="op-row-delete" aria-label={`Удалить: ${operationTitle(op)}`} onClick={() => onDelete(op)} tabIndex={-1}>
            <TrashIcon size={20} />
            <span>Удалить</span>
          </button>
        )}
        <a
          class="op-row"
          href={`#/op/${op.id}`}
          style={onDelete ? { transform: `translateX(${dragX}px)`, transition: dragging ? "none" : undefined } : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
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
      {onDelete && (
        <button type="button" class="op-row-quick-delete" aria-label={`Удалить: ${operationTitle(op)}`} onClick={() => onDelete(op)}>
          <TrashIcon />
        </button>
      )}
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
