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
  const headingRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
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

  // Одна группа действий работает и у крупного заголовка, и в закреплённой шапке.
  // Полная ширина статуса облака резервируется заранее, включая узкий экран.
  useLayoutEffect(() => {
    if (!active) return
    const screen = scrollRef.current
    const content = headingRef.current
    const buttons = actionsRef.current
    if (!screen || !content || !buttons) return
    const measure = () => {
      screen.style.setProperty("--title-actions-width", `${buttons.getBoundingClientRect().width}px`)
      const target = content.querySelector<HTMLElement>("[data-title-actions-anchor]") ?? content
      const top = target.getBoundingClientRect().top - content.getBoundingClientRect().top
      const center = top + target.getBoundingClientRect().height / 2 + 4
      screen.style.setProperty("--title-actions-offset", `${Math.max(0, center - 24)}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    observer.observe(buttons)
    return () => observer.disconnect()
  }, [active])

  const collapsed = useScrolledPast(scrollRef, 44)
  const scrolled = useScrolledPast(scrollRef, 4)

  return (
    <div class="screen tab-screen" ref={scrollRef}>
      <header class={`nav-bar tab-nav${scrolled ? " scrolled" : ""}${collapsed ? " collapsed" : ""}`}>
        <span class={`nav-bar-title${collapsed ? " visible" : ""}`} aria-hidden={!collapsed}>
          {title}
        </span>
        <div ref={actionsRef} class="nav-bar-side trailing">{actions}</div>
      </header>
      <div class={`large-title${collapsed ? " collapsed" : ""}`} aria-hidden={collapsed} inert={collapsed}>
        <div ref={headingRef} class="large-title-content">{heading ?? <h1>{title}</h1>}</div>
      </div>
      <div class="page" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {children}
      </div>
    </div>
  )
}
