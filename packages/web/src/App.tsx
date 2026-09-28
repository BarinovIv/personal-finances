import { ChartIcon, PenIcon, SlidersIcon } from "./icons"

const TabBar = ({ current }: { current: "entry" | "dashboard" | "settings" }) => (
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

const EntryScreen = () => (
  <div class="screen">
    <div class="composer">
      <label for="line">Что потратил или получил?</label>
      <input id="line" class="line-input" type="text" placeholder="футболка 1500" autocomplete="off" enterKeyHint="done" />
      <div class="hint">
        Например: <b>футболка 1500</b> · <b>+зарплата 95000</b> · <b>вчера такси 450</b> · <b>обед 1.2к</b>
      </div>
    </div>
    <div class="empty">Пока нет операций</div>
  </div>
)

export const App = () => (
  <div class="app">
    <EntryScreen />
    <TabBar current="entry" />
  </div>
)
