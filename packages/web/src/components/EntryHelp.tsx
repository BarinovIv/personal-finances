import { useEffect, useRef } from "preact/hooks"
import { Sheet } from "./Sheet"

export const EntryHelp = ({ open, onOpen, onClose }: { open: boolean; onOpen: () => void; onClose: () => void }) => {
  const trigger = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    content.current?.focus({ preventScroll: true })
    return () => trigger.current?.focus({ preventScroll: true })
  }, [open])

  return (
    <>
      <button ref={trigger} type="button" class="entry-help-button" aria-haspopup="dialog" aria-expanded={open} onClick={onOpen}>
        Как вводить?
      </button>
      {open && (
        <Sheet label="Как вводить" onClose={onClose}>
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
              <div class="sheet-title">Как вводить</div>
              <dl>
                <dt>Несколько операций</dt>
                <dd><b>шаурма 150 шашлык 200</b> — или через запятую / точку с запятой.</dd>
                <dt>Доход</dt>
                <dd><b>+зарплата 95к</b> — "+" перед каждым доходом.</dd>
                <dt>Суммы</dt>
                <dd>
                  <b>2к</b> = 2 000 ₽; <b>1,5к</b> = 1 500 ₽. Также: k, т, тыс, тыс.
                  Копейки: <b>99,90</b> или <b>99.90</b>.
                </dd>
                <dt>Дата</dt>
                <dd>
                  <b>вчера такси 450</b> · <b>позавчера кино 800</b>.
                  Без даты — сегодня; дата в начале — общая, если у операции нет своей.
                </dd>
                <dt>Долги и возвраты</dt>
                <dd>
                  "Одолжил" / "Занял" — в <a href="#/settings/debts" onClick={onClose}>"Долгах"</a>, погашение — в карточке долга.
                  Возврат покупки — "Возврат" в карточке расхода.
                </dd>
                <dt>Цели</dt>
                <dd>"Отложить" / "Снять" — в карточке <a href="#/settings/goals" onClick={onClose}>цели</a>.</dd>
              </dl>
              <button type="button" class="secondary-button large" onClick={close}>Понятно</button>
            </div>
          )}
        </Sheet>
      )}
    </>
  )
}
