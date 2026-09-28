import type { SessionState } from "@fin/sync"
import { useEffect, useState } from "preact/hooks"
import { useSyncStatus } from "./components/SyncBadge"
import { ChartIcon, PenIcon, SlidersIcon } from "./icons"
import { EntryScreen } from "./screens/Entry"
import { LoginScreen } from "./screens/Login"
import { SettingsScreen } from "./screens/Settings"
import { auth, getServices, useRoute, type AppServices } from "./state"

type Tab = "entry" | "dashboard" | "settings"

const TabBar = ({ current }: { current: Tab | null }) => (
  <nav class="tabbar">
    <a href="#/" aria-current={current === "entry" ? "page" : undefined}>
      <PenIcon />
      <span>Ввод</span>
    </a>
    <a href="#/dashboard" aria-current={current === "dashboard" ? "page" : undefined}>
      <ChartIcon />
      <span>Дашборд</span>
    </a>
    <a href="#/settings" aria-current={current === "settings" ? "page" : undefined}>
      <SlidersIcon />
      <span>Настройки</span>
    </a>
  </nav>
)

const tabOf = (route: string): Tab | null => {
  if (route === "/") return "entry"
  if (route.startsWith("/dashboard")) return "dashboard"
  if (route.startsWith("/settings")) return "settings"
  return null
}

const Main = ({ services, onSignedOut }: { services: AppServices; onSignedOut: () => void }) => {
  const route = useRoute()
  const status = useSyncStatus(services.sync)
  // истёкшая сессия — на экран входа; очередь изменений остаётся на устройстве
  useEffect(() => {
    if (status.state === "unauthorized") onSignedOut()
  }, [status.state])

  const { ledger, sync } = services
  return (
    <div class="app">
      {route.startsWith("/settings") ? (
        <SettingsScreen ledger={ledger} sync={sync} auth={auth} onSignedOut={onSignedOut} />
      ) : (
        <EntryScreen ledger={ledger} sync={sync} />
      )}
      <TabBar current={tabOf(route)} />
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
