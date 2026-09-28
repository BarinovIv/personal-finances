import type { Ledger } from "@fin/ledger"
import { createAuthApi, type SessionState } from "@fin/sync"
import { useEffect, useState } from "preact/hooks"
import { ChartIcon, PenIcon, SlidersIcon } from "./icons"
import { EntryScreen } from "./screens/Entry"
import { LoginScreen } from "./screens/Login"
import { SettingsScreen } from "./screens/Settings"
import { getLedger, useRoute } from "./state"

type Tab = "entry" | "dashboard" | "settings"

const auth = createAuthApi({ baseUrl: window.location.origin, fetch: (request) => fetch(request) })

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

export const App = () => {
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [session, setSession] = useState<SessionState | "checking">("checking")
  const route = useRoute()

  useEffect(() => {
    void getLedger().then(setLedger)
    void auth.checkSession().then(setSession)
  }, [])

  if (session === "signed-out") {
    return (
      <div class="app">
        <LoginScreen auth={auth} onSignedIn={() => setSession("signed-in")} />
      </div>
    )
  }
  if (!ledger) return <div class="app" />

  const signedOut = () => setSession("signed-out")
  return (
    <div class="app">
      {route.startsWith("/settings") ? (
        <SettingsScreen ledger={ledger} auth={auth} onSignedOut={signedOut} />
      ) : (
        <EntryScreen ledger={ledger} />
      )}
      <TabBar current={tabOf(route)} />
    </div>
  )
}
