import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { LoginRequest, PasswordChangeRequest, type ApiError, type SessionInfo, type User } from "@fin/protocol"
import { Clock, Duration, Effect, Option, Schema } from "effect"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { AppConfig } from "./config"
import { Db } from "./db"
import { deviceName } from "./device"
import { hashPassword, verifyPassword } from "./password"

export const SESSION_COOKIE = "sid"
export const SESSION_TTL = Duration.days(183)
export const MAX_FAILURES = 5
export const BLOCK_DURATION = Duration.minutes(15)
export const apiError = (status: number, body: ApiError) => HttpServerResponse.unsafeJson(body, { status })
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex")
export const normalizeLogin = (login: string) => login.toLowerCase()

export interface UserRow {
  id: string
  login: string
  is_owner: number
  password_hash: string | null
  deleted_at: number | null
}
export const publicUser = (row: UserRow): User => ({ id: row.id, login: row.login, isOwner: row.is_owner === 1 })

/** Переменная окружения переопределяет пароль только при изменении её значения. */
export const ensurePassword = Effect.gen(function* () {
  const { password, login = "owner" } = yield* AppConfig
  const db = yield* Db
  const now = yield* Clock.currentTimeMillis
  yield* db.transaction(Effect.gen(function* () {
    const row = (yield* db.get<{ password_hash: string | null; env_password_hash: string | null; created_at: number }>(
      "SELECT users.password_hash, auth.env_password_hash, users.created_at FROM auth JOIN users ON users.id = 'owner' WHERE auth.id = 1"
    ))!
    if (row.created_at === 0) {
      const normalized = normalizeLogin(login)
      if (!/^[a-z0-9_-]{3,32}$/.test(normalized)) return yield* Effect.dieMessage("APP_LOGIN должен содержать 3–32 символа: латиница, цифры, _ или -")
      yield* db.run("UPDATE users SET login = ?, created_at = ? WHERE id = 'owner'", normalized, now)
    }
    if (Option.isNone(password)) {
      if (!row.password_hash) yield* Effect.logWarning("APP_PASSWORD не задан — войти в приложение не получится")
      return
    }
    const same = row.env_password_hash ? yield* verifyPassword(password.value, row.env_password_hash) : false
    if (!same) {
      const hash = yield* hashPassword(password.value)
      yield* db.run("UPDATE users SET password_hash = ? WHERE id = 'owner'", hash)
      yield* db.run("UPDATE auth SET password_hash = ?, env_password_hash = ? WHERE id = 1", hash, hash)
    }
  }))
})

export const createSession = (user: User) => Effect.gen(function* () {
  const db = yield* Db
  const request = yield* HttpServerRequest.HttpServerRequest
  const { secureCookies } = yield* AppConfig
  const now = yield* Clock.currentTimeMillis
  const token = randomBytes(32).toString("base64url")
  yield* db.run("INSERT INTO sessions (id, token_hash, device, created_at, last_seen_at, expires_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    randomUUID(), tokenHash(token), deviceName(request.headers["user-agent"]), now, now, now + Duration.toMillis(SESSION_TTL), user.id)
  yield* db.run("INSERT INTO session_tokens(token_hash,user_id) VALUES (?,?)", tokenHash(token), user.id)
  yield* db.run("UPDATE users SET last_active_at = ? WHERE id = ?", now, user.id)
  return HttpServerResponse.unsafeSetCookie(HttpServerResponse.unsafeJson({ ok: true, user }), SESSION_COOKIE, token, {
    httpOnly: true, secure: secureCookies, sameSite: "strict", path: "/", maxAge: SESSION_TTL
  })
})

const clearSessionCookie = (response: HttpServerResponse.HttpServerResponse) => Effect.gen(function* () {
  const { secureCookies } = yield* AppConfig
  return HttpServerResponse.expireCookie(response, SESSION_COOKIE, { httpOnly: true, secure: secureCookies, sameSite: "strict", path: "/" })
})

const login = Effect.gen(function* () {
  const db = yield* Db
  const body = yield* HttpServerRequest.schemaBodyJson(LoginRequest).pipe(Effect.option)
  if (Option.isNone(body)) return apiError(400, { error: "bad-request" })
  const owner = (yield* db.get<UserRow>("SELECT * FROM users WHERE id = 'owner'"))!
  const name = normalizeLogin(body.value.login ?? owner.login)
  const now = yield* Clock.currentTimeMillis
  return yield* db.transaction(Effect.gen(function* () {
    yield* db.run("INSERT OR IGNORE INTO login_attempts(login) VALUES (?)", name)
    const state = (yield* db.get<{ failures: number; blocked_until: number }>("SELECT * FROM login_attempts WHERE login = ?", name))!
    if (state.blocked_until > now) return apiError(429, { error: "blocked", retryAfter: Math.ceil((state.blocked_until - now) / 1000) })
    const row = yield* db.get<UserRow>("SELECT * FROM users WHERE login = ? AND deleted_at IS NULL", name)
    // Неизвестный логин проходит ту же дорогую проверку хэша.
    const hash = row?.password_hash ?? owner.password_hash
    const verified = hash ? yield* verifyPassword(body.value.password, hash) : false
    if (!row || !verified) {
      const next = (state.blocked_until > 0 ? 0 : state.failures) + 1
      if (next >= MAX_FAILURES) {
        yield* db.run("UPDATE login_attempts SET failures = 0, blocked_until = ? WHERE login = ?", now + Duration.toMillis(BLOCK_DURATION), name)
        return apiError(429, { error: "blocked", retryAfter: Duration.toSeconds(BLOCK_DURATION) })
      }
      yield* db.run("UPDATE login_attempts SET failures = ?, blocked_until = 0 WHERE login = ?", next, name)
      return apiError(401, { error: "wrong-password", attemptsLeft: MAX_FAILURES - next })
    }
    yield* db.run("UPDATE login_attempts SET failures = 0, blocked_until = 0 WHERE login = ?", name)
    return yield* createSession(publicUser(row))
  }))
})

export interface Session { readonly id: string; readonly userId: string; readonly user: User }

export const withSession = <E, R>(handler: (session: Session) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
  Effect.gen(function* () {
    const db = yield* Db
    return yield* db.transaction(Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const token = request.cookies[SESSION_COOKIE]
      if (!token) return apiError(401, { error: "unauthorized" })
      const hash = tokenHash(token)
      if (yield* db.get("SELECT token_hash FROM deleted_sessions WHERE token_hash = ?", hash)) return apiError(410, { error: "user-deleted" })
      const now = yield* Clock.currentTimeMillis
      const row = yield* db.get<UserRow & { session_id: string }>(
        "SELECT users.*, sessions.id AS session_id FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ? AND deleted_at IS NULL", hash, now)
      if (!row) return apiError(401, { error: "unauthorized" })
      yield* db.run("UPDATE sessions SET last_seen_at = ? WHERE id = ?", now, row.session_id)
      yield* db.run("UPDATE users SET last_active_at = ? WHERE id = ?", now, row.id)
      return yield* handler({ id: row.session_id, userId: row.id, user: publicUser(row) })
    }))
  })

