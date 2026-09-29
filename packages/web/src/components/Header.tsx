import { BackIcon } from "../icons"
import { goBack } from "../state"

/**
 * Шапка вложенного экрана. «Назад» возвращает туда, откуда пришли (реальная история браузера),
 * а не всегда на `back` — тот используется только как запасной путь, если истории ещё нет.
 */
export const Header = ({ title, back = "#/" }: { title: string; back?: string }) => (
  <header class="screen-header">
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
    <span class="screen-title">{title}</span>
  </header>
)
