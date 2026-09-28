import type { Ledger } from "@fin/ledger"
import { useEffect, useState } from "preact/hooks"
import { ChartIcon, PenIcon, SlidersIcon } from "./icons"
import { EntryScreen } from "./screens/Entry"
import { getLedger, useRoute } from "./state"

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

const Screen = ({ ledger, route }: { ledger: Ledger; route: string }) => {
  return <EntryScreen ledger={ledger} />
}

const tabOf = (route: string): Tab | null => {
  if (route === "/") return "entry"
  if (route.startsWith("/dashboard")) return "dashboard"
  if (route.startsWith("/settings")) return "settings"
  return null
}

export const App = () => {
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const route = useRoute()
  useEffect(() => {
    void getLedger().then(setLedger)
  }, [])
  if (!ledger) return <div class="app" />
  return (
    <div class="app">
      <Screen ledger={ledger} route={route} />
      <TabBar current={tabOf(route)} />
    </div>
  )
}
