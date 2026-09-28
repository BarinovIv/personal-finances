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

/** Текущий маршрут из hash: `#/`, `#/dashboard`, `#/op/<id>`. */
export const useRoute = () => {
  const read = () => window.location.hash.replace(/^#/, "") || "/"
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return route
}

export const navigate = (path: string) => {
  window.location.hash = path
}
