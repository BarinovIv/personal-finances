import type { LedgerStore, StoredState } from "./store"

const RECORDS = "records"
const OUTBOX = "outbox"
const META = "meta"

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

const open = (name: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore(RECORDS)
      db.createObjectStore(OUTBOX)
      db.createObjectStore(META)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

/** Хранилище журнала в IndexedDB браузера. */
export const indexedDbStore = (name = "finances"): LedgerStore => {
  let db: Promise<IDBDatabase> | undefined
  const database = () => (db ??= open(name))

  return {
    load: async (): Promise<StoredState> => {
      const tx = (await database()).transaction([RECORDS, OUTBOX, META], "readonly")
      const [records, outbox, metaKeys, metaValues] = await Promise.all([
        request(tx.objectStore(RECORDS).getAll()),
        request(tx.objectStore(OUTBOX).getAllKeys()),
        request(tx.objectStore(META).getAllKeys()),
        request(tx.objectStore(META).getAll())
      ])
      const meta: Record<string, unknown> = {}
      metaKeys.forEach((key, i) => {
        meta[String(key)] = metaValues[i]
      })
      return { records, outbox: outbox.map(String), meta }
    },

    save: async (change) => {
      const tx = (await database()).transaction([RECORDS, OUTBOX, META], "readwrite")
      const records = tx.objectStore(RECORDS)
      const outbox = tx.objectStore(OUTBOX)
      const meta = tx.objectStore(META)
      for (const { key, value } of change.records ?? []) records.put(value, key)
      for (const key of change.outboxAdd ?? []) outbox.put(true, key)
      for (const key of change.outboxRemove ?? []) outbox.delete(key)
      for (const [key, value] of Object.entries(change.meta ?? {})) meta.put(value, key)
      await done(tx)
    }
  }
}
