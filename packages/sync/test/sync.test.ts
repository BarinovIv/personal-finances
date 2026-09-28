import { memoryStore, openLedger, type Ledger } from "@fin/ledger"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createAuthApi, createSync, type Sync } from "@fin/sync"
import { inProcessServer, PASSWORD, testClock, type Device, type InProcessServer, type TestClock } from "./support"

let server: InProcessServer
const running: Array<Sync> = []
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()))
  await server.close()
})

const cafe = { categoryId: "cafe" }

/** Устройство с журналом, вошедшее на сервер. */
const signedInDevice = async (clock: TestClock, store = memoryStore()) => {
  const device = server.device()
  await createAuthApi(device.transport).login(PASSWORD)
  const ledger = await openLedger({ store, now: clock.now })
  const sync = createSync({ ledger, transport: device.transport, retry: { base: 5, max: 40 }, debounce: 1 })
  running.push(sync)
  return { device, ledger, sync, store }
}

const add = async (ledger: Ledger, line: string) => {
  const result = await ledger.submit(line, cafe)
  if (!result.ok) throw new Error(result.problems.join())
  return result.operation
}

const descriptions = (ledger: Ledger) => ledger.days().flatMap((d) => d.items.map((o) => `${o.description} ${o.amount}`))

describe("синхронизация", () => {
  it("операция с одного устройства приходит на другое", async () => {
    const clock = testClock("2026-09-28T12:00:00+03:00")
    server = await inProcessServer(clock)
    const phone = await signedInDevice(clock)
    const mac = await signedInDevice(clock)

    await add(phone.ledger, "кофе 250")
    expect(await phone.sync.syncNow()).toBe("ok")
    expect(phone.ledger.sync.pending()).toEqual([])
    expect(await mac.sync.syncNow()).toBe("ok")
    expect(descriptions(mac.ledger)).toEqual(["кофе 25000"])
  })

  it("телефон офлайн правит операцию, компьютер позже правит её же → везде версия компьютера", async () => {
    const clock = testClock("2026-09-28T12:00:00+03:00")
    server = await inProcessServer(clock)
    const phone = await signedInDevice(clock)
    const mac = await signedInDevice(clock)
    const op = await add(phone.ledger, "кофе 250")
    await phone.sync.syncNow()
    await mac.sync.syncNow()

    phone.device.online = false
    clock.advance(60_000)
    await phone.ledger.updateOperation(op.id, { amount: 30000 })
    expect(await phone.sync.syncNow()).toBe("offline")
    expect(phone.ledger.sync.pending()).toHaveLength(1)

    clock.advance(60_000)
    await mac.ledger.updateOperation(op.id, { amount: 50000 })
    await mac.sync.syncNow()

    phone.device.online = true
    expect(await phone.sync.syncNow()).toBe("ok")
    await mac.sync.syncNow()
    expect(phone.ledger.operation(op.id)!.amount).toBe(50000)
    expect(mac.ledger.operation(op.id)!.amount).toBe(50000)
    expect(phone.ledger.sync.pending()).toEqual([])
  })

  it("удалённая на одном устройстве операция не «воскресает» после синхронизации с другим", async () => {
    const clock = testClock("2026-09-28T12:00:00+03:00")
    server = await inProcessServer(clock)
    const phone = await signedInDevice(clock)
    const mac = await signedInDevice(clock)
    const op = await add(phone.ledger, "кофе 250")
    await phone.sync.syncNow()
    await mac.sync.syncNow()

    // компьютер правит офлайн, телефон удаляет позже
    mac.device.online = false
    clock.advance(60_000)
    await mac.ledger.updateOperation(op.id, { amount: 99900 })
    clock.advance(60_000)
    await phone.ledger.deleteOperation(op.id)
    await phone.sync.syncNow()

    mac.device.online = true
    await mac.sync.syncNow()
    await phone.sync.syncNow()
    expect(mac.ledger.operation(op.id)).toBeUndefined()
    expect(phone.ledger.operation(op.id)).toBeUndefined()
    expect(descriptions(mac.ledger)).toEqual([])
  })

  it("очередь изменений переживает перезагрузку", async () => {
    const clock = testClock("2026-09-28T12:00:00+03:00")
    server = await inProcessServer(clock)
    const phone = await signedInDevice(clock)
    phone.device.online = false
    await add(phone.ledger, "кофе 250")
    await phone.sync.syncNow()

    const reopened = await openLedger({ store: phone.store, now: clock.now })
    expect(reopened.sync.pending()).toHaveLength(1)
    phone.device.online = true
    const sync = createSync({ ledger: reopened, transport: phone.device.transport })
    expect(await sync.syncNow()).toBe("ok")

    const mac = await signedInDevice(clock)
    await mac.sync.syncNow()
    expect(descriptions(mac.ledger)).toEqual(["кофе 25000"])
  })

  it("истёкшая сессия → нужен вход, очередь не теряется", async () => {
    const clock = testClock("2026-09-28T12:00:00+03:00")
    server = await inProcessServer(clock)
    const phone = await signedInDevice(clock)
    clock.advance(184 * 24 * 3600_000)
    await add(phone.ledger, "кофе 250")

    expect(await phone.sync.syncNow()).toBe("unauthorized")
    expect(phone.sync.status().state).toBe("unauthorized")
    expect(phone.ledger.sync.pending()).toHaveLength(1)

    await createAuthApi(phone.device.transport).login(PASSWORD)
    expect(await phone.sync.syncNow()).toBe("ok")
    expect(phone.sync.status()).toMatchObject({ state: "synced", pending: 0 })
  })

  it("индикатор: «ждёт сети», пока есть неотправленное, потом «синхронизировано»", async () => {
    const clock = testClock("2026-09-28T12:00:00+03:00")
    server = await inProcessServer(clock)
    const phone = await signedInDevice(clock)
    expect(await phone.sync.syncNow()).toBe("ok")
    expect(phone.sync.status().state).toBe("synced")

    phone.device.online = false
    await add(phone.ledger, "кофе 250")
    expect(phone.sync.status()).toMatchObject({ state: "pending", pending: 1 })
    await phone.sync.syncNow()
    expect(phone.sync.status()).toMatchObject({ state: "pending", pending: 1 })

    phone.device.online = true
    await phone.sync.syncNow()
    expect(phone.sync.status()).toMatchObject({ state: "synced", pending: 0 })
  })

  it("в фоне: правка уходит сама; без сети — повторы с нарастающей паузой", async () => {
    const clock = testClock("2026-09-28T12:00:00+03:00")
    server = await inProcessServer(clock)
    const phone = await signedInDevice(clock)
    const mac = await signedInDevice(clock)

    let attempts = 0
    const realFetch = phone.device.transport.fetch
    ;(phone.device.transport as { fetch: typeof realFetch }).fetch = (request) => {
      attempts++
      return realFetch(request)
    }

    phone.device.online = false
    phone.sync.start()
    await add(phone.ledger, "кофе 250")
    // пауза 5, 10, 20, 40, 40… мс: за 300 мс — около десятка попыток, а не сотни
    await new Promise((r) => setTimeout(r, 300))
    expect(attempts).toBeGreaterThanOrEqual(4)
    expect(attempts).toBeLessThanOrEqual(12)
    expect(phone.sync.status().state).toBe("pending")

    phone.device.online = true
    await vi.waitFor(() => expect(phone.sync.status().state).toBe("synced"), { timeout: 2000 })
    await mac.sync.syncNow()
    expect(descriptions(mac.ledger)).toEqual(["кофе 25000"])
  })

  it("много изменений приходят за несколько обменов", async () => {
    const clock = testClock("2026-09-28T12:00:00+03:00")
    server = await inProcessServer(clock)
    const phone = await signedInDevice(clock)
    for (let i = 0; i < 1100; i++) await add(phone.ledger, `кофе ${i + 1}`)
    await phone.sync.syncNow()
    const mac = await signedInDevice(clock)
    await mac.sync.syncNow()
    expect(mac.ledger.days()[0]!.items).toHaveLength(1100)
  })
})
