import {
  Invitation, InvitationInfo, InvitationList, SessionList, UserList, UserResponse,
  type ApiError, type SessionInfo, type User, type UserInfo
} from "@fin/protocol"
import { Effect, Schema } from "effect"
import { request, type RequestError, type Transport } from "./http"

export type ApiFailureReason = ApiError["error"] | "offline" | "error"
export type ApiFailure =
  | { readonly ok: false; readonly reason: "wrong-password"; readonly attemptsLeft: number }
  | { readonly ok: false; readonly reason: "blocked"; readonly retryAfter: number }
  | { readonly ok: false; readonly reason: Exclude<ApiFailureReason, "wrong-password" | "blocked"> }
export type ApiResult<A> = { readonly ok: true; readonly value: A } | ApiFailure
export type LoginResult = { readonly ok: true; readonly user: User } | ApiFailure
export type SessionState = "signed-in" | "signed-out" | "offline" | "user-deleted"
export type UserSession = { readonly state: "signed-in"; readonly user: User } |
  { readonly state: "signed-out" | "offline" | "user-deleted" }
export type { Invitation, InvitationInfo, SessionInfo, User, UserInfo }
export interface PasswordResetInfo {
  readonly login: string
  readonly expiresAt: number
}

/** Вход, приглашения и устройства — обычные функции поверх HTTP API. */
export interface AuthApi {
  checkSession(): Promise<SessionState>
  me(userId?: string): Promise<UserSession>
  /** Один аргумент поддерживает устройства владельца до обновления. */
  login(login: string, password?: string): Promise<LoginResult>
  logout(): Promise<ApiResult<void>>
  sessions(): Promise<ReadonlyArray<SessionInfo> | null>
  revokeSession(id: string): Promise<boolean>
  register(token: string, login: string, password: string): Promise<LoginResult>
  invitation(token: string): Promise<ApiResult<InvitationInfo>>
  invitations(): Promise<ApiResult<ReadonlyArray<InvitationInfo>>>
  createInvitation(): Promise<ApiResult<Invitation>>
  revokeInvitation(id: string): Promise<ApiResult<void>>
  users(): Promise<ApiResult<ReadonlyArray<UserInfo>>>
  createPasswordReset(userId: string): Promise<ApiResult<Invitation>>
  resetLink(token: string): Promise<ApiResult<PasswordResetInfo>>
  resetPassword(token: string, password: string): Promise<LoginResult>
  changePassword(currentPassword: string, newPassword: string): Promise<ApiResult<void>>
  deleteUser(id: string): Promise<ApiResult<void>>
}

const Ok = Schema.Struct({ ok: Schema.Literal(true) })
const PasswordReset = Schema.Struct({ login: Schema.String, expiresAt: Schema.Number })
const failure = (error: RequestError): ApiFailure => {
  if (error._tag === "Offline") return { ok: false, reason: "offline" }
  if (error._tag === "Unauthorized") return { ok: false, reason: "unauthorized" }
  if (error._tag === "UserDeleted") return { ok: false, reason: "user-deleted" }
  const body = error.body
  if (body?.error === "wrong-password") return { ok: false, reason: "wrong-password", attemptsLeft: body.attemptsLeft ?? 0 }
  if (body?.error === "blocked") return { ok: false, reason: "blocked", retryAfter: body.retryAfter ?? 0 }
  return { ok: false, reason: body?.error ?? "error" }
}

export const createAuthApi = (transport: Transport): AuthApi => {
  const call = <A, I>(method: string, path: string, schema: Schema.Schema<A, I>, body?: unknown, timeout?: number): Promise<ApiResult<A>> =>
    request(transport, method, path, schema, body, timeout).pipe(
      Effect.map((value): ApiResult<A> => ({ ok: true, value })),
      Effect.catchAll((error) => Effect.succeed<ApiResult<A>>(failure(error))),
      Effect.runPromise
    )
  const userCall = async (path: string, body: unknown): Promise<LoginResult> => {
    const result = await call("POST", path, UserResponse, body)
    return result.ok ? { ok: true, user: result.value.user } : result
  }
  const emptyCall = async (method: string, path: string, body?: unknown): Promise<ApiResult<void>> => {
    const result = await call(method, path, Ok, body)
    return result.ok ? { ok: true, value: undefined } : result
  }
  const me = async (userId?: string): Promise<UserSession> => {
    const result = await call("GET", `/api/me${userId ? `?userId=${encodeURIComponent(userId)}` : ""}`, UserResponse, undefined, 3_000)
    return result.ok ? { state: "signed-in", user: result.value.user }
      : { state: result.reason === "user-deleted" ? "user-deleted"
        : result.reason === "unauthorized" ? "signed-out" : "offline" }
  }
  return {
    me,
    checkSession: async () => (await me()).state,
    login: (login, password) => userCall("/api/login", password === undefined ? { password: login } : { login, password }),
    logout: () => emptyCall("POST", "/api/logout"),
    sessions: async () => {
      const result = await call("GET", "/api/sessions", SessionList)
      return result.ok ? result.value.sessions : null
    },
    revokeSession: async (id) => (await emptyCall("DELETE", `/api/sessions/${encodeURIComponent(id)}`)).ok,
    register: (token, login, password) => userCall("/api/register", { token, login, password }),
    invitation: (token) => call("GET", `/api/invitations/${encodeURIComponent(token)}`, InvitationInfo),
    invitations: async () => {
      const result = await call("GET", "/api/invitations", InvitationList)
      return result.ok ? { ok: true, value: result.value.invitations } : result
    },
    createInvitation: () => call("POST", "/api/invitations", Invitation),
    revokeInvitation: (id) => emptyCall("DELETE", `/api/invitations/${encodeURIComponent(id)}`),
    users: async () => {
      const result = await call("GET", "/api/users", UserList)
      return result.ok ? { ok: true, value: result.value.users } : result
    },
    createPasswordReset: (id) => call("POST", `/api/users/${encodeURIComponent(id)}/reset-password`, Invitation),
    resetLink: (token) => call("GET", `/api/reset-password/${encodeURIComponent(token)}`, PasswordReset),
    resetPassword: (token, password) => userCall("/api/reset-password", { token, password }),
    changePassword: (currentPassword, newPassword) => emptyCall("POST", "/api/password", { currentPassword, newPassword }),
    deleteUser: (id) => emptyCall("DELETE", `/api/users/${encodeURIComponent(id)}`)
  }
}
