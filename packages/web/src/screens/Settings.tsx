import type { Ledger } from "@fin/ledger"
import type { AuthApi, SessionInfo, Sync } from "@fin/sync"
import { useEffect, useState } from "preact/hooks"
import { SyncBadge } from "../components/SyncBadge"
import { lastActive } from "../format"
import { useLedgerVersion } from "../state"
import { CategoriesSection } from "./Categories"
import { RecurringSection } from "./Recurring"

const Paydays = ({ ledger }: { ledger: Ledger }) => {
  const current = ledger.settings().paydays.join(", ")
  const [text, setText] = useState(current)
  const [note, setNote] = useState<string | null>(null)
  const save = async () => {
    const days = text
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map(Number)
    const result = await ledger.setPaydays(days)
    setNote(result.ok ? "Сохранено" : "Укажите числа месяца от 1 до 31, например «5, 20».")
    if (result.ok) setText(ledger.settings().paydays.join(", "))
  }
  return (
    <section class="section">
      <h2>Дни зарплаты</h2>
      <p class="section-note">
        Зарплатный период длится от дня зарплаты до дня накануне следующего. Если такого числа в месяце нет, берётся
        последний день.
      </p>
      <div class="inline-form">
        <input
          class="text-input"
          type="text"
          inputMode="numeric"
          aria-label="Дни зарплаты"
          value={text}
          onInput={(e) => {
            setText(e.currentTarget.value)
            setNote(null)
          }}
        />
        <button type="button" class="secondary-button" disabled={text === current} onClick={() => void save()}>
          Сохранить
        </button>
      </div>
      {note && <p class="section-note">{note}</p>}
    </section>
  )
}

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

export const SettingsScreen = (props: { ledger: Ledger; sync: Sync; auth: AuthApi; onSignedOut: () => void }) => {
  useLedgerVersion(props.ledger)
  return (
  <div class="screen">
    <div class="page">
      <div class="page-head">
        <h1>Настройки</h1>
        <SyncBadge sync={props.sync} />
      </div>
      <Paydays ledger={props.ledger} />
      <RecurringSection ledger={props.ledger} />
      <CategoriesSection ledger={props.ledger} />
      <Devices auth={props.auth} onSignedOut={props.onSignedOut} />
    </div>
  </div>
  )
}
