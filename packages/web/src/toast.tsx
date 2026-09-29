import { useEffect, useState } from "preact/hooks"

export interface Toast {
  readonly text: string
  readonly action?: { readonly label: string; readonly run: () => void }
}

let current: Toast | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<(toast: Toast | null) => void>()

const set = (toast: Toast | null) => {
  current = toast
  for (const l of listeners) l(toast)
}

/** Показать сообщение внизу экрана на `ms` миллисекунд. */
export const showToast = (toast: Toast, ms = 5000) => {
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
      <span>{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.run()
            clearTimeout(timer)
            set(null)
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}
