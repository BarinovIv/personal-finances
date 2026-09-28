import { Schema } from "effect"

export const LoginRequest = Schema.Struct({ password: Schema.String })
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
  error: Schema.Literal("unauthorized", "wrong-password", "blocked", "bad-request", "not-found"),
  /** Для `blocked` — через сколько секунд можно пробовать снова. */
  retryAfter: Schema.optional(Schema.Number),
  /** Для `wrong-password` — сколько попыток осталось до блокировки. */
  attemptsLeft: Schema.optional(Schema.Number)
})
export type ApiError = typeof ApiError.Type
