import { afterEach, describe, expect, it } from "vitest"
import { createAuthApi } from "@fin/sync"
import { inProcessServer, PASSWORD, testClock, type InProcessServer } from "./support"

let server: InProcessServer
afterEach(() => server.close())

describe("вход с клиента", () => {
  it("без сессии — экран входа, после входа — приложение", async () => {
    server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
    const device = server.device()
    const auth = createAuthApi(device.transport)
    expect(await auth.checkSession()).toBe("signed-out")
    expect(await auth.login("не тот")).toEqual({ ok: false, reason: "wrong-password", attemptsLeft: 4 })
    const login = await auth.login("owner", PASSWORD)
    expect(login).toMatchObject({ ok: true, user: { login: "owner", isOwner: true } })
    if (login.ok) expect(await auth.me()).toEqual({ state: "signed-in", user: login.user })
    expect(await auth.checkSession()).toBe("signed-in")
  })

  it("без сети приложение не выкидывает на экран входа", async () => {
    server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
    const device = server.device()
    device.online = false
    expect(await createAuthApi(device.transport).checkSession()).toBe("offline")
  })

  it("блокировка сообщает, сколько ждать", async () => {
    server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
    const auth = createAuthApi(server.device().transport)
    for (let i = 0; i < 4; i++) await auth.login("нет")
    expect(await auth.login("нет")).toEqual({ ok: false, reason: "blocked", retryAfter: 900 })
  })

  it("устройства: отзыв сессии и выход", async () => {
    server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
    const phone = createAuthApi(server.device().transport)
    const mac = createAuthApi(server.device().transport)
    await phone.login(PASSWORD)
    await mac.login(PASSWORD)
    const sessions = (await mac.sessions())!
    expect(sessions).toHaveLength(2)
    const other = sessions.find((s) => !s.current)!
    expect(await mac.revokeSession(other.id)).toBe(true)
    expect(await phone.checkSession()).toBe("signed-out")
    await mac.logout()
    expect(await mac.checkSession()).toBe("signed-out")
  })
})
