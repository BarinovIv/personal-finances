import { describe, expect, it } from "@effect/vitest"
import { Effect, TestClock } from "effect"
import { testServer, type TestClient } from "./support"

const op = (id: string, updatedAt: number, amount: number, deleted = false) => ({
  collection: "operations",
  id,
  updatedAt,
  deleted,
  data: {
    kind: "expense",
    amount,
    description: "кофе",
    categoryId: "cafe",
    date: "2026-09-28",
    createdAt: 1,
    categorizedAt: 1,
    refundOf: null,
    recurringId: null
  }
})

const signedIn = Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse("2026-09-28T09:00:00Z"))
  const server = yield* testServer()
  yield* server.post("/api/login", { password: "верный-пароль" })
  return server
})

const sync = (client: TestClient, cursor: number, changes: Array<unknown> = []) =>
  client.post("/api/sync", { cursor, changes })

describe("синхронизация: сервер", () => {
  it.scoped("без сессии — 401", () =>
    Effect.gen(function* () {
      const server = yield* testServer()
      expect((yield* sync(server, 0)).status).toBe(401)
    }))

  it.scoped("неверные данные — 400", () =>
    Effect.gen(function* () {
      const server = yield* signedIn
      const bad = { ...op("a", 1, 100), data: { ...op("a", 1, 100).data, amount: -5 } }
      expect((yield* sync(server, 0, [bad])).status).toBe(400)
    }))

  it.scoped("изменения одного устройства приходят на другое", () =>
    Effect.gen(function* () {
      const phone = yield* signedIn
      const mac = phone.device()
      yield* mac.post("/api/login", { password: "верный-пароль" })

      const pushed = yield* sync(phone, 0, [op("a", 100, 25000)])
      expect(pushed.json.cursor).toBe(1)

      const pulled = yield* sync(mac, 0)
      expect(pulled.json).toEqual({ cursor: 1, changes: [op("a", 100, 25000)], hasMore: false })
      expect((yield* sync(mac, 1)).json).toEqual({ cursor: 1, changes: [], hasMore: false })
    }))

  it.scoped("побеждает последняя правка; проигравший получает победившую версию", () =>
    Effect.gen(function* () {
      const server = yield* signedIn
      yield* sync(server, 0, [op("a", 200, 50000)])
      const older = yield* sync(server, 1, [op("a", 100, 30000)])
      expect(older.json.changes).toEqual([op("a", 200, 50000)])
      const same = yield* sync(server, 1, [op("a", 200, 1)])
      expect(same.json.changes).toEqual([op("a", 200, 50000)])
      const newer = yield* sync(server, 1, [op("a", 300, 70000)])
      expect(newer.json).toEqual({ cursor: 2, changes: [op("a", 300, 70000)], hasMore: false })
    }))

  it.scoped("удаление — тоже правка: старая версия не воскрешает запись", () =>
    Effect.gen(function* () {
      const server = yield* signedIn
      yield* sync(server, 0, [op("a", 100, 25000)])
      yield* sync(server, 1, [op("a", 200, 25000, true)])
      const stale = yield* sync(server, 0, [op("a", 150, 99900)])
      expect(stale.json.changes).toEqual([op("a", 200, 25000, true)])
    }))
})
