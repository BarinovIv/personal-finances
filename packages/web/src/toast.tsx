import type { LimitWarning } from "@fin/ledger"
import { useLayoutEffect, useRef, useState } from "preact/hooks"

/** Строка под текстом тоста: «warning» — оранжевым, «danger» — красным. */
export interface ToastNote {
  readonly text: string
  readonly tone: "warning" | "danger"
}

export interface Toast {
  readonly text: string
  readonly notes?: ReadonlyArray<ToastNote>
  /** `run` может вернуть итог отмены: `ok: false` — отменить не вышло, об этом скажет новый тост. */
  readonly action?: { readonly label: string; readonly run: () => void | Promise<{ readonly ok: boolean } | void> }
}

/** Предупреждения о лимитах категорий — строками под тостом сохранения: превышение красным, 80% — оранжевым. */
export const limitNotes = (warnings: ReadonlyArray<LimitWarning>): ReadonlyArray<ToastNote> =>
  warnings.map((w) => ({ text: w.text, tone: w.kind === "over" ? "danger" : "warning" }))

interface Message { readonly id: number; readonly toast: Toast }
let deferredUndoFailure = false
const undoFailure: Toast = { text: "Не отменено: запись уже изменилась" }
let nextId = 0
let current: Message | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<(message: Message | null) => void>()

const set = (message: Message | null) => {
  if (!message && deferredUndoFailure) {
    deferredUndoFailure = false
    showToast(undoFailure)
    return
  }
  current = message
  for (const l of listeners) l(message)
}

/** Показать сообщение внизу экрана на `ms` миллисекунд; с предупреждениями — дольше, чтобы их успели прочитать. */
export const showToast = (toast: Toast, ms = toast.notes?.length ? 8000 : 5000) => {
  clearTimeout(timer)
  const message = { id: ++nextId, toast }
  set(message)
  timer = setTimeout(() => { if (current === message) set(null) }, ms)
}

/** Выход сохраняет только картинку сообщения; действие перестаёт быть доступным сразу. */
export const ToastHost = () => {
  const initial = current ? { message: current, leaving: false } : null
  const [displayed, setDisplayed] = useState(initial)
  const displayedRef = useRef(initial)
  const exitTimer = useRef<ReturnType<typeof setTimeout>>()
  useLayoutEffect(() => {
    const update = (message: Message | null) => {
      const display = (next: typeof initial) => {
        displayedRef.current = next
        setDisplayed(next)
      }
      const previous = displayedRef.current
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !previous) {
        clearTimeout(exitTimer.current)
        display(message ? { message, leaving: false } : null)
        return
      }
      if (previous.message === message || previous.leaving) return
      display({ ...previous, leaving: true })
      // Замены во время выхода ждут его завершения; появляется последнее сообщение.
      exitTimer.current = setTimeout(() => display(current ? { message: current, leaving: false } : null), 240)
    }
    listeners.add(update)
    update(current)
    return () => {
      listeners.delete(update)
      clearTimeout(exitTimer.current)
    }
  }, [])
  if (!displayed) return null
  const { message, leaving } = displayed
  const { toast } = message
  const failed = () => {
    if (current) deferredUndoFailure = true
    else showToast(undoFailure)
  }
  return (
    <div key={message.id} class={`toast glass${leaving ? " leaving" : ""}`} role="status" inert={leaving}>
      <span class="toast-body">
        <span>{toast.text}</span>
        {toast.notes?.map((note) => (
          <span class={`toast-note ${note.tone}`}>{note.text}</span>
        ))}
      </span>
      {toast.action && (
        <button
          type="button"
          disabled={leaving}
          onClick={() => {
            if (current !== message) return
            clearTimeout(timer)
            set(null)
            try {
              const outcome = toast.action!.run()
              void outcome?.then((result) => {
                if (result && !result.ok) failed()
              }).catch(failed)
            } catch {
              failed()
            }
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}
