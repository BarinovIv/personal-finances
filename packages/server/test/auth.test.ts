import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, TestClock } from "effect"
import { appConfigLayer, Db, dbMemory, makeWebHandler, SESSION_COOKIE } from "@fin/server"
import { MAC_CHROME_UA, testServer } from "./support"

const PASSWORD = "верный-пароль"
const start = TestClock.setTime(Date.parse("2026-09-28T09:00:00Z"))

describe("вход по паролю и сессии", () => {
  it.scoped("без сессии API отвечает 401", () =>
    Effect.gen(function* () {
      yield* start
      const server = yield* testServer()
      for (const [method, path] of [
        ["GET", "/api/me"],
        ["GET", "/api/sessions"],
        ["DELETE", "/api/sessions/x"]
      ] as const) {
        const res = yield* server.request(method, path)
        expect(res.status).toBe(401)
        expect(res.json).toEqual({ error: "unauthorized" })
      }
    }))

  it.scoped("вход ставит cookie сессии: httpOnly, Secure, SameSite=Strict, полгода", () =>
    Effect.gen(function* () {
      yield* start
      const server = yield* testServer()
      const res = yield* server.post("/api/login", { password: PASSWORD })
      expect(res.status).toBe(200)
      const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`))!
      expect(cookie).toMatch(/HttpOnly/i)
      expect(cookie).toMatch(/Secure/i)
      expect(cookie).toMatch(/SameSite=Strict/i)
      expect(cookie).toMatch(/Path=\//)
      expect(cookie).toMatch(new RegExp(`Max-Age=${183 * 24 * 3600}`))
      expect((yield* server.get("/api/me")).status).toBe(200)
    }))

  it.scoped("неверный пароль — 401 и сколько попыток осталось", () =>
    Effect.gen(function* () {
      yield* start
      const server = yield* testServer()
      const res = yield* server.post("/api/login", { password: "не тот" })
      expect(res.status).toBe(401)
      expect(res.json).toEqual({ error: "wrong-password", attemptsLeft: 4 })
      expect((yield* server.get("/api/me")).status).toBe(401)
    }))

  it.scoped("5 неверных паролей подряд → блокировка на 15 минут, после неё снова можно войти", () =>
    Effect.gen(function* () {
      yield* start
      const server = yield* testServer()
      for (let i = 0; i < 4; i++) expect((yield* server.post("/api/login", { password: "нет" })).status).toBe(401)
      const fifth = yield* server.post("/api/login", { password: "нет" })
      expect(fifth.status).toBe(429)
      expect(fifth.json).toEqual({ error: "blocked", retryAfter: 900 })

      // даже верный пароль не пускает
      yield* TestClock.adjust("14 minutes")
      const blocked = yield* server.post("/api/login", { password: PASSWORD })
      expect(blocked.status).toBe(429)
      expect(blocked.json).toEqual({ error: "blocked", retryAfter: 60 })

      yield* TestClock.adjust("1 minute")
      expect((yield* server.post("/api/login", { password: PASSWORD })).status).toBe(200)
    }))

  it.scoped("после блокировки счётчик начинается заново, удачный вход его сбрасывает", () =>
    Effect.gen(function* () {
      yield* start
      const server = yield* testServer()
      for (let i = 0; i < 5; i++) yield* server.post("/api/login", { password: "нет" })
      yield* TestClock.adjust("15 minutes")
      const wrong = yield* server.post("/api/login", { password: "нет" })
      expect(wrong.json).toEqual({ error: "wrong-password", attemptsLeft: 4 })

      for (let i = 0; i < 3; i++) yield* server.post("/api/login", { password: "нет" })
      expect((yield* server.post("/api/login", { password: PASSWORD })).status).toBe(200)
      const after = yield* server.device().post("/api/login", { password: "нет" })
      expect(after.json).toEqual({ error: "wrong-password", attemptsLeft: 4 })
    }))

  it.scoped("сессия живёт полгода", () =>
    Effect.gen(function* () {
      yield* start
      const server = yield* testServer()
      yield* server.post("/api/login", { password: PASSWORD })
      yield* TestClock.adjust("182 days")
      expect((yield* server.get("/api/me")).status).toBe(200)
      yield* TestClock.adjust("1 day")
      expect((yield* server.get("/api/me")).status).toBe(401)
    }))

  it.scoped("список устройств: название по user agent и время последней активности", () =>
    Effect.gen(function* () {
      yield* start
      const phone = yield* testServer()
      const mac = phone.device(MAC_CHROME_UA)
      yield* phone.post("/api/login", { password: PASSWORD })
      yield* TestClock.adjust("1 minute")
      yield* mac.post("/api/login", { password: PASSWORD })
      yield* TestClock.adjust("1 hour")
      yield* phone.get("/api/me")

      const res = yield* mac.get("/api/sessions")
      expect(res.json.sessions).toEqual([
        {
          id: expect.any(String),
          device: "iPhone · Safari",
          lastActiveAt: Date.parse("2026-09-28T10:01:00Z"),
          current: false
        },
        {
          id: expect.any(String),
          // запрос /api/sessions — тоже активность
          device: "Mac · Chrome",
          lastActiveAt: Date.parse("2026-09-28T10:01:00Z"),
          current: true
        }
      ])
    }))

  it.scoped("отзыв сессии сразу разлогинивает это устройство", () =>
    Effect.gen(function* () {
      yield* start
      const phone = yield* testServer()
      const mac = phone.device(MAC_CHROME_UA)
      yield* phone.post("/api/login", { password: PASSWORD })
      yield* mac.post("/api/login", { password: PASSWORD })
      const { sessions } = (yield* mac.get("/api/sessions")).json
      const phoneSession = sessions.find((s: any) => !s.current)

      expect((yield* mac.request("DELETE", `/api/sessions/${phoneSession.id}`)).status).toBe(200)
      expect((yield* phone.get("/api/me")).status).toBe(401)
      expect((yield* mac.get("/api/me")).status).toBe(200)
    }))

  it.scoped("выход на этом устройстве", () =>
    Effect.gen(function* () {
      yield* start
      const server = yield* testServer()
      yield* server.post("/api/login", { password: PASSWORD })
      yield* server.post("/api/logout")
      expect((yield* server.get("/api/me")).status).toBe(401)
    }))

  it.scoped("в базе хранится только хэш пароля; смена переменной окружения меняет пароль", () =>
    Effect.gen(function* () {
      yield* start
      const server = yield* testServer({ password: Option.some("новый-пароль") })
      expect((yield* server.post("/api/login", { password: PASSWORD })).status).toBe(401)
      expect((yield* server.post("/api/login", { password: "новый-пароль" })).status).toBe(200)
    }))
})

describe("хранилище", () => {
  it.scoped("пароль не лежит в базе открытым текстом", () =>
    Effect.gen(function* () {
      const db = yield* Db
      yield* makeWebHandler.pipe(
        Effect.provide(appConfigLayer({ staticDir: ".", password: Option.some(PASSWORD), secureCookies: true, telegram: Option.none() }))
      )
      const row = yield* db.get<{ password_hash: string }>("SELECT password_hash FROM auth")
      expect(row!.password_hash).toMatch(/^scrypt\$/)
      expect(row!.password_hash).not.toContain(PASSWORD)
    }).pipe(Effect.provide(dbMemory)))
})
