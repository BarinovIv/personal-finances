import { afterEach, describe, expect, it, vi } from "@effect/vitest"
import { Effect, Option, TestClock } from "effect"
import { testServer } from "./support"

afterEach(() => vi.unstubAllGlobals())

describe("Telegram используется только для резервных копий", () => {
  it.scoped("запуск, действия пользователя и время бывшей сводки не отправляют сообщений", () =>
    Effect.gen(function* () {
      const calls: Array<string> = []
      vi.stubGlobal("fetch", async (url: string) => {
        calls.push(url)
        return new Response("{}")
      })
      yield* TestClock.setTime(Date.parse("2026-09-28T08:59:00+03:00"))
      const server = yield* testServer({ telegram: Option.some({ telegramToken: "123:secret", telegramChatId: "42" }) })
      expect((yield* server.post("/api/login", { password: "верный-пароль" })).status).toBe(200)
      expect((yield* server.post("/api/sync", { cursor: 0, changes: [{
        collection: "recurring", id: "internet", updatedAt: 1, deleted: false,
        data: { kind: "expense", description: "Интернет", amount: 65000, categoryId: "subscriptions", dayOfMonth: 28, startDate: "2026-09-01", status: "active" }
      }] })).status).toBe(200)
      yield* TestClock.adjust("2 minutes")
      yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 20)))
      expect((yield* server.get("/api/health")).status).toBe(200)
      const synced = yield* server.post("/api/sync", { cursor: 0, changes: [] })
      expect(synced.json.changes.some((r: any) => r.collection === "operations")).toBe(true)
      expect(calls).toEqual([])
    }))
})
