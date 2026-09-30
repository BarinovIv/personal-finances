import type { ComponentChildren, JSX } from "preact"
import { createPortal } from "preact/compat"
import { useEffect, useRef, useState } from "preact/hooks"

/** Сколько длится уход панели вниз — совпадает с `fin-sheet-out` в styles.css. */
const CLOSE_MS = 240
/** Дотянутая вниз дальше этого (или брошенная быстрее `FLING`) панель закрывается. */
const DISMISS_PX = 110
const FLING = 0.6

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Выезжающая снизу панель в стиле iOS 26: парит над краем экрана поверх всего, в том числе таббара,
 * закрывается тапом по подложке, Escape и жестом вниз за «ручку». Уходит с анимацией; чтобы закрыть её так же из содержимого
 * (например, по «Отмена»), передайте детей функцией — она получит `close`.
 */
export const Sheet = ({
  onClose,
  label,
  children
}: {
  onClose: () => void
  label?: string
  children: ComponentChildren | ((close: () => void) => ComponentChildren)
}) => {
  // "drag" — панель уже уезжает за пальцем сама, анимация ухода ей не нужна
  const [closing, setClosing] = useState<false | "animate" | "drag">(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; t: number; dy: number; v: number } | null>(null)

  const close = () => {
    if (closing) return
    if (prefersReducedMotion()) return onClose()
    setClosing("animate")
    window.setTimeout(onClose, CLOSE_MS)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [closing])

  const onPointerDown = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, t: e.timeStamp, dy: 0, v: 0 }
    if (sheetRef.current) sheetRef.current.style.transition = "none"
  }
  const onPointerMove = (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = sheetRef.current
    if (!d || !el) return
    const dy = e.clientY - d.y
    const dt = Math.max(1, e.timeStamp - d.t)
    d.v = (dy - d.dy) / dt
    d.dy = dy
    d.t = e.timeStamp
    // вверх панель лишь чуть подаётся — как резина у iOS
    el.style.transform = `translateY(${dy > 0 ? dy : dy / 6}px)`
  }
  const onPointerUp = () => {
    const d = drag.current
    const el = sheetRef.current
    drag.current = null
    if (!d || !el) return
    if (d.dy > DISMISS_PX || d.v > FLING) {
      el.style.transition = `transform ${CLOSE_MS}ms cubic-bezier(0.3, 0, 0.8, 0.15)`
      el.style.transform = "translateY(110%)"
      setClosing("drag")
      window.setTimeout(onClose, CLOSE_MS)
      return
    }
    el.style.transition = ""
    el.style.transform = ""
  }

  // в body: иначе экран с `isolation: isolate` запирает панель под таббаром
  return createPortal(
    <>
      <div class={`sheet-backdrop${closing ? " closing" : ""}`} onClick={close} />
      <div ref={sheetRef} class={`sheet${closing === "animate" ? " closing" : ""}`} role="dialog" aria-modal="true" aria-label={label}>
        <div
          class="sheet-grabber"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span class="sheet-handle" />
        </div>
        <div class="sheet-body">{typeof children === "function" ? children(close) : children}</div>
      </div>
    </>,
    document.body
  )
}
