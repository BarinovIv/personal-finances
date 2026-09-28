import type { AuthApi } from "@fin/sync"
import { useState } from "preact/hooks"

const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60))

export const LoginScreen = ({ auth, onSignedIn }: { auth: AuthApi; onSignedIn: () => void }) => {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: Event) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    const result = await auth.login(password)
    setBusy(false)
    if (result.ok) return onSignedIn()
    setPassword("")
    setError(
      result.reason === "wrong-password"
        ? `Неверный пароль. Осталось попыток: ${result.attemptsLeft}.`
        : result.reason === "blocked"
          ? `Слишком много попыток. Попробуйте через ${minutes(result.retryAfter)} мин.`
          : result.reason === "offline"
            ? "Нет связи с сервером."
            : "Не получилось войти."
    )
  }

  return (
    <form class="login" onSubmit={submit}>
      <h1>Учёт</h1>
      <label for="password" class="hint">
        Пароль
      </label>
      <input
        id="password"
        class="text-input"
        type="password"
        autocomplete="current-password"
        value={password}
        onInput={(e) => setPassword(e.currentTarget.value)}
      />
      {error && <div class="hint error">{error}</div>}
      <button type="submit" class="primary-button" disabled={!password || busy}>
        Войти
      </button>
    </form>
  )
}
