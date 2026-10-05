import type { ComponentChildren } from "preact"
import type { JSX } from "preact"
import { useLayoutEffect, useRef } from "preact/hooks"
import { useScrolledPast } from "./Header"
import { useTabActive } from "../tabActivity"

/**
 * Экран вкладки с крупным заголовком, как в iOS: заголовок уезжает вместе с содержимым,
 * а в шапке проявляется маленький — поверх размытого «края прокрутки».
 * `heading` заменяет крупный заголовок (например, сумма на экране ввода); `actions` — стеклянные кнопки справа.
 */
export const LargeTitle = ({
  title,
  heading,
  actions,
  children,
  onTouchStart,
  onTouchEnd
}: {
  title: string
  heading?: ComponentChildren
  actions?: ComponentChildren
  children: ComponentChildren
  /** Для свайпа по содержимому экрана (например, листания периодов на дашборде). */
  onTouchStart?: JSX.TouchEventHandler<HTMLDivElement>
  onTouchEnd?: JSX.TouchEventHandler<HTMLDivElement>
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollPosition = useRef(0)
  const active = useTabActive()
  // После скрытия восстанавливаем прокрутку до отрисовки и до обновления шапки ниже.
  useLayoutEffect(() => {
    if (!active) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = scrollPosition.current
    const remember = () => { scrollPosition.current = el.scrollTop }
    el.addEventListener("scroll", remember, { passive: true })
    return () => el.removeEventListener("scroll", remember)
  }, [active])

  const collapsed = useScrolledPast(scrollRef, 44)
  const scrolled = useScrolledPast(scrollRef, 4)

  return (
    <div class="screen tab-screen" ref={scrollRef}>
      <header class={`nav-bar${scrolled ? " scrolled" : ""}`}>
        <div class="nav-bar-side" />
        <span class={`nav-bar-title${collapsed ? " visible" : ""}`} aria-hidden={!collapsed}>
          {title}
        </span>
        <div class="nav-bar-side trailing">{actions}</div>
      </header>
      <div class={`large-title${collapsed ? " collapsed" : ""}`}>{heading ?? <h1>{title}</h1>}</div>
      <div class="page" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {children}
      </div>
    </div>
  )
}
