import { memoryStore, openLedger, type Ledger, type LedgerStore } from "@fin/ledger"

/** Управляемые часы: время стоит, пока его не сдвинут. */
export const testClock = (iso: string) => {
  let now = Date.parse(iso)
  return {
    now: () => now,
    set: (next: string) => {
      now = Date.parse(next)
    },
    advance: (ms: number) => {
      now += ms
    }
  }
}

export type TestClock = ReturnType<typeof testClock>

/** Журнал «на телефоне» 28 сентября 2026, днём по Москве. */
export const makeLedger = async (options: { store?: LedgerStore; clock?: TestClock } = {}) => {
  const store = options.store ?? memoryStore()
  const clock = options.clock ?? testClock("2026-09-28T12:00:00+03:00")
  const ledger = await openLedger({ store, now: clock.now })
  return { ledger, store, clock, reopen: () => openLedger({ store, now: clock.now }) }
}

/** Сохраняет строку ввода; падает, если не сохранилась. */
export const add = async (ledger: Ledger, line: string, choice: Parameters<Ledger["submit"]>[1] = {}) => {
  const result = await ledger.submit(line, choice)
  if (!result.ok) throw new Error(`«${line}» не сохранилась: ${result.problems.join(", ")}`)
  return result.operation
}

export const categoryId = (ledger: Ledger, name: string) => {
  const found = [...ledger.categories("expense"), ...ledger.categories("income")].find((c) => c.name === name)
  if (!found) throw new Error(`Нет категории «${name}»`)
  return found.id
}
