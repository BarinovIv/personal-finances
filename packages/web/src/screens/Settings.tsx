import type { Ledger } from "@fin/ledger"
import type { AuthApi, SessionInfo, Sync } from "@fin/sync"
import type { ComponentChildren } from "preact"
import { useEffect, useState } from "preact/hooks"
import { Header } from "../components/Header"
import { LargeTitle } from "../components/LargeTitle"
import { SwipeBack } from "../components/SwipeBack"
import { SyncBadge } from "../components/SyncBadge"
import { lastActive } from "../format"
import { ForwardIcon } from "../icons"
import { goBack, useLedgerVersion } from "../state"
import { CategoriesSection } from "./Categories"
import { RecurringSection } from "./Recurring"

export type SettingsSub = "paydays" | "recurring" | "categories" | "export" | "devices"

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

const Export = ({ ledger }: { ledger: Ledger }) => (
  <section class="section">
    <h2>Выгрузка</h2>
    <p class="section-note">Все операции, включая возвраты и регулярные, — файл открывается в Excel.</p>
    <button
      type="button"
      class="secondary-button"
      onClick={() => {
        const blob = new Blob([ledger.exportCsv()], { type: "text/csv;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `finances-${ledger.today()}.csv`
        document.body.append(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
      }}
    >
      Скачать всё в CSV
    </button>
  </section>
)

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

const SUB_TITLE: Record<SettingsSub, string> = {
  paydays: "Дни зарплаты",
  recurring: "Регулярные операции",
  categories: "Категории",
  export: "Выгрузка",
  devices: "Устройства"
}

/** Подстраница настроек — отдельный экран с «Назад», как в iOS. */
const SettingsSubPage = ({ sub, children }: { sub: SettingsSub; children: ComponentChildren }) => (
  <SwipeBack onBack={() => goBack("/settings")}>
    <div class="screen column">
      <Header title={SUB_TITLE[sub]} back="#/settings" />
      <div class="page">{children}</div>
    </div>
  </SwipeBack>
)

const SettingsMenu = ({ sync }: { sync: Sync }) => (
  <LargeTitle title="Настройки" actions={<SyncBadge sync={sync} />}>
    <nav class="settings-menu" aria-label="Разделы настроек">
      {(Object.keys(SUB_TITLE) as ReadonlyArray<SettingsSub>).map((sub) => (
        <a class="settings-menu-row" href={`#/settings/${sub}`} key={sub}>
          <span>{SUB_TITLE[sub]}</span>
          <ForwardIcon size={16} />
        </a>
      ))}
    </nav>
  </LargeTitle>
)

export const SettingsScreen = (props: {
  ledger: Ledger
  sync: Sync
  auth: AuthApi
  onSignedOut: () => void
  sub: SettingsSub | null
}) => {
  useLedgerVersion(props.ledger)
  switch (props.sub) {
    case "paydays":
      return (
        <SettingsSubPage sub="paydays">
          <Paydays ledger={props.ledger} />
        </SettingsSubPage>
      )
    case "recurring":
      return (
        <SettingsSubPage sub="recurring">
          <RecurringSection ledger={props.ledger} />
        </SettingsSubPage>
      )
    case "categories":
      return (
        <SettingsSubPage sub="categories">
          <CategoriesSection ledger={props.ledger} />
        </SettingsSubPage>
      )
    case "export":
      return (
        <SettingsSubPage sub="export">
          <Export ledger={props.ledger} />
        </SettingsSubPage>
      )
    case "devices":
      return (
        <SettingsSubPage sub="devices">
          <Devices auth={props.auth} onSignedOut={props.onSignedOut} />
        </SettingsSubPage>
      )
    default:
      return <SettingsMenu sync={props.sync} />
  }
}
