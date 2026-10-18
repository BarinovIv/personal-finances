import type { Ledger } from "@fin/ledger"
import type { AuthApi, SessionInfo, Sync, UserDevice } from "@fin/sync"
import type { ComponentChildren } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { Header } from "../components/Header"
import { LargeTitle } from "../components/LargeTitle"
import { SwipeBack } from "../components/SwipeBack"
import { SyncBadge } from "../components/SyncBadge"
import { lastActive } from "../format"
import { CalendarIcon, DebtIcon, DownloadIcon, ForwardIcon, GridIcon, LogoutIcon, LoopIcon, NewsIcon, PhoneIcon, SlidersIcon, StarIcon } from "../icons"
import { goBack, setNavigationGuard, useLedgerVersion } from "../state"
import { CategoriesSection } from "./Categories"
import { DebtsSection } from "./Debts"
import { GoalsSection } from "./Goals"
import { RecurringSection } from "./Recurring"
import { WhatsNewSection } from "./WhatsNew"
import { PasswordSection } from "./Password"
import { TimeZoneSection } from "./TimeZone"
import { UsersSection } from "./Users"
import { authErrorText } from "./Login"
import { CsvImport } from "./CsvImport"
import { BackupSection } from "./Backup"
import { downloadText } from "../helpers"

export type SettingsSub = "paydays" | "recurring" | "categories" | "goals" | "debts" | "export" | "devices" | "news" | "password" | "users" | "timezone"

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
      <div class="card-list">
        <label class="row input-row">
          <span class="row-label">Числа месяца</span>
          <input
            class="row-input num"
            type="text"
            inputMode="text"
            aria-label="Дни зарплаты"
            placeholder="5, 20"
            value={text}
            onInput={(e) => {
              setText(e.currentTarget.value)
              setNote(null)
            }}
          />
        </label>
      </div>
      <p class="section-footer">
        {note ??
          "Зарплатный период длится от дня зарплаты до дня накануне следующего. Если такого числа в месяце нет, берётся последний день."}
      </p>
      <button type="button" class="accent-button large" disabled={text === current} onClick={() => void save()}>
        Сохранить
      </button>
    </section>
  )
}

const Export = ({ ledger, disabled }: { ledger: Ledger; disabled: boolean }) => (
  <section class="section">
    <div class="card-list">
      <button
        type="button"
        class="row row-button action-row"
        disabled={disabled}
        onClick={() => {
          downloadText(ledger.exportCsv(), `finances-${ledger.today()}.csv`, "text/csv;charset=utf-8")
        }}
      >
        <DownloadIcon />
        <span>Скачать всё в CSV</span>
      </button>
    </div>
    <p class="section-footer">Все операции, включая возвраты и регулярные, — файл открывается в Excel.</p>
  </section>
)

const DataTransfer = ({ ledger, sync }: { ledger: Ledger; sync: Sync }) => {
  const [busy, setBusy] = useState(false)
  const working = useRef(false)
  const transfer = { busy, setBusy, working }
  useEffect(() => setNavigationGuard(() => !working.current), [])
  return <>
    <BackupSection ledger={ledger} sync={sync} transfer={transfer} />
    <Export ledger={ledger} disabled={busy} />
    <CsvImport ledger={ledger} sync={sync} transfer={transfer} />
  </>
}

const Devices = ({ auth, device, timeZone, onSignedOut }: { auth: AuthApi; device: UserDevice; timeZone: string; onSignedOut: () => void }) => {
  const [sessions, setSessions] = useState<ReadonlyArray<SessionInfo> | null | undefined>(undefined)
  const [note, setNote] = useState<string | null>(null)
  const load = () => auth.sessions().then(setSessions)
  useEffect(() => {
    void load()
  }, [])

  return (
    <>
      <section class="section">
        {sessions === undefined && <p class="section-footer">Загружаю…</p>}
        {sessions === null && <p class="section-footer">Список устройств доступен, когда есть связь с сервером.</p>}
        {sessions && (
          <div class="card-list">
            {sessions.map((s) => (
              <div class="row" key={s.id}>
                <span class="settings-icon" style={{ background: "var(--palette-gray)" }}>
                  <PhoneIcon />
                </span>
                <div class="row-main">
                  <span class="row-title">{s.device}</span>
                  <span class="row-sub">{s.current ? "это устройство" : lastActive(s.lastActiveAt, Date.now(), timeZone)}</span>
                </div>
                  <button
                    type="button"
                    class="small-button danger-button"
                    onClick={async () => {
                      if (await auth.revokeSession(s.id)) {
                        if (s.current) {
                          await device.checkSession()
                          onSignedOut()
                        } else await load()
                      } else setNote("Не получилось отозвать вход. Проверьте связь с сервером.")
                    }}
                  >
                    Отозвать
                  </button>
              </div>
            ))}
          </div>
        )}
      </section>
      {note && <p class="section-footer" role="status">{note}</p>}
      <div class="card-list">
        <button
          type="button"
          class="row row-button action-row destructive"
          onClick={async () => {
            let result = await device.logout()
            if (!result.ok && result.reason === "pending-changes" && window.confirm(`Не отправлено изменений: ${result.pending}. Выйти и удалить данные с этого устройства?`)) {
              result = await device.logout({ confirmDiscard: true })
            }
            if (result.ok) onSignedOut()
            else if (result.reason !== "pending-changes") setNote(result.reason === "offline"
              ? "Для выхода нужна связь с сервером. Данные и неотправленные изменения сохранены."
              : authErrorText(result.reason))
          }}
        >
          <LogoutIcon />
          <span>Выйти на этом устройстве</span>
        </button>
      </div>
    </>
  )
}

