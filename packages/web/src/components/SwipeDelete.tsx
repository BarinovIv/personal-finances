import type { JSX } from "preact"
import { useRef, useState } from "preact/hooks"
import { TrashIcon } from "../icons"
import type { HorizontalPointerGesture } from "./PointerGesture"

/** Насколько строка отъезжает, открывая «Удалить», — ширина красной кнопки `.op-row-delete`. */
const REVEAL = 84
/** Сдвиг пальца, после которого нажатие считается жестом, а не тапом. */
const TAP_SLOP = 6

/**
 * Свайп влево, открывающий «Удалить» под строкой: строка тянется за пальцем и встаёт открытой или закрытой.
 * Обработчики вешаются на то, за что тянут, `style` — на то, что едет. Тап после жеста или по открытой строке
 * её не открывает, а только закрывает строку — `onClickCapture` это и делает.
 */
export const useSwipeDelete = (enabled: boolean) => {
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragXRef = useRef(0)
  const open = useRef(false)
  const startX = useRef<number | null>(null)
  const baseX = useRef(0)
  const moved = useRef(false)
  const swallowClick = useRef(false)

  const gesture: HorizontalPointerGesture = {
    start: (clientX) => {
      if (!enabled) return
      startX.current = clientX
      baseX.current = open.current ? -REVEAL : 0
      moved.current = false
      swallowClick.current = open.current
      setDragging(true)
    },
    move: (clientX) => {
      if (!enabled || startX.current === null) return
      const delta = clientX - startX.current
      if (Math.abs(delta) > TAP_SLOP) moved.current = swallowClick.current = true
      const next = Math.min(0, Math.max(-REVEAL - 24, baseX.current + delta))
      dragXRef.current = next
      setDragX(next)
    },
    end: () => {
      if (!enabled || startX.current === null) return
      startX.current = null
      setDragging(false)
      // тап, а не жест, закрывает строку — в том числе открытую
      open.current = moved.current && dragXRef.current < -REVEAL / 2
      const resting = open.current ? -REVEAL : 0
      dragXRef.current = resting
      setDragX(resting)
    }
  }

  const onPointerDown = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    if (!enabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.start(event.clientX)
  }
  const onPointerMove = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    gesture.move(event.clientX)
  }
  const endDrag = () => gesture.end()
  const onClickCapture = (e: Event) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  return {
    revealing: dragX !== 0,
    gesture,
    handlers: enabled ? { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onClickCapture } : {},
    style: enabled ? { transform: `translateX(${dragX}px)`, transition: dragging ? "none" : undefined } : undefined
  }
}

/** Красная кнопка «Удалить», которую открывает свайп: кладётся рядом с едущей строкой внутри `.op-row-swipe`. */
export const SwipeDeleteButton = ({ label, onDelete }: { label: string; onDelete: () => void }) => (
  <button type="button" class="op-row-delete" aria-label={label} onClick={onDelete} tabIndex={-1}>
    <TrashIcon size={20} />
    <span>Удалить</span>
  </button>
)

/** Та же кнопка без жеста — для компьютера: видна при наведении на строку и в фокусе, на телефоне скрыта. */
export const QuickDeleteButton = ({ label, onDelete }: { label: string; onDelete: () => void }) => (
  <button type="button" class="op-row-quick-delete" aria-label={label} onClick={onDelete}>
    <TrashIcon />
  </button>
)
