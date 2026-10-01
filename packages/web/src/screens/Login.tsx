import type { AuthApi, DeviceResult, UserDevice } from "@fin/sync"
import { useEffect, useState } from "preact/hooks"

const messages: Record<string, string> = {
  "invitation-used": "Это приглашение уже использовано. Попросите у владельца новое приглашение.",
  "invitation-expired": "Срок приглашения истёк. Попросите у владельца новое приглашение.",
  "invitation-revoked": "Владелец отозвал приглашение. Попросите новое приглашение.",
  "not-found": "Ссылка не найдена. Попросите у владельца новую ссылку.",
  "invalid-login": "Логин: 3–32 символа, только латинские буквы, цифры, _ и -. Регистр не имеет значения.",
  "login-taken": "Этот логин занят. Выберите другой: 3–32 символа из латиницы, цифр, _ и -.",
  "reset-used": "Эта ссылка уже использована. Попросите у владельца новую ссылку сброса пароля.",
  "reset-expired": "Срок ссылки истёк. Попросите у владельца новую ссылку сброса пароля.",
  "reset-invalid": "Ссылка сброса пароля не найдена. Попросите у владельца новую ссылку.",
  "user-deleted": "Пользователь удалён владельцем.",
  "bad-request": "Проверьте введённые данные. Пароль не должен быть пустым.",
  "offline": "Нет связи с сервером. Попробуйте, когда появится сеть."
}

export const authErrorText = (reason: string) => messages[reason] ?? "Не получилось выполнить действие. Попробуйте ещё раз."

export const LoginScreen = ({ auth, device, link, onSignedIn }: {
  auth: AuthApi
  device: UserDevice
  link: { kind: "invite" | "reset"; token: string } | null
  onSignedIn: (registered: boolean) => void
}) => {
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkReady, setLinkReady] = useState(!link)
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLinkReady(!link)
    setLinkError(null)
    if (link) {
      const load = link.kind === "invite" ? auth.invitation(link.token) : auth.resetLink(link.token)
      void load.then((result) => {
        if (!active) return
        if (result.ok) setLinkReady(true)
        else setLinkError(authErrorText(result.reason))
      })
    }
    return () => { active = false }
  }, [link?.kind, link?.token])

  const submit = async (e: Event) => {
    e.preventDefault()
    if (!password || (link?.kind !== "reset" && !login.trim()) || busy) return
    setBusy(true)
    setError(null)
    try {
      let result: DeviceResult = link?.kind === "invite"
        ? await device.register(link.token, login.trim(), password)
        : link?.kind === "reset"
          ? await device.resetPassword(link.token, password)
          : await device.login(login.trim(), password)
      if (!result.ok && result.reason === "pending-changes") {
        if (window.confirm(`На устройстве ${result.pending} неотправленных изменений другого пользователя. Войти и удалить их?`)) {
          result = await device.acceptUser(result.user, { confirmDiscard: true })
        } else {
          await auth.logout()
          setError("Вход отменён. Данные прежнего пользователя сохранены.")
          return
        }
      }
      if (result.ok) return onSignedIn(link?.kind === "invite")
      setError(result.reason === "wrong-password"
        ? `Неверный логин или пароль. Осталось попыток: ${result.attemptsLeft}.`
        : result.reason === "blocked"
          ? `Слишком много попыток. Попробуйте через ${Math.max(1, Math.ceil(result.retryAfter / 60))} мин.`
          : authErrorText(result.reason))
    } catch {
      setError("Не получилось войти. Попробуйте ещё раз.")
    } finally {
      setBusy(false)
    }
  }

  const reset = link?.kind === "reset"
  const invite = link?.kind === "invite"
  return (
    <form class="login" onSubmit={submit}>
      <div class="login-brand">
        <img class="login-icon" src="/icons/icon-192.png" alt="" width={88} height={88} />
        <h1>{reset ? "Новый пароль" : invite ? "Добро пожаловать" : "Учёт"}</h1>
        <p class="hint">{reset ? "Прежние входы будут закрыты" : "Расходы и доходы — одной строкой"}</p>
      </div>
      {link && !linkReady && !linkError && <p class="hint center" role="status">Проверяю ссылку…</p>}
      {linkError && <p class="hint error center" role="alert">{linkError}</p>}
      {linkReady && <>
        <div class="card-list">
          {!reset && <label class="row input-row">
            <span class="row-label">Логин</span>
            <input id="login" class="row-input" type="text" autocomplete="username" autocapitalize="off"
              spellcheck={false} required minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]{3,32}"
              placeholder="Латиница, цифры, _ и -" value={login} onInput={(e) => setLogin(e.currentTarget.value)} />
          </label>}
          <label class="row input-row">
            <span class="row-label">Пароль</span>
            <input id="password" class="row-input" type="password" required
              autocomplete={link ? "new-password" : "current-password"} placeholder="Обязательно"
              value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
          </label>
        </div>
        {invite && <p class="section-footer">Логин: 3–32 символа из латиницы, цифр, _ и -. Регистр не имеет значения.
          Данные хранятся на сервере владельца. Он технически может видеть их, хотя через приложение учёт каждого пользователя отделён.</p>}
        {error && <div class="hint error center" role="alert">{error}</div>}
        <button type="submit" class="accent-button large" disabled={!password || (!reset && !login.trim()) || busy}>
          {busy ? "Подождите…" : reset ? "Сохранить пароль" : invite ? "Начать учёт" : "Войти"}
        </button>
      </>}
      {!link && <p class="hint center">Забыли пароль? Обратитесь к владельцу приложения — он создаст ссылку для сброса.</p>}
      {link && <a class="text-button center" href="#/">Перейти ко входу</a>}
    </form>
  )
}
