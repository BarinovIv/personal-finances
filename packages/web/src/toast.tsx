import type { LimitWarning } from "@fin/ledger"
import { useEffect, useState } from "preact/hooks"

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

let current: Toast | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<(toast: Toast | null) => void>()

const set = (toast: Toast | null) => {
  current = toast
  for (const l of listeners) l(toast)
}

/** Показать сообщение внизу экрана на `ms` миллисекунд; с предупреждениями — дольше, чтобы их успели прочитать. */
export const showToast = (toast: Toast, ms = toast.notes?.length ? 8000 : 5000) => {
  clearTimeout(timer)
  set(toast)
  timer = setTimeout(() => set(null), ms)
}

export const ToastHost = () => {
  const [toast, setToast] = useState(current)
  useEffect(() => {
    listeners.add(setToast)
    return () => listeners.delete(setToast)
  }, [])
  if (!toast) return null
  return (
    <div class="toast glass" role="status">
      <span class="toast-body">
        <span>{toast.text}</span>
        {toast.notes?.map((note) => (
          <span class={`toast-note ${note.tone}`}>{note.text}</span>
        ))}
      </span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            const outcome = toast.action!.run()
            clearTimeout(timer)
            set(null)
            void outcome?.then((result) => {
              if (result && !result.ok) showToast({ text: "Не отменено: запись уже изменилась" })
            })
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}
