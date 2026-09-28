import { describe, expect, it } from "vitest"
import { memoryStore, openLedger } from "@fin/ledger"

const at = (iso: string) => () => Date.parse(iso)

describe("Ledger", () => {
  it("живёт в фиксированном «сегодня» по Москве", async () => {
    const ledger = await openLedger({ store: memoryStore(), now: at("2026-09-27T22:30:00Z") })
    expect(ledger.today()).toBe("2026-09-28")
  })

  it("пустой журнал — пустой список по дням", async () => {
    const ledger = await openLedger({ store: memoryStore(), now: at("2026-09-28T12:00:00Z") })
    expect(ledger.days()).toEqual([])
  })
})
