import type { JSX } from "preact"
import { useEffect, useState } from "preact/hooks"
import { pointerGesture, type HorizontalPointerGesture, type PointerGesture } from "./PointerGesture"

/** Как строка сдвинута во время перетаскивания: своя — за пальцем, соседние — уступают место. */
export interface RowDrag {
  readonly shift: number
  readonly lifted: boolean
  readonly onGripDown: (
    event: JSX.TargetedPointerEvent<HTMLSpanElement>,
    horizontalGesture: HorizontalPointerGesture
  ) => void
  readonly onGripKey: (event: JSX.TargetedKeyboardEvent<HTMLSpanElement>) => void
}

const moved = <T>(list: ReadonlyArray<T>, from: number, to: number): Array<T> => {
  const out = [...list]
  const [item] = out.splice(from, 1)
  out.splice(to, 0, item!)
  return out
}

/**
 * Общее поведение списков, которые переставляются за ручку: движение пальцем/мышью,
 * стрелки с клавиатуры и оптимистичный порядок до завершения записи в журнал.
 */
export const useReorderableRows = <T extends { readonly id: string }>(
  fresh: ReadonlyArray<T>,
  save: (ids: ReadonlyArray<string>) => Promise<void>
) => {
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; height: number } | null>(null)
  const [dropped, setDropped] = useState<ReadonlyArray<string> | null>(null)
  const [settling, setSettling] = useState(false)

  const items = dropped
    ? [...fresh].sort((a, b) => (dropped.indexOf(a.id) + 1 || Infinity) - (dropped.indexOf(b.id) + 1 || Infinity))
    : fresh

  const reorder = (from: number, to: number) => {
    if (from === to) return
    const ids = moved(
      items.map((item) => item.id),
      from,
      to
    )
    setDropped(ids)
    void save(ids).finally(() => setDropped(null))
  }

  useEffect(() => {
    if (!settling) return
    const frame = requestAnimationFrame(() => setSettling(false))
    return () => cancelAnimationFrame(frame)
  }, [settling])

  const shiftOf = (index: number) => {
    if (!drag) return 0
    if (index === drag.from) return drag.dy
    if (drag.from < index && index <= drag.to) return -drag.height
    if (drag.to <= index && index < drag.from) return drag.height
    return 0
  }

  const rowDrag = (index: number): RowDrag => ({
    shift: shiftOf(index),
    lifted: drag?.from === index,
    onGripDown: (event, horizontalGesture) => {
      const row = event.currentTarget.closest<HTMLElement>(".reorderable-item")!
      const grip = event.currentTarget
      grip.setPointerCapture(event.pointerId)
      const startX = event.clientX
      const startY = event.clientY
      const height = row.offsetHeight
      let gesture: PointerGesture = "pending"

      const onMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX
        const dy = moveEvent.clientY - startY
        if (gesture === "pending") {
          gesture = pointerGesture(dx, dy)
          if (gesture === "swipe") horizontalGesture.start(startX)
        }
        if (gesture === "swipe") return horizontalGesture.move(moveEvent.clientX)
        if (gesture === "pending") return
        const clamped = Math.max(-index * height, Math.min((items.length - 1 - index) * height, dy))
        setDrag({ from: index, to: index + Math.round(clamped / height), dy: clamped, height })
      }
      const onUp = (upEvent: PointerEvent) => {
        grip.removeEventListener("pointermove", onMove)
        grip.removeEventListener("pointerup", onUp)
        grip.removeEventListener("pointercancel", onUp)
        if (gesture === "swipe") return horizontalGesture.end()
        if (gesture === "pending") return
        const dy = Math.max(
          -index * height,
          Math.min((items.length - 1 - index) * height, upEvent.clientY - startY)
        )
        setSettling(true)
        setDrag(null)
        if (upEvent.type === "pointerup") reorder(index, index + Math.round(dy / height))
      }
      grip.addEventListener("pointermove", onMove)
      grip.addEventListener("pointerup", onUp)
      grip.addEventListener("pointercancel", onUp)
    },
    onGripKey: (event) => {
      const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0
      const to = index + step
      if (!step || to < 0 || to >= items.length) return
      event.preventDefault()
      reorder(index, to)
    }
  })

  return { items, rowDrag, reordering: drag !== null, settling }
}