export const withOwner = <E, R>(handler: (session: Session) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
  withSession((session) => session.user.isOwner ? handler(session) : Effect.succeed(apiError(403, { error: "forbidden" })))

const listSessions = withSession((session) => Effect.gen(function* () {
  const db = yield* Db
  const now = yield* Clock.currentTimeMillis
  const rows = yield* db.all<{ id: string; device: string; last_seen_at: number }>(
    "SELECT id, device, last_seen_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC", session.userId, now)
  const sessions: Array<SessionInfo> = rows.map((r) => ({ id: r.id, device: r.device, lastActiveAt: r.last_seen_at, current: r.id === session.id }))
  return HttpServerResponse.unsafeJson({ sessions })
}))

const revokeSession = withSession((session) => Effect.gen(function* () {
  const db = yield* Db
  const { id } = yield* HttpRouter.schemaPathParams(Schema.Struct({ id: Schema.String })).pipe(Effect.orDie)
  if (!(yield* db.get("SELECT id FROM sessions WHERE id = ? AND user_id = ?", id, session.userId))) return apiError(404, { error: "not-found" })
  yield* db.run("DELETE FROM sessions WHERE id = ? AND user_id = ?", id, session.userId)
  const response = HttpServerResponse.unsafeJson({ ok: true })
  return id === session.id ? yield* clearSessionCookie(response) : response
}))

const changePassword = withSession((session) => Effect.gen(function* () {
  const db = yield* Db
  const body = yield* HttpServerRequest.schemaBodyJson(PasswordChangeRequest).pipe(Effect.option)
  if (Option.isNone(body) || body.value.newPassword.length === 0) return apiError(400, { error: "bad-request" })
  return yield* db.transaction(Effect.gen(function* () {
    const row = yield* db.get<UserRow>("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", session.userId)
    if (!row) return apiError(410, { error: "user-deleted" })
    if (!row.password_hash || !(yield* verifyPassword(body.value.currentPassword, row.password_hash))) return apiError(401, { error: "wrong-password" })
    yield* db.run("UPDATE users SET password_hash = ? WHERE id = ?", yield* hashPassword(body.value.newPassword), session.userId)
    return HttpServerResponse.unsafeJson({ ok: true })
  }))
}))

const logout = Effect.gen(function* () {
  const db = yield* Db
  const request = yield* HttpServerRequest.HttpServerRequest
  const token = request.cookies[SESSION_COOKIE]
  if (token) yield* db.run("DELETE FROM sessions WHERE token_hash = ?", tokenHash(token))
  return yield* clearSessionCookie(HttpServerResponse.unsafeJson({ ok: true }))
})

/** Даже устройство с истёкшим cookie узнаёт об удалении своего локального пользователя. */
const me = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const userId = new URL(request.url, "http://localhost").searchParams.get("userId")
  if (userId) {
    const db = yield* Db
    if (yield* db.get("SELECT id FROM users WHERE id = ? AND deleted_at IS NOT NULL", userId)) return apiError(410, { error: "user-deleted" })
  }
  return yield* withSession((session) => Effect.succeed(HttpServerResponse.unsafeJson({ ok: true, user: session.user })))
})

export const authRoutes = HttpRouter.empty.pipe(
  HttpRouter.post("/api/login", login), HttpRouter.post("/api/logout", logout),
  HttpRouter.get("/api/me", me),
  HttpRouter.get("/api/sessions", listSessions), HttpRouter.del("/api/sessions/:id", revokeSession),
  HttpRouter.post("/api/password", changePassword)
)
