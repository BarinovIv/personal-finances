import { indexedDbStore, openLedger, type Ledger } from "@fin/ledger"
import { useEffect, useState } from "preact/hooks"

let ledgerPromise: Promise<Ledger> | undefined

/** Журнал на этом устройстве (IndexedDB). */
export const getLedger = () => (ledgerPromise ??= openLedger({ store: indexedDbStore() }))

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
