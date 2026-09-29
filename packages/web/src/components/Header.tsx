import type { ComponentChildren } from "preact"
import { BackIcon } from "../icons"
import { goBack } from "../state"

/**
 * Шапка вложенного экрана. «Назад» возвращает туда, откуда пришли (реальная история браузера),
 * а не всегда на `back` — тот используется только как запасной путь, если истории ещё нет.
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
}) => (
  <header class="screen-header">
    <div class="header-side">
      {leading ?? (
        <a
          href={back}
          class="back-link"
          onClick={(e) => {
            e.preventDefault()
            goBack(back.replace(/^#/, "") || "/")
          }}
        >
          <BackIcon />
          <span>Назад</span>
        </a>
      )}
    </div>
    <span class="screen-title">{title}</span>
    <div class="header-side trailing">{trailing}</div>
  </header>
)
