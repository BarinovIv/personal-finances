import type { DeviceState } from "@fin/sync"
import type { ComponentChildren } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { ChartIcon, PenIcon, SlidersIcon } from "./icons"
import { DashboardScreen } from "./screens/Dashboard"
import { EntryScreen } from "./screens/Entry"
import { GoalScreen } from "./screens/Goal"
import { LoginScreen } from "./screens/Login"
import { OperationScreen } from "./screens/Operation"
import { SettingsScreen, type SettingsSub } from "./screens/Settings"
import { auth, dashboardMemory, getServices, navigate, refreshOtherTabs, useRoute, type AppServices } from "./state"
import { ToastHost } from "./toast"
import { TabView } from "./tabActivity"

type Tab = "entry" | "dashboard" | "settings"

const SETTINGS_SUBS: ReadonlyArray<SettingsSub> = ["paydays", "recurring", "categories", "goals", "debts", "export", "devices", "news", "password", "users", "timezone"]

/** Подстраница настроек — отдельный вложенный экран, без таббара (как «Операция»). */
const settingsSubOf = (route: string): SettingsSub | null => {
  const sub = /^\/settings\/([a-z]+)$/.exec(route)?.[1]
  return (SETTINGS_SUBS as ReadonlyArray<string>).includes(sub ?? "") ? (sub as SettingsSub) : null
}

const TABS: ReadonlyArray<{ tab: Tab; href: string; label: string; icon: ComponentChildren }> = [
  { tab: "entry", href: "#/", label: "Ввод", icon: <PenIcon /> },
  { tab: "dashboard", href: "#/dashboard", label: "Дашборд", icon: <ChartIcon /> },
  { tab: "settings", href: "#/settings", label: "Настройки", icon: <SlidersIcon /> }
]

/** Парящий таббар из «жидкого стекла»; линза выбранной вкладки перетекает к новой на пружине. */
const TabBar = ({ current }: { current: Tab }) => (
  <div class="tabbar-dock">
    <nav class="tabbar glass" aria-label="Разделы" style={{ "--tab-index": String(TABS.findIndex((t) => t.tab === current)) }}>
      <span class="tabbar-lens" aria-hidden="true" />
      {TABS.map((t) => (
        <a key={t.tab} href={t.href} aria-current={current === t.tab ? "page" : undefined}>
          {t.icon}
          <span>{t.label}</span>
        </a>
      ))}
    </nav>
  </div>
)

const tabOf = (route: string): Tab | null => {
  if (route === "/") return "entry"
  if (route.startsWith("/dashboard")) return "dashboard"
  if (route === "/settings") return "settings"
  return null
}

const Main = ({ services, isOwner, onSignedOut, onSessionChanged, welcome }: {
  services: AppServices; isOwner: boolean; onSignedOut: () => void; onSessionChanged: (state: DeviceState) => void; welcome: boolean
}) => {
  const route = useRoute()
  // истёкшая сессия — на экран входа; очередь изменений остаётся на устройстве.
  // Слушаем без состояния: статус меняется на каждую правку и каждый обмен с сервером, а экрану до него дела нет.
  // Реагируем на переход в «нужен вход», а не на само состояние: сразу после входа статус ещё помнит
  // отказ сервера до входа, и приложение выкидывало бы обратно на экран входа.
  const changed = useRef(onSessionChanged)
  changed.current = onSessionChanged
  useEffect(() => {
    let last = services.sync.status().state
    if (last === "unauthorized" || last === "user-deleted") {
      void services.device.checkSession().then((state) => changed.current(state))
    }
    return services.sync.subscribe((status) => {
      if ((status.state === "unauthorized" || status.state === "user-deleted") && last !== status.state) {
        void services.device.checkSession().then((state) => changed.current(state))
      }
      last = status.state
    })
  }, [services.sync])

  const { ledger, sync } = services
  const tab = tabOf(route)
  const op = /^\/op\/(.+)$/.exec(route)
  const goal = /^\/goal\/(.+)$/.exec(route)
  const settingsSub = settingsSubOf(route)
  return (
    <div class={`app${tab ? " has-tabbar" : ""}`}>
      {welcome && <p class="welcome-note">Если добавите приложение на домашний экран из Safari, в нём нужно будет войти ещё раз с тем же логином и паролем.</p>}
      <TabView active={tab === "entry" || (!op && !goal && !settingsSub && tab === null)}>
        <EntryScreen ledger={ledger} sync={sync} />
      </TabView>
      <TabView active={tab === "dashboard"}>
        <DashboardScreen ledger={ledger} />
      </TabView>
      <TabView active={tab === "settings"}>
        <SettingsScreen ledger={ledger} sync={sync} auth={auth} device={services.device} isOwner={isOwner} onSignedOut={onSignedOut} sub={null} />
      </TabView>
      {op ? (
        <OperationScreen ledger={ledger} id={decodeURIComponent(op[1]!)} />
      ) : goal ? (
        <GoalScreen ledger={ledger} id={decodeURIComponent(goal[1]!)} />
      ) : settingsSub ? (
        <SettingsScreen ledger={ledger} sync={sync} auth={auth} device={services.device} isOwner={isOwner} onSignedOut={onSignedOut} sub={settingsSub} />
      ) : null}
      {tab && <TabBar current={tab} />}
      <ToastHost />
    </div>
  )
}

export const App = () => {
  const route = useRoute()
  const [services, setServices] = useState<AppServices | null>(null)
  const [session, setSession] = useState<DeviceState | null>(null)
  const [welcome, setWelcome] = useState(false)

  useEffect(() => {
    void getServices().then(async (next) => {
      setServices(next)
      const local = next.device.state()
      if (local.state === "offline") setSession(local)
      setSession(await next.device.checkSession())
    })
  }, [])

  if (!services || !session) return <div class="app" aria-busy="true" />
  const match = /^\/(invite|reset)\/([^/]+)$/.exec(route)
  const link = match ? { kind: match[1] as "invite" | "reset", token: decodeURIComponent(match[2]!) } : null
  if (session.state === "user-deleted" && !link) {
    return <div class="app"><div class="login">
      <h1>Пользователь удалён</h1>
      <p class="hint">Владелец удалил пользователя. Его данные и неотправленные изменения очищены с этого устройства.</p>
      <button type="button" class="accent-button large" onClick={() => setSession({ state: "signed-out" })}>Войти другим пользователем</button>
    </div></div>
  }
  if (session.state === "signed-out" || link) {
    return (
      <div class="app">
        <LoginScreen
          key={link ? `${link.kind}/${link.token}` : "login"}
          auth={auth}
          device={services.device}
          link={link}
          onSignedIn={(registered) => {
            refreshOtherTabs()
            setSession(services.device.state())
            const safari = /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|Android/.test(navigator.userAgent)
            setWelcome(registered && safari && !window.matchMedia("(display-mode: standalone)").matches)
            dashboardMemory.offset = 0
            navigate("/")
          }}
        />
      </div>
    )
  }
  return <Main services={services} isOwner={session.state === "signed-in" && session.user.isOwner} welcome={welcome} onSessionChanged={setSession} onSignedOut={() => {
    refreshOtherTabs()
    setWelcome(false)
    setSession({ state: "signed-out" })
    navigate("/")
  }} />
}
