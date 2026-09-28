import { SETTINGS_ID, type SettingsData } from "@fin/domain"
import type { LedgerContext } from "./context"
import type { PeriodMode } from "./periods"

export interface Settings {
  /** Дни зарплаты, по возрастанию. */
  readonly paydays: ReadonlyArray<number>
}

export const readSettings = (ctx: LedgerContext): Settings => ({ paydays: ctx.paydays() })

/** Дни зарплаты — числа месяца 1–31. Настройка синхронизируется. */
export const setPaydays = async (ctx: LedgerContext, days: ReadonlyArray<number>): Promise<{ ok: boolean }> => {
  const paydays = [...new Set(days)].sort((a, b) => a - b)
  if (paydays.length === 0 || paydays.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) return { ok: false }
  const data: SettingsData = { paydays }
  await ctx.records.write([{ collection: "settings", id: SETTINGS_ID, data }])
  return { ok: true }
}

const MODE = "dashboardMode"

/** Режим дашборда — настройка устройства, хранится локально. По умолчанию зарплатный период. */
export const dashboardMode = (ctx: LedgerContext): PeriodMode => ctx.records.getMeta<PeriodMode>(MODE) ?? "pay"

export const setDashboardMode = (ctx: LedgerContext, mode: PeriodMode) => ctx.records.saveMeta({ [MODE]: mode })
