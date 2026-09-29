import type { Ledger } from "@fin/ledger"
import type { AuthApi, SessionInfo, Sync } from "@fin/sync"
import type { ComponentChildren } from "preact"
import { useEffect, useState } from "preact/hooks"
import { Header } from "../components/Header"
import { LargeTitle } from "../components/LargeTitle"
import { SwipeBack } from "../components/SwipeBack"
import { SyncBadge } from "../components/SyncBadge"
import { lastActive } from "../format"
import { CalendarIcon, DebtIcon, DownloadIcon, ForwardIcon, GridIcon, LogoutIcon, LoopIcon, PhoneIcon } from "../icons"
import { goBack, useLedgerVersion } from "../state"
import { CategoriesSection } from "./Categories"
import { DebtsSection } from "./Debts"
import { RecurringSection } from "./Recurring"

export type SettingsSub = "paydays" | "recurring" | "categories" | "debts" | "export" | "devices"

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
            inputMode="numeric"
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

const Export = ({ ledger }: { ledger: Ledger }) => (
  <section class="section">
    <div class="card-list">
      <button
        type="button"
        class="row row-button action-row"
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
        <DownloadIcon />
        <span>Скачать всё в CSV</span>
      </button>
    </div>
    <p class="section-footer">Все операции, включая возвраты и регулярные, — файл открывается в Excel.</p>
  </section>
)

const Devices = ({ auth, onSignedOut }: { auth: AuthApi; onSignedOut: () => void }) => {
  const [sessions, setSessions] = useState<ReadonlyArray<SessionInfo> | null | undefined>(undefined)
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
                  <span class="row-sub">{s.current ? "это устройство" : lastActive(s.lastActiveAt)}</span>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    class="small-button danger-button"
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
      </section>
      <div class="card-list">
        <button
          type="button"
          class="row row-button action-row destructive"
          onClick={async () => {
            await auth.logout()
            onSignedOut()
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
  debts: "Долги",
  export: "Выгрузка",
  devices: "Устройства"
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
  debts: { icon: <DebtIcon />, color: "teal" },
  export: { icon: <DownloadIcon />, color: "blue" },
  devices: { icon: <PhoneIcon />, color: "gray" }
}

/** Группы меню, как в «Настройках» iOS: учёт отдельно, данные и устройства отдельно. */
const MENU_GROUPS: ReadonlyArray<ReadonlyArray<SettingsSub>> = [
  ["paydays", "recurring", "categories"],
  ["debts"],
  ["export", "devices"]
]

const SettingsMenu = ({ sync }: { sync: Sync }) => (
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
    case "debts":
      return (
        <SettingsSubPage sub="debts">
          <DebtsSection ledger={props.ledger} />
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
