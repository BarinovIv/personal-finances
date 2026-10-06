import { memoryStore, openLedger } from "@fin/ledger"
import { createAuthApi, createSync, createUserDevice, type DeviceState, type Sync, type Transport } from "@fin/sync"
import { afterEach, expect, it, vi } from "vitest"
import { inProcessServer, PASSWORD, testClock, type InProcessServer } from "./support"

const running: Array<Sync> = []
let server: InProcessServer | undefined
afterEach(async () => {
  for (const sync of running.splice(0)) await sync.stop()
  vi.useRealTimers()
  await server?.close()
  server = undefined
})

const owner = { id: "owner", login: "owner", isOwner: true }
const friend = { id: "friend", login: "friend", isOwner: false }
const deferred = <A>() => {
  let resolve!: (value: A) => void
  const promise = new Promise<A>((done) => { resolve = done })
  return { promise, resolve }
}
const client = async (fetch: Transport["fetch"]) => {
  const ledger = await openLedger({ store: memoryStore() })
  await ledger.device.adopt(owner.id)
  await ledger.submit("сохранить 100", { categoryId: ledger.categories("expense")[0]!.id })
  const transport = { baseUrl: "http://app.test", fetch }
  const auth = createAuthApi(transport)
  const sync = createSync({ ledger, transport })
  running.push(sync)
  return { ledger, sync, device: createUserDevice({ ledger, auth, sync }) }
}

