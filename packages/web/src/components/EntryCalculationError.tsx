import { useEffect, useRef } from "preact/hooks"
import { Sheet } from "./Sheet"

export const EntryCalculationError = ({ message, onClose }: { message: string; onClose: () => void }) => {
  const dismiss = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement
    dismiss.current?.focus({ preventScroll: true })
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  return (
    <Sheet label="Ошибка в выражении" onClose={onClose}>
      {(close) => (
        <div class="sheet-form" onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault()
            dismiss.current?.focus({ preventScroll: true })
          }
        }}>
          <h2 class="sheet-title">Ошибка в выражении</h2>
          <div class="hint error">{message}</div>
          <button ref={dismiss} type="button" class="secondary-button" onClick={close}>Понятно</button>
        </div>
      )}
    </Sheet>
  )
}
