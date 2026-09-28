import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { LoginRequest, type ApiError, type SessionInfo } from "@fin/protocol"
import { Clock, Duration, Effect, Option, Schema } from "effect"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { AppConfig } from "./config"
import { Db } from "./db"
import { deviceName } from "./device"
import { hashPassword, verifyPassword } from "./password"

export const SESSION_COOKIE = "sid"
/** Сессия живёт полгода. */
export const SESSION_TTL = Duration.days(183)
export const MAX_FAILURES = 5
export const BLOCK_DURATION = Duration.minutes(15)

export const apiError = (status: number, body: ApiError) => HttpServerResponse.unsafeJson(body, { status })

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex")

/** Пароль задаётся переменной окружения; в базе хранится только его хэш. */
export const ensurePassword = Effect.gen(function* () {
  const { password } = yield* AppConfig
  const db = yield* Db
  if (Option.isNone(password)) {
    const row = yield* db.get<{ password_hash: string | null }>("SELECT password_hash FROM auth WHERE id = 1")
    if (!row?.password_hash) yield* Effect.logWarning("APP_PASSWORD не задан — войти в приложение не получится")
    return
  }
  const row = yield* db.get<{ password_hash: string | null }>("SELECT password_hash FROM auth WHERE id = 1")
  const same = row?.password_hash ? yield* verifyPassword(password.value, row.password_hash) : false
  if (!same) {
    const hash = yield* hashPassword(password.value)
    yield* db.run("UPDATE auth SET password_hash = ? WHERE id = 1", hash)
  }
})

interface AuthRow {
  password_hash: string | null
  failures: number
  blocked_until: number
}

const sessionCookie = (response: HttpServerResponse.HttpServerResponse, token: string) =>
  Effect.gen(function* () {
    const { secureCookies } = yield* AppConfig
    return HttpServerResponse.unsafeSetCookie(response, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL
    })
  })

const clearSessionCookie = (response: HttpServerResponse.HttpServerResponse) =>
  Effect.gen(function* () {
    const { secureCookies } = yield* AppConfig
    return HttpServerResponse.expireCookie(response, SESSION_COOKIE, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "strict",
      path: "/"
    })
  })

const login = Effect.gen(function* () {
  const db = yield* Db
  const request = yield* HttpServerRequest.HttpServerRequest
  const body = yield* HttpServerRequest.schemaBodyJson(LoginRequest).pipe(Effect.option)
  if (Option.isNone(body)) return apiError(400, { error: "bad-request" })
  const now = yield* Clock.currentTimeMillis

  return yield* db.transaction(
    Effect.gen(function* () {
      const state = (yield* db.get<AuthRow>("SELECT password_hash, failures, blocked_until FROM auth WHERE id = 1"))!
      if (state.blocked_until > now) {
        return apiError(429, { error: "blocked", retryAfter: Math.ceil((state.blocked_until - now) / 1000) })
      }
      // блокировка закончилась — счётчик с нуля
      const failures = state.blocked_until > 0 ? 0 : state.failures
      const ok = state.password_hash ? yield* verifyPassword(body.value.password, state.password_hash) : false

      if (!ok) {
        const next = failures + 1
        if (next >= MAX_FAILURES) {
          const until = now + Duration.toMillis(BLOCK_DURATION)
          yield* db.run("UPDATE auth SET failures = 0, blocked_until = ? WHERE id = 1", until)
          return apiError(429, { error: "blocked", retryAfter: Math.ceil((until - now) / 1000) })
        }
        yield* db.run("UPDATE auth SET failures = ?, blocked_until = 0 WHERE id = 1", next)
        return apiError(401, { error: "wrong-password", attemptsLeft: MAX_FAILURES - next })
      }

      yield* db.run("UPDATE auth SET failures = 0, blocked_until = 0 WHERE id = 1")
      const token = randomBytes(32).toString("base64url")
      yield* db.run(
        "INSERT INTO sessions (id, token_hash, device, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
        randomUUID(),
        tokenHash(token),
        deviceName(request.headers["user-agent"]),
        now,
        now,
        now + Duration.toMillis(SESSION_TTL)
      )
      return yield* sessionCookie(HttpServerResponse.unsafeJson({ ok: true }), token)
    })
  )
})

export interface Session {
  readonly id: string
}

/** Сессия запроса по cookie, если она есть и не истекла. Отмечает время последней активности. */
const currentSession = Effect.gen(function* () {
  const db = yield* Db
  const request = yield* HttpServerRequest.HttpServerRequest
  const token = request.cookies[SESSION_COOKIE]
  if (!token) return null
  const now = yield* Clock.currentTimeMillis
  const row = yield* db.get<{ id: string }>(
    "SELECT id FROM sessions WHERE token_hash = ? AND expires_at > ?",
    tokenHash(token),
    now
  )
  if (!row) return null
  yield* db.run("UPDATE sessions SET last_seen_at = ? WHERE id = ?", now, row.id)
  return { id: row.id } satisfies Session
})

/** Обработчик только для вошедших: без сессии — 401. */
export const withSession = <E, R>(
  handler: (session: Session) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
) =>
  Effect.gen(function* () {
    const session = yield* currentSession
    if (!session) return apiError(401, { error: "unauthorized" })
    return yield* handler(session)
  })

const listSessions = withSession((session) =>
  Effect.gen(function* () {
    const db = yield* Db
    const now = yield* Clock.currentTimeMillis
    const rows = yield* db.all<{ id: string; device: string; last_seen_at: number }>(
      "SELECT id, device, last_seen_at FROM sessions WHERE expires_at > ? ORDER BY last_seen_at DESC",
      now
    )
    const sessions: Array<SessionInfo> = rows.map((r) => ({
      id: r.id,
      device: r.device,
      lastActiveAt: r.last_seen_at,
      current: r.id === session.id
    }))
    return HttpServerResponse.unsafeJson({ sessions })
  })
)

const revokeSession = withSession((session) =>
  Effect.gen(function* () {
    const db = yield* Db
    const { id } = yield* HttpRouter.schemaPathParams(Schema.Struct({ id: Schema.String })).pipe(Effect.orDie)
    yield* db.run("DELETE FROM sessions WHERE id = ?", id)
    const response = HttpServerResponse.unsafeJson({ ok: true })
    return id === session.id ? yield* clearSessionCookie(response) : response
  })
)

const logout = Effect.gen(function* () {
  const db = yield* Db
  const request = yield* HttpServerRequest.HttpServerRequest
  const token = request.cookies[SESSION_COOKIE]
  if (token) yield* db.run("DELETE FROM sessions WHERE token_hash = ?", tokenHash(token))
  return yield* clearSessionCookie(HttpServerResponse.unsafeJson({ ok: true }))
})

export const authRoutes = HttpRouter.empty.pipe(
  HttpRouter.post("/api/login", login),
  HttpRouter.post("/api/logout", logout),
  HttpRouter.get(
    "/api/me",
    withSession(() => Effect.succeed(HttpServerResponse.unsafeJson({ ok: true })))
  ),
  HttpRouter.get("/api/sessions", listSessions),
  HttpRouter.del("/api/sessions/:id", revokeSession)
)
