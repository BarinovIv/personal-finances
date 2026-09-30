import type { ComponentChildren, RefObject } from "preact"
import { useLayoutEffect, useRef, useState } from "preact/hooks"
import { BackIcon } from "../icons"
import { goBack } from "../state"

/**
 * Прокручен ли ближайший `.screen` дальше `offset` пикселей. По этому шапка включает
 * «край прокрутки» (размытие под собой), а крупный заголовок сворачивается в строку.
 */
export const useScrolledPast = (ref: RefObject<HTMLElement>, offset: number) => {
  const [past, setPast] = useState(false)
  // до отрисовки: экран, вернувшийся к сохранённой прокрутке, сразу показывает свёрнутую шапку
  useLayoutEffect(() => {
    const el = ref.current?.closest<HTMLElement>(".screen") ?? ref.current
    if (!el) return
    const onScroll = () => setPast(el.scrollTop > offset)
    onScroll()
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [offset])
  return past
}

/**
 * Шапка вложенного экрана в стиле iOS 26: круглая стеклянная кнопка «Назад» слева, заголовок по центру.
 * «Назад» возвращает туда, откуда пришли (реальная история браузера), а не всегда на `back` —
 * тот используется только как запасной путь, если истории ещё нет.
 * `leading`/`trailing` заменяют стороны шапки целиком (например, «Отменить» / «Готово» в карточке операции).
 */
export const Header = ({
  title,
  back = "#/",
  leading,
  trailing
}: {
  title: string
  back?: string
  leading?: ComponentChildren
  trailing?: ComponentChildren
}) => {
  const ref = useRef<HTMLElement>(null)
  const scrolled = useScrolledPast(ref, 4)
  return (
    <header ref={ref} class={`nav-bar${scrolled ? " scrolled" : ""}`}>
      <div class="nav-bar-side">
        {leading ?? (
          <a
            href={back}
            class="glass-button"
            aria-label="Назад"
            onClick={(e) => {
              e.preventDefault()
              goBack(back.replace(/^#/, "") || "/")
            }}
          >
            <BackIcon size={22} />
          </a>
        )}
      </div>
      <span class="nav-bar-title visible">{title}</span>
      <div class="nav-bar-side trailing">{trailing}</div>
    </header>
  )
}
