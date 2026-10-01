import type { AuthApi } from "@fin/sync"
import { useState } from "preact/hooks"
import { authErrorText } from "./Login"

export const PasswordSection = ({ auth }: { auth: AuthApi }) => {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  return <form class="section" onSubmit={async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const result = await auth.changePassword(current, next)
      if (result.ok) {
        setCurrent("")
        setNext("")
        setNote("Пароль изменён.")
      } else setNote(result.reason === "wrong-password" ? "Текущий пароль неверный." : authErrorText(result.reason))
    } finally { setBusy(false) }
  }}>
    <div class="card-list">
      <label class="row input-row"><span class="row-label">Текущий</span>
        <input class="row-input" type="password" aria-label="Текущий пароль" autocomplete="current-password" required
          value={current} onInput={(e) => setCurrent(e.currentTarget.value)} />
      </label>
      <label class="row input-row"><span class="row-label">Новый</span>
        <input class="row-input" type="password" aria-label="Новый пароль" autocomplete="new-password" required
          value={next} onInput={(e) => setNext(e.currentTarget.value)} />
      </label>
    </div>
    <p class="section-footer" role="status">{note ?? "Укажите текущий пароль и придумайте новый."}</p>
    <button type="submit" class="accent-button large" disabled={!current || !next || busy}>{busy ? "Сохраняю…" : "Сменить пароль"}</button>
  </form>
}