it("зависшая проверка открывает локальный журнал ровно через три секунды и прерывает запрос", async () => {
  vi.useFakeTimers()
  let request: Request | undefined
  const phone = await client((next) => {
    if (new URL(next.url).pathname === "/api/me") request = next
    return new Promise(() => {})
  })
  let result: DeviceState | undefined
  const checking = phone.device.checkSession().then((state) => { result = state })
  await vi.advanceTimersByTimeAsync(2_999)
  expect(result).toBeUndefined()
  expect(request?.signal.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(result).toEqual({ state: "offline" })
  expect(request?.signal.aborted).toBe(true)
  await checking
  expect(phone.ledger.days()[0]!.items[0]!.description).toBe("сохранить")
  expect(phone.ledger.pendingChanges()).toHaveLength(1)
  expect((await phone.ledger.submit("ещё 200", { categoryId: phone.ledger.categories("expense")[0]!.id })).ok).toBe(true)
  expect(phone.ledger.pendingChanges()).toHaveLength(2)
})

it("три секунды включают ожидание заголовков и чтение медленного тела ответа", async () => {
  vi.useFakeTimers()
  const headers = deferred<Response>()
  let request: Request | undefined
  let body!: ReadableStreamDefaultController<Uint8Array>
  const response = new Response(new ReadableStream<Uint8Array>({ start: (controller) => { body = controller } }))
  const phone = await client((next) => {
    if (new URL(next.url).pathname === "/api/me") {
      request = next
      return headers.promise
    }
    return new Promise(() => {})
  })
  let result: DeviceState | undefined
  const checking = phone.device.checkSession().then((state) => { result = state })
  await vi.advanceTimersByTimeAsync(2_000)
  headers.resolve(response)
  await vi.advanceTimersByTimeAsync(999)
  expect(result).toBeUndefined()
  await vi.advanceTimersByTimeAsync(1)
  expect(result).toEqual({ state: "offline" })
  expect(request?.signal.aborted).toBe(true)
  await checking
  body.enqueue(new TextEncoder().encode(JSON.stringify({ ok: true, user: friend })))
  body.close()
  await vi.advanceTimersByTimeAsync(0)
  expect(phone.device.state()).toEqual({ state: "offline" })
  expect(phone.ledger.device.owner()).toBe(owner.id)
  expect(phone.ledger.pendingChanges()).toHaveLength(1)
})

it.each([
  ["другой пользователь", () => Response.json({ ok: true, user: friend })],
  ["истёкший вход", () => Response.json({ error: "unauthorized" }, { status: 401 })],
  ["удалённый пользователь", () => Response.json({ error: "user-deleted" }, { status: 410 })]
] as const)("поздний ответ: %s не меняет результат нового входа и очередь", async (_name, lateResponse) => {
  vi.useFakeTimers()
  const late = deferred<Response>()
  const phone = await client((request) => {
    const path = new URL(request.url).pathname
    if (path === "/api/me") return late.promise
    if (path === "/api/login") return Promise.resolve(Response.json({ ok: true, user: owner }))
    return new Promise(() => {})
  })
  const checking = phone.device.checkSession()
  await vi.advanceTimersByTimeAsync(3_000)
  expect(await checking).toEqual({ state: "offline" })
  // В фоне уже начался зависший обмен; он также не удерживает новый вход.
  expect(await phone.device.login(owner.login, "пароль")).toEqual({ ok: true, user: owner })
  late.resolve(lateResponse())
  await vi.advanceTimersByTimeAsync(0)
  expect(phone.device.state()).toEqual({ state: "signed-in", user: owner })
  expect(phone.ledger.device.owner()).toBe(owner.id)
  expect(phone.ledger.days()[0]!.items[0]!.description).toBe("сохранить")
  expect(phone.ledger.pendingChanges()).toHaveLength(1)
})

it("зависший фоновый обмен прерывается, сохраняет очередь и возобновляется после восстановления связи", async () => {
  vi.useFakeTimers()
  let online = false
  let hanging: Request | undefined
  const phone = await client((request) => {
    if (online) return Promise.resolve(Response.json({ changes: [], cursor: 1, hasMore: false }))
    hanging = request
    return new Promise(() => {})
  })
  phone.sync.start()
  await vi.advanceTimersByTimeAsync(29_999)
  expect(phone.sync.status()).toMatchObject({ state: "pending", pending: 1, syncing: true })
  expect(hanging?.signal.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(hanging?.signal.aborted).toBe(true)
  expect(phone.sync.status()).toMatchObject({ state: "pending", pending: 1, syncing: false })
  online = true
  phone.sync.wake()
  await vi.advanceTimersByTimeAsync(300)
  expect(phone.sync.status()).toMatchObject({ state: "synced", pending: 0, syncing: false })
  expect(phone.ledger.days()[0]!.items[0]!.description).toBe("сохранить")
})

it.each(["login", "logout"] as const)("%s прерывает ручной обмен; его поздний ответ не возвращает прежние данные", async (action) => {
  vi.useFakeTimers()
  const late = deferred<Response>()
  let hanging: Request | undefined
  const phone = await client((request) => {
    const path = new URL(request.url).pathname
    if (path === "/api/login") return Promise.resolve(Response.json({ ok: true, user: friend }))
    if (path === "/api/logout") return Promise.resolve(Response.json({ ok: true }))
    if (!hanging) {
      hanging = request
      return late.promise
    }
    return new Promise(() => {})
  })
  const sent = phone.ledger.pendingChanges()
  const exchange = phone.sync.syncNow()
  await vi.advanceTimersByTimeAsync(0)
  expect(hanging?.signal.aborted).toBe(false)
  const result = action === "login"
    ? await phone.device.login(friend.login, "пароль", { confirmDiscard: true })
    : await phone.device.logout({ confirmDiscard: true })
  expect(result.ok).toBe(true)
  expect(hanging?.signal.aborted).toBe(true)
  expect(await exchange).toBe("offline")
  late.resolve(Response.json({ changes: sent, cursor: 99, hasMore: false }))
  await vi.advanceTimersByTimeAsync(0)
  expect(phone.ledger.device.owner()).toBe(action === "login" ? friend.id : null)
  expect(phone.ledger.days()).toEqual([])
  expect(phone.ledger.pendingChanges()).toEqual([])
  expect(phone.ledger.sync.cursor()).toBe(0)
})

it("подтверждённый 401 требует входа без повторной зависшей проверки и сохраняет очередь", async () => {
  vi.useFakeTimers()
  const phone = await client((request) => new URL(request.url).pathname === "/api/sync"
    ? Promise.resolve(Response.json({ error: "unauthorized" }, { status: 401 }))
    : new Promise(() => {}))
  expect(await phone.sync.syncNow()).toBe("unauthorized")
  expect(await phone.device.checkSession()).toEqual({ state: "signed-out" })
  expect(phone.ledger.pendingChanges()).toHaveLength(1)
  expect(phone.ledger.days()[0]!.items[0]!.description).toBe("сохранить")
})

it("повтор после потерянного ответа не дублирует уже принятую сервером операцию", async () => {
  server = await inProcessServer(testClock("2026-09-28T12:00:00+03:00"))
  const browser = server.device()
  const login = await createAuthApi(browser.transport).login("owner", PASSWORD)
  if (!login.ok) throw new Error(login.reason)
  const ledger = await openLedger({ store: memoryStore() })
  await ledger.device.adopt(login.user.id)
  await ledger.submit("сохранить 100", { categoryId: ledger.categories("expense")[0]!.id })
  const accepted = deferred<void>()
  const late = deferred<Response>()
  let first = true
  let response!: Response
  const sync = createSync({ ledger, transport: {
    ...browser.transport,
    fetch: async (request) => {
      const result = await browser.transport.fetch(request)
      if (first) {
        first = false
        response = result
        accepted.resolve()
        return late.promise
      }
      return result
    }
  } })
  running.push(sync)
  vi.useFakeTimers()
  const sending = sync.syncNow()
  await accepted.promise
  await vi.advanceTimersByTimeAsync(30_000)
  expect(await sending).toBe("offline")
  expect(ledger.pendingChanges()).toHaveLength(1)
  expect(await sync.syncNow()).toBe("ok")
  expect(ledger.pendingChanges()).toEqual([])
  const cursor = ledger.sync.cursor()
  late.resolve(response)
  await vi.advanceTimersByTimeAsync(0)
  expect(ledger.sync.cursor()).toBe(cursor)
  const otherBrowser = server.device()
  await createAuthApi(otherBrowser.transport).login("owner", PASSWORD)
  const otherLedger = await openLedger({ store: memoryStore() })
  const otherSync = createSync({ ledger: otherLedger, transport: otherBrowser.transport })
  running.push(otherSync)
  expect(await otherSync.syncNow()).toBe("ok")
  expect(otherLedger.days().flatMap((day) => day.items).map((operation) => operation.description)).toEqual(["сохранить"])
})
