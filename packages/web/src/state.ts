import { indexedDbStore, LocalUserChanged, openLedger, type Ledger } from "@fin/ledger"
import { createAuthApi, createSync, createUserDevice, type Sync, type Transport, type UserDevice } from "@fin/sync"
import { useEffect, useState } from "preact/hooks"
import { useTabActive } from "./tabActivity"

const transport: Transport = { baseUrl: window.location.origin, fetch: (request) => fetch(request) }

export const auth = createAuthApi(transport)

// Cookie и IndexedDB общие у вкладок: после смены пользователя каждая вкладка проверяет вход заново.
const userChanges = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("finances-user")
if (userChanges) userChanges.onmessage = () => window.location.reload()
export const refreshOtherTabs = () => userChanges?.postMessage("changed")
window.addEventListener("unhandledrejection", (event) => {
  if (event.reason instanceof LocalUserChanged) {
    event.preventDefault()
    window.location.reload()
  }
})

export interface AppServices {
  readonly ledger: Ledger
  readonly sync: Sync
  readonly device: UserDevice
}

let services: Promise<AppServices> | undefined

/** Журнал на этом устройстве (IndexedDB) и его синхронизация в фоне. */
export const getServices = () =>
  (services ??= openLedger({ store: indexedDbStore() }).then((ledger) => {
    const sync = createSync({ ledger, transport })
    const device = createUserDevice({ ledger, auth, sync })
    window.addEventListener("online", () => sync.wake())
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") sync.wake()
    })
    return { ledger, sync, device }
  }))

/** Обновляет данные при правке журнала и открытии вкладки, включая зависящие от текущей даты. */
export const useLedgerVersion = (ledger: Ledger) => {
  useTabActive()
  const [version, setVersion] = useState(0)
  useEffect(() => ledger.subscribe(() => setVersion((v) => v + 1)), [ledger])
  return version
}

/** Вложенный экран — показывается поверх вкладки, с «Назад» и въездом справа. */
const isNestedPath = (path: string) =>
  path.startsWith("/op/") || path.startsWith("/goal/") || /^\/settings\/[a-z-]+$/.test(path)

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

let lastPath = window.location.hash.replace(/^#/, "") || "/"
/** Сколько раз сменился маршрут за время сессии — по нему судим, есть ли куда возвращаться реальной историей. */
let routeChanges = 0
/** Экран уже увёл жест (наш свайп или системный свайп браузера) — вторая анимация перехода не нужна. */
let skipNextTransition = false

window.addEventListener("popstate", (e) => {
  if ((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition) skipNextTransition = true
})

type DocumentWithViewTransitions = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void>; ready: Promise<void> }
}

/** Въезд/выезд вложенного экрана через View Transitions API; без библиотек, с уважением к «уменьшить движение». */
const withRouteTransition = (nextPath: string, apply: () => void) => {
  const previousPath = lastPath
  lastPath = nextPath
  const skip = skipNextTransition
  skipNextTransition = false
  const doc = document as DocumentWithViewTransitions
  // переключение вкладок (Ввод/Дашборд/Настройки) остаётся мгновенным — анимируем только вложенные экраны
  const bothTabs = !isNestedPath(previousPath) && !isNestedPath(nextPath)
  if (skip || bothTabs || prefersReducedMotion() || !doc.startViewTransition) {
    apply()
    return
  }
  const root = document.documentElement
  root.classList.toggle("vt-forward", isNestedPath(nextPath) && !isNestedPath(previousPath))
  root.classList.toggle("vt-backward", isNestedPath(previousPath) && !isNestedPath(nextPath))
  // Быстрый следующий переход может отменить анимацию: состояние маршрута уже обновлено.
  const transition = doc.startViewTransition(apply)
  void transition.ready.catch(() => {})
  void transition.finished.catch(() => {})
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
 * `animate: false` — экран уже уехал жестом «назад», повторно его анимировать не нужно.
 */
export const goBack = (fallback: string, { animate = true }: { animate?: boolean } = {}) => {
  if (!animate) skipNextTransition = true
  if (routeChanges > 0) window.history.back()
  else navigate(fallback)
}

/** Память вида дашборда на время сессии: страница выхода и входа операции не должна её сбрасывать. */
export const dashboardMemory = { offset: 0, selected: null as string | null }
