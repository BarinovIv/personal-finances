import { describe, expect, it } from "@effect/vitest"
import { Effect, TestClock } from "effect"
import { restartableServer, testServer, type TestClient } from "./support"

const MSK = (iso: string) => Date.parse(`${iso}+03:00`)

const template = (id: string, fields: Partial<{ dayOfMonth: number; startDate: string; status: string; amount: number }>, updatedAt = 1) => ({
  collection: "recurring",
  id,
  updatedAt,
  deleted: false,
  data: {
    kind: "expense",
    description: "Интернет",
    amount: 65000,
    categoryId: "subscriptions",
    dayOfMonth: 10,
    startDate: "2026-07-01",
    status: "active",
    ...fields
  }
})

const login = (client: TestClient) => client.post("/api/login", { password: "верный-пароль" })

/** Операции, созданные по шаблонам: id → дата. */
const generated = (client: TestClient) =>
  Effect.gen(function* () {
    const res = yield* client.post("/api/sync", { cursor: 0, changes: [] })
    return Object.fromEntries(
      (res.json.changes as Array<any>)
        .filter((r) => r.collection === "operations" && r.data.recurringId)
        .map((r) => [r.id, r.data.date])
    )
  })

describe("регулярные операции: сервер", () => {
  it.scoped("новый шаблон сразу догоняет наступившие даты", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-09-28T12:00:00"))
      const server = yield* testServer()
      yield* login(server)
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", {})] })
      expect(yield* generated(server)).toEqual({
        "rec:net:2026-07": "2026-07-10",
        "rec:net:2026-08": "2026-08-10",
        "rec:net:2026-09": "2026-09-10"
      })
    }))

  it.scoped("операции получают вид, сумму, категорию и ссылку на шаблон", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-09-28T12:00:00"))
      const server = yield* testServer()
      yield* login(server)
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", { startDate: "2026-09-01" })] })
      const res = yield* server.post("/api/sync", { cursor: 0, changes: [] })
      expect(res.json.changes.find((r: any) => r.id === "rec:net:2026-09")).toEqual({
        collection: "operations",
        id: "rec:net:2026-09",
        updatedAt: MSK("2026-09-28T12:00:00"),
        deleted: false,
        data: {
          kind: "expense",
          amount: 65000,
          description: "Интернет",
          categoryId: "subscriptions",
          date: "2026-09-10",
          createdAt: MSK("2026-09-28T12:00:00"),
          categorizedAt: MSK("2026-09-28T12:00:00"),
          refundOf: null,
          recurringId: "net"
        }
      })
    }))

  it.scoped("число 31 в феврале → последний день месяца", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-03-01T12:00:00"))
      const server = yield* testServer()
      yield* login(server)
      yield* server.post("/api/sync", { cursor: 0, changes: [template("rent", { dayOfMonth: 31, startDate: "2026-01-15" })] })
      expect(yield* generated(server)).toEqual({ "rec:rent:2026-01": "2026-01-31", "rec:rent:2026-02": "2026-02-28" })
    }))

  it.scoped("сервер не работал 2 месяца → при старте создаются 2 операции с реальными датами", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-07-05T12:00:00"))
      const { start } = yield* restartableServer
      const first = yield* start
      yield* login(first.client)
      yield* first.client.post("/api/sync", { cursor: 0, changes: [template("rent", { dayOfMonth: 31, startDate: "2026-07-05" })] })
      expect(yield* generated(first.client)).toEqual({})
      yield* first.stop

      yield* TestClock.setTime(MSK("2026-09-05T12:00:00"))
      const second = yield* start
      yield* login(second.client)
      expect(yield* generated(second.client)).toEqual({ "rec:rent:2026-07": "2026-07-31", "rec:rent:2026-08": "2026-08-31" })

      // повторный запуск ничего не задваивает
      yield* second.stop
      const third = yield* start
      yield* login(third.client)
      const res = yield* third.client.post("/api/sync", { cursor: 0, changes: [] })
      expect(res.json.changes.filter((r: any) => r.collection === "operations")).toHaveLength(2)
    }))

  it.scoped("раз в сутки по Москве появляется операция наступившего дня", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-09-28T12:00:00"))
      const server = yield* testServer()
      yield* login(server)
      yield* server.post("/api/sync", { cursor: 0, changes: [template("gym", { dayOfMonth: 29, startDate: "2026-09-28" })] })
      expect(yield* generated(server)).toEqual({})
      yield* TestClock.adjust("11 hours")
      expect(yield* generated(server)).toEqual({})
      yield* TestClock.adjust("1 hour")
      yield* TestClock.adjust("2 seconds")
      yield* Effect.yieldNow()
      expect(yield* generated(server)).toEqual({ "rec:gym:2026-09": "2026-09-29" })
      yield* TestClock.adjust("1 day")
      yield* Effect.yieldNow()
      expect(Object.keys(yield* generated(server))).toHaveLength(1)
    }))

  it.scoped("на паузе и завершённые не создают операций; удалённую операцию сервер не создаёт снова", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-09-28T12:00:00"))
      const server = yield* testServer()
      yield* login(server)
      yield* server.post("/api/sync", {
        cursor: 0,
        changes: [template("paused", { status: "paused" }), template("ended", { status: "ended" }), template("net", { startDate: "2026-09-01" })]
      })
      const res = yield* server.post("/api/sync", { cursor: 0, changes: [] })
      const op = res.json.changes.find((r: any) => r.id === "rec:net:2026-09")
      expect(Object.keys(yield* generated(server))).toEqual(["rec:net:2026-09"])

      yield* server.post("/api/sync", { cursor: 0, changes: [{ ...op, deleted: true, updatedAt: op.updatedAt + 1 }] })
      // правка шаблона запускает генерацию, но удалённая операция не возвращается, а созданные не меняются
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", { startDate: "2026-09-01", amount: 99900 }, 2)] })
      const after = yield* server.post("/api/sync", { cursor: 0, changes: [] })
      expect(after.json.changes.find((r: any) => r.id === "rec:net:2026-09")).toMatchObject({ deleted: true, data: { amount: 65000 } })
    }))
})
