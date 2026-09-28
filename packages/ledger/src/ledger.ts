import { APP_TIME_ZONE, todayIn, type IsoDate } from "@fin/domain"
import type { LedgerStore } from "./store"

export interface LedgerOptions {
  readonly store: LedgerStore
  /** Текущее время, мс. В тестах — фиксированное. */
  readonly now?: () => number
  readonly timeZone?: string
}

export interface DayGroup {
  readonly date: IsoDate
}

export interface Ledger {
  today(): IsoDate
  days(): ReadonlyArray<DayGroup>
}

export const openLedger = async (options: LedgerOptions): Promise<Ledger> => {
  const now = options.now ?? Date.now
  const timeZone = options.timeZone ?? APP_TIME_ZONE
  await options.store.load()
  return {
    today: () => todayIn(now(), timeZone),
    days: () => []
  }
}
