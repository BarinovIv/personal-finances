import type { ComponentChildren } from "preact"
import type { JSX } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"

/** Крупный заголовок экрана, сжимающийся при прокрутке; сам экран прокручивается внутри. */
export const LargeTitle = ({
  title,
  actions,
  children,
  onTouchStart,
  onTouchEnd
}: {
  title: string
  actions?: ComponentChildren
  children: ComponentChildren
  /** Для свайпа по содержимому экрана (например, листания периодов на дашборде). */
  onTouchStart?: JSX.TouchEventHandler<HTMLDivElement>
  onTouchEnd?: JSX.TouchEventHandler<HTMLDivElement>
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setCollapsed(el.scrollTop > 24)
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div class="screen" ref={scrollRef}>
      <header class={`large-title-bar${collapsed ? " collapsed" : ""}`}>
        <div class="page-head">
          <h1>{title}</h1>
          {actions}
        </div>
      </header>
      <div class="page" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {children}
      </div>
    </div>
  )
}
