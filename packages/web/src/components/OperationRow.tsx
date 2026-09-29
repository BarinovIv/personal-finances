import { formatMoney } from "@fin/domain"
import type { OperationView } from "@fin/ledger"
import type { JSX } from "preact"
import { useRef, useState } from "preact/hooks"
import { CategoryBadge } from "./CategoryBadge"
import { RefundIcon, RepeatIcon } from "../icons"

export const signedAmount = (op: Pick<OperationView, "kind" | "amount">) =>
  formatMoney(op.amount, { sign: op.kind === "expense" ? "−" : "+" })

const REVEAL = 84

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" />
  </svg>
)

/**
 * Строка операции. `onDelete`, если задан, включает свайп влево (тянет за пальцем) и
 * постоянную кнопку «Удалить» — доступную и без жеста, с компьютера. `leaving` проигрывает
 * анимацию исчезновения, не убирая строку из списка сразу (даёт время на «Отменить»).
 */
export const OperationRow = ({
  op,
  sub,
  onDelete,
  leaving
}: {
  op: OperationView
  sub?: string
  onDelete?: () => void
  leaving?: boolean
}) => {
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
      <div class="op-row-swipe">
        {onDelete && (
          <button type="button" class="op-row-delete" aria-label={`Удалить: ${op.description}`} onClick={onDelete} tabIndex={-1}>
            <TrashIcon />
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
          <CategoryBadge category={op.category} />
          <span class="op-main">
            <span class="op-desc">
              {op.kind === "refund" && <RefundIcon label="Возврат" />}
              <span>{op.kind === "refund" ? `Возврат: ${op.description}` : op.description}</span>
              {op.recurringId && <RepeatIcon label="Регулярная операция" />}
            </span>
            <span class="op-sub">{sub ?? op.category.name + (op.recurringId ? " · регулярная" : "")}</span>
          </span>
          <span class={`op-amount num ${op.kind}`}>{signedAmount(op)}</span>
        </a>
      </div>
      {onDelete && (
        <button type="button" class="op-row-quick-delete" aria-label={`Удалить: ${op.description}`} onClick={onDelete}>
          <TrashIcon />
        </button>
      )}
    </div>
  )
}
