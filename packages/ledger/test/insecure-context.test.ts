import { afterEach, describe, expect, it, vi } from "vitest"
import { memoryStore, openLedger } from "@fin/ledger"

afterEach(() => vi.unstubAllGlobals())

describe("страница по http без защищённого контекста", () => {
  it("операция сохраняется, даже если в браузере нет crypto.randomUUID", async () => {
    // по http не с localhost браузер даёт только crypto.getRandomValues
    const getRandomValues = crypto.getRandomValues.bind(crypto)
    vi.stubGlobal("crypto", { getRandomValues })
    const ledger = await openLedger({ store: memoryStore(), now: () => Date.parse("2026-09-28T12:00:00+03:00") })

    const first = await ledger.submit("кофе 250")
    const second = await ledger.submit("кофе 300")
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.operation.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(first.operation.id).not.toBe(second.operation.id)
  })
})
