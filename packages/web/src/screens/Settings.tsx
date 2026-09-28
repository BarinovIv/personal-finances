import type { Ledger } from "@fin/ledger"
import type { AuthApi, SessionInfo } from "@fin/sync"
import { useEffect, useState } from "preact/hooks"
import { lastActive } from "../format"

const Devices = ({ auth, onSignedOut }: { auth: AuthApi; onSignedOut: () => void }) => {
  const [sessions, setSessions] = useState<ReadonlyArray<SessionInfo> | null | undefined>(undefined)
  const load = () => auth.sessions().then(setSessions)
  useEffect(() => {
    void load()
  }, [])

  return (
    <section class="section">
      <h2>Устройства</h2>
      {sessions === undefined && <p class="section-note">Загружаю…</p>}
      {sessions === null && <p class="section-note">Список устройств доступен, когда есть связь с сервером.</p>}
      {sessions && (
        <div class="card-list">
          {sessions.map((s) => (
            <div class="row" key={s.id}>
              <div class="row-main">
                <span class="row-title">{s.device}</span>
                <span class="row-sub">{s.current ? "это устройство" : lastActive(s.lastActiveAt)}</span>
              </div>
              {!s.current && (
                <button
                  type="button"
                  class="secondary-button danger-button"
                  onClick={async () => {
                    await auth.revokeSession(s.id)
                    await load()
                  }}
                >
                  Отозвать
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        class="secondary-button danger-button"
        onClick={async () => {
          await auth.logout()
          onSignedOut()
        }}
      >
        Выйти на этом устройстве
      </button>
    </section>
  )
}

export const SettingsScreen = (props: { ledger: Ledger; auth: AuthApi; onSignedOut: () => void }) => (
  <div class="screen">
    <div class="page">
      <h1>Настройки</h1>
      <Devices auth={props.auth} onSignedOut={props.onSignedOut} />
    </div>
  </div>
)
