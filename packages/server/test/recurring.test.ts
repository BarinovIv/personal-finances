import { describe, expect, it } from "@effect/vitest"
import { Effect, TestClock } from "effect"
import { restartableServer, testServer, type TestClient } from "./support"
import { jumpClock } from "./clock"

const MSK = (iso: string) => Date.parse(`${iso}+03:00`)

const template = (
  id: string,
  fields: Partial<{ dayOfMonth: number; startDate: string; status: string; amount: number; position: number }>,
  updatedAt = 1
) => ({
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
  it.scoped("в Новосибирске новый день наступает раньше Москвы и регулярная операция появляется в течение минуты", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-09-28T19:59:30"))
      const server = yield* testServer()
      yield* login(server)
      yield* server.post("/api/sync", { cursor: 0, changes: [
        { collection: "settings", id: "settings", updatedAt: 1, deleted: false, data: { paydays: [5, 20], timeZone: "Asia/Novosibirsk" } },
        template("gym", { dayOfMonth: 29, startDate: "2026-09-28" })
      ] })
      expect(yield* generated(server)).toEqual({})
      yield* TestClock.adjust("1 minute")
      yield* Effect.yieldNow()
      expect(yield* generated(server)).toEqual({ "rec:gym:2026-09": "2026-09-29" })
    }))

  it.scoped("пользователи по разные стороны стыка суток получают свои операции без дублей и с одинаковыми id шаблонов", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-09-28T19:59:30"))
      const moscow = yield* testServer()
      yield* login(moscow)
      const invitation = yield* moscow.post("/api/invitations")
      expect(invitation.status).toBe(200)
      const novosibirsk = moscow.device()
      const registered = yield* novosibirsk.post("/api/register", { token: invitation.json.token, login: "siberia", password: "другой-пароль" })
      expect(registered.status).toBe(200)
      yield* moscow.post("/api/sync", { cursor: 0, changes: [template("gym", { dayOfMonth: 29, startDate: "2026-09-28" })] })
      yield* novosibirsk.post("/api/sync", { cursor: 0, changes: [
        { collection: "settings", id: "settings", updatedAt: 1, deleted: false, data: { paydays: [5, 20], timeZone: "Asia/Novosibirsk" } },
        template("gym", { dayOfMonth: 29, startDate: "2026-09-28" })
      ] })
      yield* TestClock.adjust("1 minute")
      expect(yield* generated(moscow)).toEqual({})
      expect(yield* generated(novosibirsk)).toEqual({ "rec:gym:2026-09": "2026-09-29" })
      yield* TestClock.adjust("1 minute")
      expect(yield* generated(novosibirsk)).toEqual({ "rec:gym:2026-09": "2026-09-29" })
      const otherPhone = novosibirsk.device()
      yield* otherPhone.post("/api/login", { login: "siberia", password: "другой-пароль" })
      const synced = yield* otherPhone.post("/api/sync", { cursor: 0, changes: [] })
      expect(synced.json.changes.find((r: any) => r.collection === "settings").data.timeZone).toBe("Asia/Novosibirsk")
      expect((yield* moscow.post("/api/sync", { cursor: 0, changes: [] })).json.changes.some((r: any) => r.collection === "settings")).toBe(false)
    }))

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

  it.scoped("правка на сегодня создаёт ещё одну операцию месяца и сохраняет прежние даты", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-09-28T12:00:00"))
      const server = yield* testServer()
      yield* login(server)
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", {})] })
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", { dayOfMonth: 28, startDate: "2026-09-28", amount: 99000 }, 2)] })
      expect(yield* generated(server)).toEqual({
        "rec:net:2026-07": "2026-07-10",
        "rec:net:2026-08": "2026-08-10",
        "rec:net:2026-09": "2026-09-10",
        "rec:net:2026-09-28": "2026-09-28"
      })
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", { dayOfMonth: 28, startDate: "2026-09-28", amount: 100000 }, 3)] })
      const response = yield* server.post("/api/sync", { cursor: 0, changes: [] })
      expect(response.json.changes.filter((r: { collection: string }) => r.collection === "operations")).toHaveLength(4)
      expect(response.json.changes.find((r: { id: string }) => r.id === "rec:net:2026-09-28")).toMatchObject({ data: { amount: 99000, pending: true } })
    }))

  it.scoped("старый изменённый шаблон не создаёт повторные операции прошлых месяцев", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-09-28T12:00:00"))
      const server = yield* testServer()
      yield* login(server)
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", {})] })
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", { dayOfMonth: 28 }, MSK("2026-09-28T11:00:00"))] })
      expect(yield* generated(server)).toEqual({
        "rec:net:2026-07": "2026-07-10",
        "rec:net:2026-08": "2026-08-10",
        "rec:net:2026-09": "2026-09-10",
        "rec:net:2026-09-28": "2026-09-28"
      })
    }))

  it.scoped("поздняя правка суммы офлайн не отменяет наступившую дату нового расписания", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-09-30T12:00:00"))
      const server = yield* testServer()
      yield* login(server)
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", { startDate: "2026-09-01" })] })
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", {
        dayOfMonth: 28, startDate: "2026-09-28", amount: 99000
      }, MSK("2026-09-29T12:00:00"))] })
      const response = yield* server.post("/api/sync", { cursor: 0, changes: [] })
      expect(response.json.changes.filter((r: { collection: string }) => r.collection === "operations")).toEqual([
        expect.objectContaining({ id: "rec:net:2026-09", data: expect.objectContaining({ date: "2026-09-10", amount: 65000 }) }),
        expect.objectContaining({ id: "rec:net:2026-09-28", data: expect.objectContaining({ date: "2026-09-28", amount: 99000, pending: true }) })
      ])
    }))

  for (const [dayOfMonth, expected] of [[28, false], [29, true]] as const) {
    it.scoped(`правка офлайн учитывает местную дату изменения: число ${dayOfMonth}`, () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(MSK("2026-09-30T12:00:00"))
        const server = yield* testServer()
        yield* login(server)
        yield* server.post("/api/sync", { cursor: 0, changes: [
          { collection: "settings", id: "settings", updatedAt: 1, deleted: false, data: { paydays: [5, 20], timeZone: "Asia/Novosibirsk" } },
          template("net", { startDate: "2026-09-01" })
        ] })
        // В Новосибирске правка уже сделана 29-го, хотя в Москве ещё 28-е.
        yield* server.post("/api/sync", { cursor: 0, changes: [template("net", { dayOfMonth, startDate: "2026-09-01" }, MSK("2026-09-28T22:00:00"))] })
        const operations = yield* generated(server)
        expect(operations["rec:net:2026-09"]).toBe("2026-09-10")
        expect(operations[`rec:net:2026-09-${dayOfMonth}`]).toBe(expected ? "2026-09-29" : undefined)
        expect(Object.keys(operations)).toHaveLength(expected ? 2 : 1)
      }))
  }

  it.scoped("перенесённая подтверждённая операция сохраняет занятой исходную дату расписания", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-09-29T12:00:00"))
      const server = yield* testServer()
      yield* login(server)
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", { dayOfMonth: 28, startDate: "2026-09-28" })] })
      const response = yield* server.post("/api/sync", { cursor: 0, changes: [] })
      const operation = response.json.changes.find((r: { id: string }) => r.id === "rec:net:2026-09")
      expect(operation.data.recurringDate).toBe("2026-09-28")
      expect((yield* server.post("/api/sync", { cursor: 0, changes: [{
        ...operation, updatedAt: operation.updatedAt + 1,
        data: { ...operation.data, date: "2026-09-29", pending: false }
      }] })).status).toBe(200)
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", { dayOfMonth: 28, startDate: "2026-09-28", amount: 99000 }, 2)] })
      const after = yield* server.post("/api/sync", { cursor: 0, changes: [] })
      expect(after.json.changes.filter((r: { collection: string }) => r.collection === "operations")).toEqual([
        expect.objectContaining({ id: "rec:net:2026-09", data: expect.objectContaining({ date: "2026-09-29", recurringDate: "2026-09-28", amount: 65000, pending: false }) })
      ])
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", { dayOfMonth: 29, startDate: "2026-09-29" }, 3)] })
      const movedDay = yield* server.post("/api/sync", { cursor: 0, changes: [] })
      expect(movedDay.json.changes.filter((r: { collection: string }) => r.collection === "operations")).toHaveLength(1)
    }))

  for (const deleted of [false, true]) {
    it.scoped(`операция на ту же дату защищена от повторной генерации: deleted=${deleted}`, () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(MSK("2026-09-28T12:00:00"))
        const server = yield* testServer()
        yield* login(server)
        yield* server.post("/api/sync", { cursor: 0, changes: [template("net", { dayOfMonth: 28, startDate: "2026-09-28" })] })
        const response = yield* server.post("/api/sync", { cursor: 0, changes: [] })
        const operation = response.json.changes.find((r: { id: string }) => r.id === "rec:net:2026-09")
        yield* server.post("/api/sync", { cursor: 0, changes: [{ ...operation, updatedAt: operation.updatedAt + 1, deleted, data: { ...operation.data, pending: false } }] })
        yield* server.post("/api/sync", { cursor: 0, changes: [template("net", { dayOfMonth: 28, startDate: "2026-09-28", amount: 99000 }, 2)] })
        const after = yield* server.post("/api/sync", { cursor: 0, changes: [] })
        expect(after.json.changes.filter((r: { collection: string }) => r.collection === "operations")).toEqual([
          expect.objectContaining({ id: "rec:net:2026-09", deleted, data: expect.objectContaining({ amount: 65000, pending: false }) })
        ])
      }))
  }

  it.scoped("место в списке доходит до других устройств", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-09-28T12:00:00"))
      const server = yield* testServer()
      yield* login(server)
      yield* server.post("/api/sync", { cursor: 0, changes: [template("net", { position: 2 })] })
      const res = yield* server.post("/api/sync", { cursor: 0, changes: [] })
      expect(res.json.changes.find((r: any) => r.id === "net").data.position).toBe(2)
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
          recurringDate: "2026-09-10",
          createdAt: MSK("2026-09-28T12:00:00"),
          categorizedAt: MSK("2026-09-28T12:00:00"),
          refundOf: null,
          recurringId: "net",
          pending: true
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

  it.scoped("регулярный доход тоже появляется ожидающим подтверждения", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-09-28T12:00:00"))
      const server = yield* testServer()
      yield* login(server)
      const expense = template("salary", { startDate: "2026-09-01" })
      const income = { ...expense, data: { ...expense.data, kind: "income", categoryId: "salary", description: "Зарплата" } }
      expect((yield* server.post("/api/sync", { cursor: 0, changes: [income] })).status).toBe(200)
      const response = yield* server.post("/api/sync", { cursor: 0, changes: [] })
      expect(response.json.changes.find((record: { id: string }) => record.id === "rec:salary:2026-09")).toMatchObject({
        data: { kind: "income", amount: 65000, date: "2026-09-10", pending: true }
      })
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

  it.scoped("при наступлении московского дня появляется одна операция, после скачка времени генерация догоняет дату", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(MSK("2026-09-28T12:00:00"))
      const clock = yield* jumpClock
      const server = yield* testServer()
      yield* login(server)
      yield* server.post("/api/sync", { cursor: 0, changes: [template("gym", { dayOfMonth: 29, startDate: "2026-09-28" })] })
      expect(yield* generated(server)).toEqual({})
      yield* clock.advance("11 hours")
      expect(yield* generated(server)).toEqual({})
      yield* clock.advance("1 hour")
      yield* clock.advance("2 seconds")
      yield* Effect.yieldNow()
      expect(yield* generated(server)).toEqual({ "rec:gym:2026-09": "2026-09-29" })
      yield* clock.advance("1 day")
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
