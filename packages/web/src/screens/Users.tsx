import type { AuthApi, InvitationInfo, UserInfo } from "@fin/sync"
import { useEffect, useState } from "preact/hooks"
import { authErrorText } from "./Login"

const dateTime = (ms: number, timeZone: string) => new Intl.DateTimeFormat("ru", { dateStyle: "medium", timeStyle: "short", timeZone }).format(ms)

export const UsersSection = ({ auth, timeZone }: { auth: AuthApi; timeZone: string }) => {
  const [users, setUsers] = useState<ReadonlyArray<UserInfo>>([])
  const [invitations, setInvitations] = useState<ReadonlyArray<InvitationInfo>>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const load = async () => {
    const [people, invites] = await Promise.all([auth.users(), auth.invitations()])
    if (people.ok) setUsers(people.value)
    else setNote(authErrorText(people.reason))
    if (invites.ok) setInvitations(invites.value)
    else setNote(authErrorText(invites.reason))
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  const showLink = async (kind: "invite" | "reset", token: string) => {
    const url = `${window.location.origin}/#/${kind}/${encodeURIComponent(token)}`
    setLink(url)
    try {
      await navigator.clipboard.writeText(url)
      setNote("Ссылка скопирована. Передайте её пользователю.")
    } catch {
      setNote("Скопируйте ссылку из поля ниже и передайте пользователю.")
    }
  }

  const create = async () => {
    setBusy(true)
    try {
      const result = await auth.createInvitation()
      if (result.ok) {
        await showLink("invite", result.value.token)
        await load()
      } else setNote(authErrorText(result.reason))
    } finally { setBusy(false) }
  }

  const reset = async (user: UserInfo) => {
    setBusy(true)
    try {
      const result = await auth.createPasswordReset(user.id)
      if (result.ok) await showLink("reset", result.value.token)
      else setNote(authErrorText(result.reason))
    } finally { setBusy(false) }
  }

  const remove = async (user: UserInfo) => {
    if (!window.confirm(`Удалить пользователя «${user.login}»? Его данные и входы будут удалены. Данные некоторое время сохраняются в старых резервных копиях. Логин останется занят.`)) return
    setBusy(true)
    try {
      const result = await auth.deleteUser(user.id)
      if (result.ok) {
        setNote(`Пользователь «${user.login}» удалён.`)
        setLink(null)
        await load()
      } else setNote(authErrorText(result.reason))
    } finally { setBusy(false) }
  }

  return <>
    <section class="section">
      <button class="accent-button large" type="button" disabled={busy} onClick={() => void create()}>Пригласить пользователя</button>
      <p class="section-footer">Приглашение действует 7 дней, ссылка сброса пароля — 24 часа. Каждая ссылка используется один раз.</p>
      {link && <label class="card-list shared-link">
        <span class="visually-hidden">Созданная ссылка</span>
        <input type="url" aria-label="Созданная ссылка" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
      </label>}
      {note && <p class="section-footer" role="status">{note}</p>}
    </section>
    <section class="section">
      <h2 class="section-header">Пользователи</h2>
      {loading && <p class="section-footer">Загружаю…</p>}
      <div class="card-list">
        {users.map((user) => <div class="row user-row" key={user.id}>
          <div class="row-main">
            <span class="row-title">{user.login}{user.isOwner ? " · владелец" : ""}</span>
            <span class="row-sub">Зарегистрирован: {dateTime(user.createdAt, timeZone)}</span>
            <span class="row-sub">Последняя активность: {user.lastActiveAt === null ? "ещё не входил" : dateTime(user.lastActiveAt, timeZone)}</span>
            <div class="user-actions">
              <button type="button" class="small-button" disabled={busy} onClick={() => void reset(user)}>Сбросить пароль</button>
              {!user.isOwner && <button type="button" class="small-button danger-button" disabled={busy} onClick={() => void remove(user)}>Удалить</button>}
            </div>
          </div>
        </div>)}
      </div>
    </section>
    <section class="section">
      <h2 class="section-header">Неиспользованные приглашения</h2>
      {!loading && invitations.length === 0 && <p class="section-footer">Приглашений пока нет.</p>}
      <div class="card-list">
        {invitations.map((invitation) => <div class="row" key={invitation.id}>
          <div class="row-main">
            <span class="row-title">{invitation.expiresAt <= Date.now() ? "Истекло" : "Ожидает пользователя"}</span>
            <span class="row-sub">До {dateTime(invitation.expiresAt, timeZone)}</span>
          </div>
          <button type="button" class="small-button danger-button" disabled={busy} onClick={async () => {
            setBusy(true)
            try {
              const result = await auth.revokeInvitation(invitation.id)
              if (result.ok) await load()
              else setNote(authErrorText(result.reason))
            } finally { setBusy(false) }
          }}>Отозвать</button>
        </div>)}
      </div>
    </section>
  </>
}