const SUB_TITLE: Record<SettingsSub, string> = {
  paydays: "Дни зарплаты",
  recurring: "Регулярные операции",
  categories: "Категории",
  goals: "Цели",
  debts: "Долги",
  export: "Импорт и выгрузка",
  devices: "Устройства",
  news: "Что нового",
  password: "Пароль",
  users: "Пользователи",
  timezone: "Часовой пояс"
}

/** Подстраница настроек — отдельный экран с «Назад», как в iOS. */
const SettingsSubPage = ({ sub, children }: { sub: SettingsSub; children: ComponentChildren }) => (
  <SwipeBack onBack={(options) => goBack("/settings", options)}>
    <div class="screen column">
      <Header title={SUB_TITLE[sub]} back="#/settings" />
      <div class="page">{children}</div>
    </div>
  </SwipeBack>
)

const SUB_ICON: Record<SettingsSub, { icon: ComponentChildren; color: string }> = {
  paydays: { icon: <CalendarIcon />, color: "green" },
  recurring: { icon: <LoopIcon />, color: "indigo" },
  categories: { icon: <GridIcon />, color: "orange" },
  goals: { icon: <StarIcon />, color: "teal" },
  debts: { icon: <DebtIcon />, color: "purple" },
  export: { icon: <DownloadIcon />, color: "blue" },
  devices: { icon: <PhoneIcon />, color: "gray" },
  news: { icon: <NewsIcon />, color: "pink" },
  password: { icon: <SlidersIcon />, color: "indigo" },
  users: { icon: <PhoneIcon />, color: "purple" },
  timezone: { icon: <CalendarIcon />, color: "blue" }
}

/** Группы меню, как в «Настройках» iOS: учёт отдельно, данные и устройства отдельно. */
const MENU_GROUPS: ReadonlyArray<ReadonlyArray<SettingsSub>> = [
  ["paydays", "recurring", "categories"],
  ["goals", "debts"],
  ["timezone", "export", "devices", "password"],
  ["news"]
]

const SettingsMenu = ({ sync, isOwner }: { sync: Sync; isOwner: boolean }) => (
  <LargeTitle title="Настройки" actions={<SyncBadge sync={sync} />}>
    <nav class="settings-menu" aria-label="Разделы настроек">
      {MENU_GROUPS.map((group) => (
        <div class="card-list" key={group[0]}>
          {group.map((sub) => (
            <a class="row row-button settings-row" href={`#/settings/${sub}`} key={sub}>
              <span class="settings-icon" style={{ background: `var(--palette-${SUB_ICON[sub].color})` }}>
                {SUB_ICON[sub].icon}
              </span>
              <span class="row-main">
                <span class="row-title">{SUB_TITLE[sub]}</span>
              </span>
              <span class="row-chevron">
                <ForwardIcon size={16} />
              </span>
            </a>
          ))}
        </div>
      ))}
      {isOwner && <div class="card-list">
        <a class="row row-button settings-row" href="#/settings/users">
          <span class="settings-icon" style={{ background: "var(--palette-purple)" }}><PhoneIcon /></span>
          <span class="row-main"><span class="row-title">Пользователи</span></span>
          <span class="row-chevron"><ForwardIcon size={16} /></span>
        </a>
      </div>}
    </nav>
  </LargeTitle>
)

export const SettingsScreen = (props: {
  ledger: Ledger
  sync: Sync
  auth: AuthApi
  device: UserDevice
  isOwner: boolean
  onSignedOut: () => void
  sub: SettingsSub | null
}) => {
  useLedgerVersion(props.ledger)
  switch (props.sub) {
    case "password":
      return <SettingsSubPage sub="password"><PasswordSection auth={props.auth} /></SettingsSubPage>
    case "timezone":
      return <SettingsSubPage sub="timezone"><TimeZoneSection ledger={props.ledger} /></SettingsSubPage>
    case "users":
      return <SettingsSubPage sub="users">{props.isOwner ? <UsersSection auth={props.auth} timeZone={props.ledger.settings().timeZone} /> : <p class="section-footer">Этот раздел доступен только владельцу.</p>}</SettingsSubPage>
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
    case "goals":
      return (
        <SettingsSubPage sub="goals">
          <GoalsSection ledger={props.ledger} />
        </SettingsSubPage>
      )
    case "debts":
      return (
        <SettingsSubPage sub="debts">
          <DebtsSection ledger={props.ledger} />
        </SettingsSubPage>
      )
    case "export":
      return (
        <SettingsSubPage sub="export">
          <DataTransfer ledger={props.ledger} sync={props.sync} />
        </SettingsSubPage>
      )
    case "devices":
      return (
        <SettingsSubPage sub="devices">
          <Devices auth={props.auth} device={props.device} timeZone={props.ledger.settings().timeZone} onSignedOut={props.onSignedOut} />
        </SettingsSubPage>
      )
    case "news":
      return (
        <SettingsSubPage sub="news">
          <WhatsNewSection />
        </SettingsSubPage>
      )
    default:
      return <SettingsMenu sync={props.sync} isOwner={props.isOwner} />
  }
}
