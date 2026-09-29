import { indexedDbStore, openLedger, type Ledger } from "@fin/ledger"
import { createAuthApi, createSync, type Sync, type Transport } from "@fin/sync"
import { useEffect, useState } from "preact/hooks"

const transport: Transport = { baseUrl: window.location.origin, fetch: (request) => fetch(request) }

export const auth = createAuthApi(transport)

export interface AppServices {
  readonly ledger: Ledger
  readonly sync: Sync
}

let services: Promise<AppServices> | undefined

/** Журнал на этом устройстве (IndexedDB) и его синхронизация в фоне. */
export const getServices = () =>
  (services ??= openLedger({ store: indexedDbStore() }).then((ledger) => {
    const sync = createSync({ ledger, transport })
    sync.start()
    window.addEventListener("online", () => sync.wake())
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") sync.wake()
    })
    return { ledger, sync }
  }))

/** Перерисовывает компонент при любом изменении журнала. */
export const useLedgerVersion = (ledger: Ledger) => {
  const [version, setVersion] = useState(0)
  useEffect(() => ledger.subscribe(() => setVersion((v) => v + 1)), [ledger])
  return version
}

/** Вложенный экран — показывается поверх вкладки, с «Назад» и въездом справа. */
const isNestedPath = (path: string) => path.startsWith("/op/") || /^\/settings\/[a-z-]+$/.test(path)

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

let lastPath = window.location.hash.replace(/^#/, "") || "/"
/** Сколько раз сменился маршрут за время сессии — по нему судим, есть ли куда возвращаться реальной историей. */
let routeChanges = 0

type DocumentWithViewTransitions = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> }
}

/** Въезд/выезд вложенного экрана через View Transitions API; без библиотек, с уважением к «уменьшить движение». */
const withRouteTransition = (nextPath: string, apply: () => void) => {
  const previousPath = lastPath
  lastPath = nextPath
  const doc = document as DocumentWithViewTransitions
  // переключение вкладок (Ввод/Дашборд/Настройки) остаётся мгновенным — анимируем только вложенные экраны
  const bothTabs = !isNestedPath(previousPath) && !isNestedPath(nextPath)
  if (bothTabs || prefersReducedMotion() || !doc.startViewTransition) {
    apply()
    return
  }
  const root = document.documentElement
  root.classList.toggle("vt-forward", isNestedPath(nextPath) && !isNestedPath(previousPath))
  root.classList.toggle("vt-backward", isNestedPath(previousPath) && !isNestedPath(nextPath))
  doc.startViewTransition(apply)
}

/** Текущий маршрут из hash: `#/`, `#/dashboard`, `#/op/<id>`. */
export const useRoute = () => {
  const read = () => window.location.hash.replace(/^#/, "") || "/"
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => {
      routeChanges++
      withRouteTransition(read(), () => setRoute(read()))
    }
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return route
}

export const navigate = (path: string) => {
  window.location.hash = path
}

/**
 * Возврат на вложенном экране: реальная история браузера, поэтому пользователь попадает туда,
 * откуда пришёл (лента, дашборд с тем же периодом, настройки), а не всегда на `fallback`.
 * `fallback` — запасной путь, если в этой сессии ещё не было переходов (например, открыли ссылку на операцию напрямую).
 */
export const goBack = (fallback: string) => {
  if (routeChanges > 0) window.history.back()
  else navigate(fallback)
}

/** Память вида дашборда на время сессии: страница выхода и входа операции не должна её сбрасывать. */
export const dashboardMemory = { offset: 0, selected: null as string | null }
