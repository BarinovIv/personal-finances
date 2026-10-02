import { createContext, type ComponentChildren } from "preact"
import { useContext, useRef } from "preact/hooks"

const TabActivity = createContext(true)

/** Видимость вкладки; вложенные экраны по умолчанию активны. */
export const useTabActive = () => useContext(TabActivity)

/** Вкладка создаётся при первом открытии и сохраняется до выхода из приложения. */
export const TabView = ({ active, children }: { active: boolean; children: ComponentChildren }) => {
  const visited = useRef(false)
  if (active) visited.current = true
  return (
    <div class="tab-view" hidden={!active}>
      <TabActivity.Provider value={active}>{visited.current && children}</TabActivity.Provider>
    </div>
  )
}
