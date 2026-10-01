import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { PasswordResetRequest, RegisterRequest } from "@fin/protocol"
import { Clock, Duration, Effect, Option, Schema } from "effect"
import { randomBytes, randomUUID } from "node:crypto"
import { apiError, createSession, normalizeLogin, publicUser, tokenHash, withOwner, type UserRow } from "./auth"
import { Db } from "./db"
import { hashPassword } from "./password"

interface InvitationRow { id: string; expires_at: number; used_at: number | null; revoked_at: number | null }
interface ResetRow { id: string; user_id: string; expires_at: number; used_at: number | null }

const invitationError = (row: InvitationRow | undefined, now: number) =>
  !row ? "not-found" : row.used_at !== null ? "invitation-used" : row.revoked_at !== null ? "invitation-revoked" : row.expires_at <= now ? "invitation-expired" : null
const resetError = (row: ResetRow | undefined, now: number) =>
  !row ? "reset-invalid" : row.used_at !== null ? "reset-used" : row.expires_at <= now ? "reset-expired" : null

const makeUserRoutes = () => {
  const createInvitation = withOwner((session) => Effect.gen(function* () {
    const db = yield* Db
    const now = yield* Clock.currentTimeMillis
    const id = randomUUID()
    const token = randomBytes(32).toString("base64url")
    const expiresAt = now + Duration.toMillis(Duration.days(7))
    yield* db.run("INSERT INTO invitations(id, token_hash, created_by, expires_at) VALUES (?, ?, ?, ?)", id, tokenHash(token), session.userId, expiresAt)
    return HttpServerResponse.unsafeJson({ id, token, expiresAt })
  }))

  const inspectInvitation = Effect.gen(function* () {
    const db = yield* Db
    const { token } = yield* HttpRouter.schemaPathParams(Schema.Struct({ token: Schema.String })).pipe(Effect.orDie)
    const row = yield* db.get<InvitationRow>("SELECT * FROM invitations WHERE token_hash = ?", tokenHash(token))
    const error = invitationError(row, yield* Clock.currentTimeMillis)
    return error ? apiError(400, { error }) : HttpServerResponse.unsafeJson({ id: row!.id, expiresAt: row!.expires_at })
  })

  const listInvitations = withOwner(() => Effect.gen(function* () {
    const db = yield* Db
    const rows = yield* db.all<InvitationRow>("SELECT * FROM invitations WHERE used_at IS NULL AND revoked_at IS NULL ORDER BY expires_at")
    return HttpServerResponse.unsafeJson({ invitations: rows.map((row) => ({ id: row.id, expiresAt: row.expires_at })) })
  }))

  const revokeInvitation = withOwner(() => Effect.gen(function* () {
    const db = yield* Db
    const { id } = yield* HttpRouter.schemaPathParams(Schema.Struct({ id: Schema.String })).pipe(Effect.orDie)
    const row = yield* db.get<InvitationRow>("SELECT * FROM invitations WHERE id = ? AND used_at IS NULL", id)
    if (!row) return apiError(404, { error: "not-found" })
    yield* db.run("UPDATE invitations SET revoked_at = ? WHERE id = ?", yield* Clock.currentTimeMillis, id)
    return HttpServerResponse.unsafeJson({ ok: true })
  }))

  const register = Effect.gen(function* () {
    const db = yield* Db
    const body = yield* HttpServerRequest.schemaBodyJson(RegisterRequest).pipe(Effect.option)
    if (Option.isNone(body) || body.value.password.length === 0) return apiError(400, { error: "bad-request" })
    const login = normalizeLogin(body.value.login)
    if (!/^[a-z0-9_-]{3,32}$/.test(login)) return apiError(400, { error: "invalid-login" })
    const now = yield* Clock.currentTimeMillis
    return yield* db.transaction(Effect.gen(function* () {
      const row = yield* db.get<InvitationRow>("SELECT * FROM invitations WHERE token_hash = ?", tokenHash(body.value.token))
      const error = invitationError(row, now)
      if (error) return apiError(400, { error })
      if (yield* db.get("SELECT id FROM users WHERE login = ?", login)) return apiError(409, { error: "login-taken" })
      const id = randomUUID()
      const hash = yield* hashPassword(body.value.password)
      yield* db.run("INSERT INTO users(id, login, password_hash, created_at) VALUES (?, ?, ?, ?)", id, login, hash, now)
      yield* db.run("UPDATE invitations SET used_at = ?, used_by = ? WHERE id = ?", now, id, row!.id)
      return yield* createSession({ id, login, isOwner: false })
    }))
  })

  const listUsers = withOwner(() => Effect.gen(function* () {
    const db = yield* Db
    const rows = yield* db.all<UserRow & { created_at: number; last_active_at: number | null }>("SELECT * FROM users WHERE deleted_at IS NULL ORDER BY is_owner DESC, created_at, login")
    return HttpServerResponse.unsafeJson({ users: rows.map((row) => ({ ...publicUser(row), createdAt: row.created_at, lastActiveAt: row.last_active_at })) })
  }))

  const createReset = withOwner(() => Effect.gen(function* () {
    const db = yield* Db
    const { id: userId } = yield* HttpRouter.schemaPathParams(Schema.Struct({ id: Schema.String })).pipe(Effect.orDie)
    if (!(yield* db.get("SELECT id FROM users WHERE id = ? AND deleted_at IS NULL", userId))) return apiError(404, { error: "not-found" })
    const id = randomUUID()
    const token = randomBytes(32).toString("base64url")
    const expiresAt = (yield* Clock.currentTimeMillis) + Duration.toMillis(Duration.hours(24))
    yield* db.run("INSERT INTO password_resets(id, token_hash, user_id, expires_at) VALUES (?, ?, ?, ?)", id, tokenHash(token), userId, expiresAt)
    return HttpServerResponse.unsafeJson({ id, token, expiresAt })
  }))

  const inspectReset = Effect.gen(function* () {
    const db = yield* Db
    const { token } = yield* HttpRouter.schemaPathParams(Schema.Struct({ token: Schema.String })).pipe(Effect.orDie)
    const row = yield* db.get<ResetRow & { login: string }>("SELECT password_resets.*, users.login FROM password_resets JOIN users ON users.id = user_id WHERE token_hash = ? AND deleted_at IS NULL", tokenHash(token))
    const error = resetError(row, yield* Clock.currentTimeMillis)
    return error ? apiError(400, { error }) : HttpServerResponse.unsafeJson({ login: row!.login, expiresAt: row!.expires_at })
  })

  const resetPassword = Effect.gen(function* () {
    const db = yield* Db
    const body = yield* HttpServerRequest.schemaBodyJson(PasswordResetRequest).pipe(Effect.option)
    if (Option.isNone(body) || body.value.password.length === 0) return apiError(400, { error: "bad-request" })
    const now = yield* Clock.currentTimeMillis
    return yield* db.transaction(Effect.gen(function* () {
      const row = yield* db.get<ResetRow>("SELECT password_resets.* FROM password_resets JOIN users ON users.id = user_id WHERE token_hash = ? AND deleted_at IS NULL", tokenHash(body.value.token))
      const error = resetError(row, now)
      if (error) return apiError(400, { error })
      yield* db.run("UPDATE users SET password_hash = ? WHERE id = ?", yield* hashPassword(body.value.password), row!.user_id)
      // Любая выданная до сброса ссылка также теряет силу.
      yield* db.run("UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL", now, row!.user_id)
      yield* db.run("DELETE FROM sessions WHERE user_id = ?", row!.user_id)
      const user = (yield* db.get<UserRow>("SELECT * FROM users WHERE id = ?", row!.user_id))!
      yield* db.run("DELETE FROM login_attempts WHERE login = ?", user.login)
      return yield* createSession(publicUser(user))
    }))
  })

  const deleteUser = withOwner(() => Effect.gen(function* () {
    const db = yield* Db
    const { id } = yield* HttpRouter.schemaPathParams(Schema.Struct({ id: Schema.String })).pipe(Effect.orDie)
    return yield* db.transaction(Effect.gen(function* () {
      const row = yield* db.get<UserRow>("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", id)
      if (!row) return apiError(404, { error: "not-found" })
      if (row.is_owner === 1) return apiError(400, { error: "cannot-delete-owner" })
      yield* db.run("INSERT OR IGNORE INTO deleted_sessions(token_hash) SELECT token_hash FROM session_tokens WHERE user_id = ?", id)
      yield* db.run("DELETE FROM session_tokens WHERE user_id = ?", id)
      yield* db.run("DELETE FROM sessions WHERE user_id = ?", id)
      yield* db.run("DELETE FROM records WHERE user_id = ?", id)
      yield* db.run("DELETE FROM invitations WHERE created_by = ? OR used_by = ?", id, id)
      yield* db.run("DELETE FROM password_resets WHERE user_id = ?", id)
      yield* db.run("DELETE FROM login_attempts WHERE login = ?", row.login)
      yield* db.run("UPDATE users SET deleted_at = ?, password_hash = NULL, last_active_at = NULL WHERE id = ?", yield* Clock.currentTimeMillis, id)
      return HttpServerResponse.unsafeJson({ ok: true })
    }))
  }))

  return HttpRouter.empty.pipe(
    HttpRouter.post("/api/invitations", createInvitation),
    HttpRouter.get("/api/invitations", listInvitations),
    HttpRouter.del("/api/invitations/:id", revokeInvitation),
    HttpRouter.get("/api/invitations/:token", inspectInvitation),
    HttpRouter.post("/api/register", register),
    HttpRouter.get("/api/users", listUsers),
    HttpRouter.post("/api/users/:id/reset-password", createReset),
    HttpRouter.del("/api/users/:id", deleteUser),
    HttpRouter.get("/api/reset-password/:token", inspectReset),
    HttpRouter.post("/api/reset-password", resetPassword)
  )
}

export const userRoutes = makeUserRoutes()
