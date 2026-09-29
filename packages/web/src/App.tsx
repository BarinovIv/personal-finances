import type { SessionState } from "@fin/sync"
import type { ComponentChildren } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { ChartIcon, PenIcon, SlidersIcon } from "./icons"
import { DashboardScreen } from "./screens/Dashboard"
import { EntryScreen } from "./screens/Entry"
import { LoginScreen } from "./screens/Login"
import { OperationScreen } from "./screens/Operation"
import { SettingsScreen, type SettingsSub } from "./screens/Settings"
import { auth, getServices, useRoute, type AppServices } from "./state"
import { ToastHost } from "./toast"

type Tab = "entry" | "dashboard" | "settings"

const SETTINGS_SUBS: ReadonlyArray<SettingsSub> = ["paydays", "recurring", "categories", "export", "devices"]

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

const Main = ({ services, onSignedOut }: { services: AppServices; onSignedOut: () => void }) => {
  const route = useRoute()
  // истёкшая сессия — на экран входа; очередь изменений остаётся на устройстве.
  // Слушаем без состояния: статус меняется на каждую правку и каждый обмен с сервером, а экрану до него дела нет.
  // Реагируем на переход в «нужен вход», а не на само состояние: сразу после входа статус ещё помнит
  // отказ сервера до входа, и приложение выкидывало бы обратно на экран входа.
  const signedOut = useRef(onSignedOut)
  signedOut.current = onSignedOut
  useEffect(() => {
    let last = services.sync.status().state
    return services.sync.subscribe((status) => {
      if (status.state === "unauthorized" && last !== "unauthorized") signedOut.current()
      last = status.state
    })
  }, [services.sync])

  const { ledger, sync } = services
  const tab = tabOf(route)
  const op = /^\/op\/(.+)$/.exec(route)
  const settingsSub = settingsSubOf(route)
  return (
    <div class={`app${tab ? " has-tabbar" : ""}`}>
      {op ? (
        <OperationScreen ledger={ledger} id={decodeURIComponent(op[1]!)} />
      ) : tab === "dashboard" ? (
        <DashboardScreen ledger={ledger} />
      ) : tab === "settings" || settingsSub ? (
        <SettingsScreen ledger={ledger} sync={sync} auth={auth} onSignedOut={onSignedOut} sub={settingsSub} />
      ) : (
        <EntryScreen ledger={ledger} sync={sync} />
      )}
      {tab && <TabBar current={tab} />}
      <ToastHost />
    </div>
  )
}

export const App = () => {
  const [services, setServices] = useState<AppServices | null>(null)
  const [session, setSession] = useState<SessionState | "checking">("checking")

  useEffect(() => {
    void getServices().then(setServices)
    void auth.checkSession().then(setSession)
  }, [])

  if (session === "signed-out") {
    return (
      <div class="app">
        <LoginScreen
          auth={auth}
          onSignedIn={() => {
            setSession("signed-in")
            services?.sync.wake()
          }}
        />
      </div>
    )
  }
  if (!services) return <div class="app" />
  return <Main services={services} onSignedOut={() => setSession("signed-out")} />
}
