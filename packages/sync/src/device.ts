import type { Ledger } from "@fin/ledger"
import type { ApiFailure, AuthApi, LoginResult, User, UserSession } from "./auth"
import type { Sync } from "./sync"

export type DeviceState = UserSession
export interface DiscardOptions { readonly confirmDiscard?: boolean }
export type DeviceResult = LoginResult | {
  readonly ok: false
  readonly reason: "pending-changes"
  readonly pending: number
  /** Вход уже выполнен: подтверждение завершается acceptUser без повторения одноразовой ссылки. */
  readonly user: User
}
export type LogoutResult = { readonly ok: true } |
  { readonly ok: false; readonly reason: "pending-changes"; readonly pending: number } | ApiFailure

/** Смена сессии и локальных данных выполняется как единая граница пользователя. */
export interface UserDevice {
  state(): DeviceState
  checkSession(): Promise<DeviceState>
  login(login: string, password: string, options?: DiscardOptions): Promise<DeviceResult>
  register(token: string, login: string, password: string, options?: DiscardOptions): Promise<DeviceResult>
  resetPassword(token: string, password: string, options?: DiscardOptions): Promise<DeviceResult>
  acceptUser(user: User, options?: DiscardOptions): Promise<DeviceResult>
  logout(options?: DiscardOptions): Promise<LogoutResult>
}

export interface UserDeviceOptions {
  readonly ledger: Ledger
  readonly auth: AuthApi
  readonly sync: Sync
}

export const createUserDevice = ({ ledger, auth, sync }: UserDeviceOptions): UserDevice => {
  let state: DeviceState = { state: ledger.device.owner() === null ? "signed-out" : "offline" }
  let revision = 0
  let changing: Promise<unknown> = Promise.resolve()
  // Быстрые повторные нажатия не могут одновременно сменить cookie и владельца очереди.
  const exclusive = <A>(action: () => Promise<A>): Promise<A> => {
    const result = changing.then(action, action)
    changing = result.catch(() => {})
    return result
  }
  const accept = async (user: User, options: DiscardOptions = {}): Promise<DeviceResult> => {
    const owner = ledger.device.owner()
    if (owner !== null && owner !== user.id) {
      const pending = ledger.pendingChanges().length
      if (pending > 0 && !options.confirmDiscard) {
        state = { state: "signed-out" }
        return { ok: false, reason: "pending-changes", pending, user }
      }
      await ledger.device.clear()
    }
    await ledger.device.adopt(user.id)
    if (owner !== user.id && !user.isOwner) await ledger.setDashboardMode("month")
    state = { state: "signed-in", user }
    sync.start()
    return { ok: true, user }
  }
  const authenticate = (action: () => Promise<LoginResult>, options?: DiscardOptions): Promise<DeviceResult> => {
    revision++
    return exclusive(async () => {
      await sync.stop()
      state = { state: "signed-out" }
      const result = await action()
      return result.ok ? accept(result.user, options) : result
    })
  }
  return {
    state: () => state,
    checkSession: async () => {
      const checking = ++revision
      let owner: string | null = null
      const shouldCheck = await exclusive(async () => {
        if (checking !== revision) return false
        await sync.stop()
        // Ответ 410 уже достаточен: повторный запрос мог бы не пройти после потери сети.
        if (sync.status().state === "user-deleted") {
          await ledger.device.clear()
          state = { state: "user-deleted" }
          return false
        }
        if (sync.status().state === "unauthorized") {
          state = { state: "signed-out" }
          return false
        }
        owner = ledger.device.owner()
        return true
      })
      if (!shouldCheck) return state
      // Сеть не удерживает очередь входа/выхода; поздний ответ относится только к прежней сессии.
      const session = await auth.me(owner ?? undefined)
      return exclusive(async () => {
        if (checking !== revision || owner !== ledger.device.owner()) return state
        if (session.state === "signed-in") {
          await accept(session.user)
        } else {
          state = session
          if (session.state === "user-deleted") await ledger.device.clear()
          if (session.state === "offline") sync.start()
        }
        return state
      })
    },
    login: (login, password, options) => authenticate(() => auth.login(login, password), options),
    register: (token, login, password, options) => authenticate(() => auth.register(token, login, password), options),
    resetPassword: (token, password, options) => authenticate(() => auth.resetPassword(token, password), options),
    acceptUser: (user, options) => {
      revision++
      return exclusive(async () => {
        await sync.stop()
        return accept(user, options)
      })
    },
    logout: (options = {}) => {
      revision++
      return exclusive(async () => {
        await sync.stop()
        const pending = ledger.pendingChanges().length
        if (pending > 0 && !options.confirmDiscard) {
          if (state.state === "signed-in" || state.state === "offline") sync.start()
          return { ok: false, reason: "pending-changes", pending }
        }
        const closed = await auth.logout()
        if (!closed.ok) {
          if (state.state === "signed-in" || state.state === "offline") sync.start()
          return closed
        }
        await ledger.device.clear()
        state = { state: "signed-out" }
        return { ok: true }
      })
    }
  }
}
