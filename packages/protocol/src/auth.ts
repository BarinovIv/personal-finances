import { Schema } from "effect"

export const LoginRequest = Schema.Struct({ login: Schema.optional(Schema.String), password: Schema.String })
export type LoginRequest = typeof LoginRequest.Type

/** Устройство с активной сессией. */
export const SessionInfo = Schema.Struct({
  id: Schema.String,
  /** «iPhone · Safari» — по user agent. */
  device: Schema.String,
  lastActiveAt: Schema.Number,
  current: Schema.Boolean
})
export type SessionInfo = typeof SessionInfo.Type

export const SessionList = Schema.Struct({ sessions: Schema.Array(SessionInfo) })
export type SessionList = typeof SessionList.Type

export const ApiError = Schema.Struct({
  error: Schema.Literal("unauthorized", "wrong-password", "blocked", "bad-request", "not-found", "forbidden", "user-deleted", "invalid-login", "login-taken", "invitation-used", "invitation-expired", "invitation-revoked", "reset-used", "reset-expired", "reset-invalid", "cannot-delete-owner"),
  /** Для `blocked` — через сколько секунд можно пробовать снова. */
  retryAfter: Schema.optional(Schema.Number),
  /** Для `wrong-password` — сколько попыток осталось до блокировки. */
  attemptsLeft: Schema.optional(Schema.Number)
})
export type ApiError = typeof ApiError.Type

export const User = Schema.Struct({ id: Schema.String, login: Schema.String, isOwner: Schema.Boolean })
export type User = typeof User.Type
export const UserResponse = Schema.Struct({ ok: Schema.Literal(true), user: User })
export type UserResponse = typeof UserResponse.Type
export const RegisterRequest = Schema.Struct({ token: Schema.String, login: Schema.String, password: Schema.String })
export type RegisterRequest = typeof RegisterRequest.Type
export const PasswordChangeRequest = Schema.Struct({ currentPassword: Schema.String, newPassword: Schema.String })
export type PasswordChangeRequest = typeof PasswordChangeRequest.Type
export const PasswordResetRequest = Schema.Struct({ token: Schema.String, password: Schema.String })
export type PasswordResetRequest = typeof PasswordResetRequest.Type
export const Invitation = Schema.Struct({ id: Schema.String, token: Schema.String, expiresAt: Schema.Number })
export type Invitation = typeof Invitation.Type
export const InvitationInfo = Schema.Struct({ id: Schema.String, expiresAt: Schema.Number })
export type InvitationInfo = typeof InvitationInfo.Type
export const InvitationList = Schema.Struct({ invitations: Schema.Array(InvitationInfo) })
export type InvitationList = typeof InvitationList.Type
export const UserInfo = Schema.Struct({ ...User.fields, createdAt: Schema.Number, lastActiveAt: Schema.NullOr(Schema.Number) })
export type UserInfo = typeof UserInfo.Type
export const UserList = Schema.Struct({ users: Schema.Array(UserInfo) })
export type UserList = typeof UserList.Type
