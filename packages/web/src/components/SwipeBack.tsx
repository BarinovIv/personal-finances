import type { ComponentChildren } from "preact"
import { useRef } from "preact/hooks"

/** Зона у левого края, с которой начинается жест «назад» — как в iOS. */
const EDGE = 24
/** Доля ширины экрана, после которой отпущенный палец завершает возврат, а не пружинит назад. */
const THRESHOLD = 0.35

/** Кривая, которой iOS двигает экраны навигации и панели. */
const IOS_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Свайп от левого края назад: экран тянется за пальцем, дотянутый до порога — уходит,
 * иначе пружинит на место. На компьютере жест недоступен — там для возврата есть кнопка «Назад».
 */
export const SwipeBack = ({
  onBack,
  canGoBack,
  children,
}: {
  /** `animate: false` — экран уже увёл сам жест, переход назад не должен анимироваться повторно. */
  onBack: (options: { animate: boolean }) => void
  canGoBack?: () => boolean
  children: ComponentChildren
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const tracking = useRef(false)

  const reset = (animate: boolean) => {
    const el = ref.current
    if (!el) return
    el.style.transition = animate && !prefersReducedMotion() ? `transform 0.45s ${IOS_EASE}` : "none"
    el.style.transform = ""
    el.classList.remove("dragging")
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || e.clientX > EDGE) return
    start.current = { x: e.clientX, y: e.clientY }
    tracking.current = false
  }

  const onPointerMove = (e: PointerEvent) => {
    const from = start.current
    const el = ref.current
    if (!from || !el) return
    const dx = e.clientX - from.x
    const dy = e.clientY - from.y
    if (!tracking.current) {
      // вертикальный жест (прокрутка) — не наш случай, отпускаем
      if (Math.abs(dy) > Math.abs(dx) + 10) {
        start.current = null
        return
      }
      if (dx < 4) return
      tracking.current = true
      el.style.transition = "none"
      el.classList.add("dragging")
    }
    if (dx > 0) el.style.transform = `translateX(${dx}px)`
  }

  const onPointerUp = (e: PointerEvent) => {
    const from = start.current
    const el = ref.current
    start.current = null
    if (!from || !el || !tracking.current) return
    tracking.current = false
    const dx = e.clientX - from.x
    const width = el.clientWidth || 1
    if (dx > width * THRESHOLD) {
      if (canGoBack && !canGoBack()) {
        reset(true)
        return
      }
      if (prefersReducedMotion()) {
        onBack({ animate: false })
        return
      }
      el.style.transition = `transform 0.28s ${IOS_EASE}`
      el.style.transform = `translateX(${width}px)`
      window.setTimeout(() => onBack({ animate: false }), 280)
      return
    }
    reset(true)
  }

  return (
    <div
      ref={ref}
      class="swipe-back"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null
        if (tracking.current) {
          tracking.current = false
          reset(true)
        }
      }}
    >
      {children}
    </div>
  )
}
