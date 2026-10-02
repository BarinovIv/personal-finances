import { useEffect, useRef } from "preact/hooks"
import { CloseIcon } from "../icons"
import { Sheet } from "./Sheet"

export const EntryHelp = ({ onClose }: { onClose: () => void }) => {
  const content = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement
    content.current?.focus({ preventScroll: true })
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  return (
    <Sheet label="Примеры ввода" onClose={onClose}>
      {(close) => (
        <div
          ref={content}
          class="entry-help"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key !== "Tab") return
            const controls = e.currentTarget.querySelectorAll<HTMLElement>("a[href], button")
            const first = controls[0]!
            const last = controls[controls.length - 1]!
            if (e.shiftKey && (e.target === first || e.target === e.currentTarget)) {
              e.preventDefault()
              last.focus()
            } else if (!e.shiftKey && e.target === last) {
              e.preventDefault()
              first.focus()
            }
          }}
        >
          <div class="entry-help-header">
            <h2>Примеры ввода</h2>
            <button type="button" class="entry-help-close" aria-label="Закрыть подсказку" onClick={close}>
              <CloseIcon size={16} />
            </button>
          </div>
          <dl>
            <dt>Несколько операций</dt>
            <dd>
              <code>шаурма 150 шашлык 200</code>
              <span class="entry-help-note">Можно разделять запятой или точкой с запятой.</span>
            </dd>
            <dt>Калькулятор</dt>
            <dd>
              <code>каршеринг 370 + 550</code> — две операции: 370 ₽ и 550 ₽.
              <span class="entry-help-note"><code>каршеринг 300*3</code> — три операции по 300 ₽.</span>
              <span class="entry-help-note"><code>каршеринг 1000 - 330</code> — 670 ₽; <code>каршеринг 400 / 2</code> — 200 ₽.</span>
              <span class="entry-help-note">Пробелы вокруг знаков необязательны.</span>
            </dd>
            <dt>Доход</dt>
            <dd>
              <code>+зарплата 95к</code>
              <span class="entry-help-note">"+" перед каждым доходом.</span>
            </dd>
            <dt>Суммы</dt>
            <dd>
              <code>2к</code> = 2 000 ₽ · <code>1,5к</code> = 1 500 ₽
              <span class="entry-help-note">Также k, т, тыс, тыс. Копейки: <code>99,90</code> или <code>99.90</code>.</span>
            </dd>
            <dt>Дата</dt>
            <dd>
              <code>вчера такси 450</code> · <code>позавчера кино 800</code>
              <span class="entry-help-note">Без даты — сегодня. Дата в начале — общая, если у операции нет своей.</span>
            </dd>
          </dl>
        </div>
      )}
    </Sheet>
  )
}
