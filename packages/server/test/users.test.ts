import { describe, expect, it } from "@effect/vitest"
import { appConfigLayer, dbMemory, makeWebHandler } from "@fin/server"
import { Effect, Fiber, Layer, TestClock } from "effect"
import { defaultConfig, IPHONE_UA, makeClient, testServer } from "./support"
import { jumpClock } from "./clock"

const start = TestClock.setTime(Date.parse("2026-09-28T09:00:00Z"))

describe("пользователи", () => {
  it.scoped("удаление дожидается начатой синхронизации и не позволяет воскресить учёт", () => Effect.gen(function* () {
    yield* start
    const context = yield* Layer.build(Layer.merge(appConfigLayer(defaultConfig), dbMemory))
    const handler = yield* makeWebHandler.pipe(Effect.provide(context))
    let releaseBody!: () => void
    const bodyRelease = new Promise<void>((resolve) => { releaseBody = resolve })
    let markBodyRead!: () => void
    const bodyRead = new Promise<void>((resolve) => { markBodyRead = resolve })
    const owner = makeClient(async (request) => {
      if (new URL(request.url).pathname !== "/api/sync") return handler(request)
      const bytes = new TextEncoder().encode(await request.text())
      const body = new ReadableStream<Uint8Array>({ pull(controller) {
        markBodyRead()
        return bodyRelease.then(() => { controller.enqueue(bytes); controller.close() })
      } }, { highWaterMark: 0 })
      return handler(new Request(request.url, { method: request.method, headers: request.headers, body, duplex: "half" } as RequestInit))
    }, IPHONE_UA)
    yield* owner.post("/api/login", { password: "верный-пароль" })
    const token = (yield* owner.post("/api/invitations")).json.token
    const friend = owner.device()
    const user = (yield* friend.post("/api/register", { token, login: "friend", password: "pw" })).json.user
    const synchronizing = yield* Effect.forkScoped(friend.post("/api/sync", {
      cursor: 0, changes: [{ collection: "settings", id: "main", updatedAt: 100, deleted: false, data: { paydays: [5] } }]
    }))
    yield* Effect.promise(() => bodyRead)
    let deletionFinished = false
    const deleting = yield* Effect.forkScoped(owner.request("DELETE", `/api/users/${user.id}`).pipe(Effect.tap(() => Effect.sync(() => { deletionFinished = true }))))
    yield* Effect.promise(() => new Promise<void>((resolve) => setImmediate(resolve)))
    expect(deletionFinished).toBe(false)
    releaseBody()
    expect((yield* Fiber.join(synchronizing)).status).toBe(200)
    expect((yield* Fiber.join(deleting)).status).toBe(200)
    expect((yield* friend.get("/api/me")).status).toBe(410)
    expect((yield* friend.post("/api/sync", { cursor: 0, changes: [] })).status).toBe(410)
  }))

  it.scoped("одновременное принятие приглашения создаёт ровно одного пользователя", () => Effect.gen(function* () {
    yield* start
    const owner = yield* testServer()
    yield* owner.post("/api/login", { password: "верный-пароль" })
    const token = (yield* owner.post("/api/invitations")).json.token
    const responses = yield* Effect.all([
      owner.device().post("/api/register", { token, login: "first", password: "pw" }),
      owner.device().post("/api/register", { token, login: "second", password: "pw" })
    ], { concurrency: "unbounded" })
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400])
    expect(responses.find((r) => r.status === 400)!.json.error).toBe("invitation-used")
    expect((yield* owner.get("/api/users")).json.users).toHaveLength(2)
  }))

  it.scoped("владелец входит по логину без учёта регистра и получает свою идентичность", () =>
    Effect.gen(function* () {
      yield* start
      const server = yield* testServer({ login: "Ivan" })
      const response = yield* server.post("/api/login", { login: "IVAN", password: "верный-пароль" })
      expect(response.json).toEqual({ ok: true, user: { id: "owner", login: "ivan", isOwner: true } })
      expect((yield* server.get("/api/me")).json).toEqual(response.json)
    }))

  it.scoped("приглашение создаёт отдельный учёт: одинаковые id не смешивают данные и устройства", () =>
    Effect.gen(function* () {
      yield* start
      const owner = yield* testServer()
      yield* owner.post("/api/login", { login: "owner", password: "верный-пароль" })
      const invitation = yield* owner.post("/api/invitations")
      expect(invitation.status).toBe(200)
      const friend = owner.device()
      const registered = yield* friend.post("/api/register", { token: invitation.json.token, login: "Friend", password: "пароль-друга" })
      expect(registered.status).toBe(200)
      expect(registered.json.user).toMatchObject({ login: "friend", isOwner: false })
      expect((yield* friend.post("/api/invitations")).status).toBe(403)
      const own = { collection: "settings", id: "main", updatedAt: 100, deleted: false, data: { paydays: [5] } }
      const other = { ...own, data: { paydays: [] } }
      expect((yield* owner.post("/api/sync", { cursor: 0, changes: [own] })).status).toBe(200)
      expect((yield* friend.post("/api/sync", { cursor: 0, changes: [other] })).status).toBe(200)
      expect((yield* owner.post("/api/sync", { cursor: 0, changes: [] })).json.changes).toEqual([own])
      expect((yield* friend.post("/api/sync", { cursor: 0, changes: [] })).json.changes).toEqual([other])
      const another = owner.device()
      expect((yield* another.post("/api/login", { login: "FRIEND", password: "пароль-друга" })).status).toBe(200)
      const ownerSession = (yield* owner.get("/api/sessions")).json.sessions[0].id
      expect((yield* another.request("DELETE", `/api/sessions/${ownerSession}`)).status).toBe(404)
      expect((yield* owner.get("/api/me")).status).toBe(200)
      expect((yield* friend.get("/api/sessions")).json.sessions).toHaveLength(2)
    }))

  it.scoped("владелец видит приглашения, отзывает их; одноразовые и просроченные ссылки различимы", () =>
    Effect.gen(function* () {
      yield* start
      const clock = yield* jumpClock
      const owner = yield* testServer()
      yield* owner.post("/api/login", { password: "верный-пароль" })
      const first = (yield* owner.post("/api/invitations")).json
      expect((yield* owner.get("/api/invitations")).json.invitations).toEqual([{ id: first.id, expiresAt: first.expiresAt }])
      yield* owner.request("DELETE", `/api/invitations/${first.id}`)
      expect((yield* owner.device().get(`/api/invitations/${first.token}`)).json.error).toBe("invitation-revoked")
      const second = (yield* owner.post("/api/invitations")).json
      const friend = owner.device()
      expect((yield* friend.post("/api/register", { token: second.token, login: "x!", password: "pw" })).json.error).toBe("invalid-login")
      expect((yield* friend.post("/api/register", { token: second.token, login: "OWNER", password: "pw" })).json.error).toBe("login-taken")
      expect((yield* friend.post("/api/register", { token: second.token, login: "friend", password: "pw" })).status).toBe(200)
      expect((yield* owner.device().get(`/api/invitations/${second.token}`)).json.error).toBe("invitation-used")
      expect((yield* owner.get("/api/invitations")).json.invitations).toEqual([])
      const third = (yield* owner.post("/api/invitations")).json
      yield* clock.advance("7 days")
      expect((yield* owner.device().get(`/api/invitations/${third.token}`)).json.error).toBe("invitation-expired")
    }))

  it.scoped("пользователь меняет пароль, блокировки разных логинов не мешают друг другу", () =>
    Effect.gen(function* () {
      yield* start
      const owner = yield* testServer()
      yield* owner.post("/api/login", { password: "верный-пароль" })
      const token = (yield* owner.post("/api/invitations")).json.token
      const friend = owner.device()
      yield* friend.post("/api/register", { token, login: "friend", password: "old" })
      expect((yield* friend.post("/api/password", { currentPassword: "bad", newPassword: "new" })).json.error).toBe("wrong-password")
      expect((yield* friend.post("/api/password", { currentPassword: "old", newPassword: "new" })).status).toBe(200)
      expect((yield* owner.device().post("/api/login", { login: "FRIEND", password: "old" })).status).toBe(401)
      expect((yield* owner.device().post("/api/login", { login: "friend", password: "new" })).status).toBe(200)
      for (let i = 0; i < 5; i++) yield* owner.device().post("/api/login", { login: "missing", password: "bad" })
      expect((yield* owner.device().post("/api/login", { login: "MISSING", password: "bad" })).json).toEqual({ error: "blocked", retryAfter: 900 })
      expect((yield* owner.device().post("/api/login", { login: "friend", password: "new" })).status).toBe(200)
      expect((yield* owner.device().post("/api/login", { login: "owner", password: "верный-пароль" })).status).toBe(200)
    }))

  it.scoped("владелец помогает сбросить пароль: одноразовая ссылка закрывает все прежние сессии", () =>
    Effect.gen(function* () {
      yield* start
      const owner = yield* testServer()
      yield* owner.post("/api/login", { password: "верный-пароль" })
      const token = (yield* owner.post("/api/invitations")).json.token
      const phone = owner.device()
      const user = (yield* phone.post("/api/register", { token, login: "friend", password: "old" })).json.user
      const laptop = owner.device()
      yield* laptop.post("/api/login", { login: "friend", password: "old" })
      expect((yield* phone.get("/api/users")).status).toBe(403)
      const users = (yield* owner.get("/api/users")).json.users
      expect(users).toEqual(expect.arrayContaining([{ ...user, createdAt: Date.parse("2026-09-28T09:00:00Z"), lastActiveAt: Date.parse("2026-09-28T09:00:00Z") }]))
      const reset = yield* owner.post(`/api/users/${user.id}/reset-password`)
      expect(reset.status).toBe(200)
      const fresh = owner.device()
      expect((yield* fresh.get(`/api/reset-password/${reset.json.token}`)).json).toMatchObject({ login: "friend" })
      const changed = yield* fresh.post("/api/reset-password", { token: reset.json.token, password: "new" })
      expect(changed.json).toEqual({ ok: true, user })
      expect((yield* phone.get("/api/me")).status).toBe(401)
      expect((yield* laptop.get("/api/me")).status).toBe(401)
      expect((yield* fresh.get("/api/me")).status).toBe(200)
      expect((yield* fresh.post("/api/reset-password", { token: reset.json.token, password: "another" })).json.error).toBe("reset-used")
      expect((yield* owner.device().post("/api/login", { login: "friend", password: "old" })).status).toBe(401)
      expect((yield* owner.device().post("/api/login", { login: "friend", password: "new" })).status).toBe(200)
    }))

  it.scoped("ссылка сброса перестаёт действовать ровно через сутки и не меняет пароль", () => Effect.gen(function* () {
    yield* start
    const clock = yield* jumpClock
    const owner = yield* testServer()
    yield* owner.post("/api/login", { password: "верный-пароль" })
    const token = (yield* owner.post("/api/invitations")).json.token
    const friend = owner.device()
    const user = (yield* friend.post("/api/register", { token, login: "friend", password: "old" })).json.user
    const reset = (yield* owner.post(`/api/users/${user.id}/reset-password`)).json
    yield* clock.advance("23 hours")
    expect((yield* owner.device().get(`/api/reset-password/${reset.token}`)).status).toBe(200)
    yield* clock.advance("1 hour")
    expect((yield* owner.device().get(`/api/reset-password/${reset.token}`)).json.error).toBe("reset-expired")
    expect((yield* owner.device().post("/api/reset-password", { token: reset.token, password: "new" })).json.error).toBe("reset-expired")
    expect((yield* owner.device().post("/api/login", { login: "friend", password: "old" })).status).toBe(200)
  }))

  it.scoped("удаление очищает учёт и ссылки, сохраняет логин занятым и сообщает устройствам об удалении", () =>
    Effect.gen(function* () {
      yield* start
      const owner = yield* testServer()
      yield* owner.post("/api/login", { password: "верный-пароль" })
      const token = (yield* owner.post("/api/invitations")).json.token
      const friend = owner.device()
      const user = (yield* friend.post("/api/register", { token, login: "friend", password: "pw" })).json.user
      const record = { collection: "settings", id: "main", updatedAt: 100, deleted: false, data: { paydays: [5] } }
      yield* friend.post("/api/sync", { cursor: 0, changes: [record] })
      const reset = (yield* owner.post(`/api/users/${user.id}/reset-password`)).json
      const revoked = owner.device()
      yield* revoked.post("/api/login", { login: "friend", password: "pw" })
      const revokedId = (yield* revoked.get("/api/sessions")).json.sessions.find((s: any) => s.current).id
      yield* friend.request("DELETE", `/api/sessions/${revokedId}`)
      expect((yield* revoked.get("/api/me")).status).toBe(401)
      expect((yield* friend.request("DELETE", `/api/users/${user.id}`)).status).toBe(403)
      expect((yield* owner.request("DELETE", "/api/users/owner")).json.error).toBe("cannot-delete-owner")
      expect((yield* owner.request("DELETE", `/api/users/${user.id}`)).status).toBe(200)
      expect((yield* friend.get("/api/me")).json).toEqual({ error: "user-deleted" })
      expect((yield* owner.device().get(`/api/me?userId=${user.id}`)).json).toEqual({ error: "user-deleted" })
      expect((yield* revoked.get("/api/me")).status).toBe(410)
      expect((yield* friend.post("/api/sync", { cursor: 0, changes: [] })).status).toBe(410)
      expect((yield* owner.get("/api/users")).json.users.map((u: any) => u.login)).toEqual(["owner"])
      expect((yield* owner.device().post("/api/reset-password", { token: reset.token, password: "new" })).json.error).toBe("reset-invalid")
      expect((yield* owner.device().get(`/api/invitations/${token}`)).json.error).toBe("not-found")
      const freshToken = (yield* owner.post("/api/invitations")).json.token
      expect((yield* owner.device().post("/api/register", { token: freshToken, login: "FRIEND", password: "new" })).json.error).toBe("login-taken")
      expect((yield* owner.post("/api/sync", { cursor: 0, changes: [] })).json.changes).toEqual([])
    }))
})
