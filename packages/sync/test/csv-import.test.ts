import { memoryStore, openLedger } from "@fin/ledger"
import { createAuthApi, createSync } from "@fin/sync"
import { expect, it } from "vitest"
import { inProcessServer, PASSWORD, testClock } from "./support"

it("CSV с офлайн-телефона восстанавливает только новые операции и синхронизируется без повторных дублей", async () => {
  const clock = testClock("2026-10-18T12:00:00+03:00")
  const server = await inProcessServer(clock)
  const source = await openLedger({ store: memoryStore(), now: clock.now })
  const device = server.device()
  const secondDevice = server.device()
  const restoredStore = memoryStore()
  const restored = await openLedger({ store: restoredStore, now: clock.now })
  const other = await openLedger({ store: memoryStore(), now: clock.now })
  const sync = createSync({ ledger: restored, transport: device.transport })
  const otherSync = createSync({ ledger: other, transport: secondDevice.transport })
  try {
    await createAuthApi(device.transport).login(PASSWORD)
    await createAuthApi(secondDevice.transport).login(PASSWORD)
    expect((await source.submit("кофе 250", { categoryId: "cafe" })).ok).toBe(true)
    expect((await restored.submit("кофе 250", { categoryId: "cafe" })).ok).toBe(true)
    expect(await sync.syncNow()).toBe("ok")
    // Ещё один такой же кофе — отдельная покупка во время недоступности сервера.
    expect((await source.submit("кофе 250", { categoryId: "cafe" })).ok).toBe(true)
    expect((await source.submit("такси 500")).ok).toBe(true)
    const csv = source.exportCsv()
    expect(restored.previewCsv(csv)).toMatchObject({ ok: true, added: 2, duplicates: 1 })
    expect(await restored.importCsv(csv)).toMatchObject({ ok: true, added: 2, duplicates: 1 })
    expect(await sync.syncNow()).toBe("ok")
    expect(restored.pendingChanges()).toEqual([])
    expect(await otherSync.syncNow()).toBe("ok")
    expect(other.exportCsv()).toBe(restored.exportCsv())
    // Повторная выгрузка после перезапуска также не создаёт операции заново.
    const reopened = await openLedger({ store: restoredStore, now: clock.now })
    expect(await reopened.importCsv(csv)).toMatchObject({ ok: true, added: 0, duplicates: 3 })
    expect(reopened.pendingChanges()).toEqual([])
  } finally {
    await sync.stop()
    await otherSync.stop()
    await server.close()
  }
})
