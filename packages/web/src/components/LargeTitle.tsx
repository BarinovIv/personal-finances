import type { ComponentChildren } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"

/** Крупный заголовок экрана, сжимающийся при прокрутке; сам экран прокручивается внутри. */
export const LargeTitle = ({
  title,
  actions,
  children
}: {
  title: string
  actions?: ComponentChildren
  children: ComponentChildren
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
      <div class="page">{children}</div>
    </div>
  )
}
