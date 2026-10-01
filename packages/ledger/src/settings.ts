import { isTimeZone, SETTINGS_ID, type PeriodMode, type SettingsData } from "@fin/domain"
import type { LedgerContext } from "./context"

export interface Settings {
  /** Дни зарплаты, по возрастанию. */
  readonly paydays: ReadonlyArray<number>
  readonly timeZone: string
}

export const readSettings = (ctx: LedgerContext): Settings => ({ paydays: ctx.paydays(), timeZone: ctx.timeZone() })

/** Дни зарплаты — числа месяца 1–31. Настройка синхронизируется. */
export const setPaydays = async (ctx: LedgerContext, days: ReadonlyArray<number>): Promise<{ ok: boolean }> => {
  const paydays = [...new Set(days)].sort((a, b) => a - b)
  if (paydays.length === 0 || paydays.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) return { ok: false }
  const current = ctx.records.get("settings", SETTINGS_ID)
  const data: SettingsData = { ...(current && !current.deleted ? current.data : {}), paydays }
  await ctx.records.write([{ collection: "settings", id: SETTINGS_ID, data }])
  return { ok: true }
}

/** IANA-часовой пояс пользователя, общий для всех его устройств. */
export const setTimeZone = async (ctx: LedgerContext, timeZone: string): Promise<{ ok: boolean }> => {
  if (!isTimeZone(timeZone)) return { ok: false }
  await ctx.records.write([{ collection: "settings", id: SETTINGS_ID, data: { ...readSettings(ctx), timeZone } }])
  return { ok: true }
}

const MODE = "dashboardMode"

/** Режим дашборда — настройка устройства, хранится локально. По умолчанию зарплатный период. */
export const dashboardMode = (ctx: LedgerContext): PeriodMode => ctx.records.getMeta<PeriodMode>(MODE) ?? "pay"

export const setDashboardMode = (ctx: LedgerContext, mode: PeriodMode) => ctx.records.saveMeta({ [MODE]: mode })
