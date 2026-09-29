import { afterEach, describe, expect, it, vi } from "@effect/vitest"
import { Effect, Option, TestClock } from "effect"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { gunzipSync } from "node:zlib"
import { testServer } from "./support"

const MSK = (iso: string) => Date.parse(`${iso}+03:00`)

const telegram = Option.some({ telegramToken: "123:секрет", telegramChatId: "42" })

const op = {
  collection: "operations",
  id: "coffee",
  updatedAt: 1,
  deleted: false,
  data: {
    kind: "expense",
    amount: 25000,
    description: "кофе",
    categoryId: "cafe",
    date: "2026-09-28",
    createdAt: 1,
    categorizedAt: 1,
    refundOf: null,
    recurringId: null
  }
}

interface Sent {
  readonly url: string
  readonly form: FormData
}

/** Подменяет fetch: запоминает запросы в Telegram и отвечает по очереди статусами из `statuses` (дальше — 200). */
const telegramStub = (statuses: Array<number> = []) => {
  const sent: Array<Sent> = []
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({ url, form: init.body as FormData })
    return new Response("{}", { status: statuses.shift() ?? 200 })
  })
  return sent
}

/** Дать фоновому файберу дойти до отправки. */
const settle = Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 20)))

/** Распаковать присланный бэкап и открыть его как базу. */
const openSent = (sent: Sent) =>
  Effect.promise(async () => {
    const file = sent.form.get("document") as File
    const path = join(mkdtempSync(join(tmpdir(), "fin-restore-")), "restored.sqlite")
    writeFileSync(path, gunzipSync(new Uint8Array(await file.arrayBuffer())))
    return { name: file.name, db: new DatabaseSync(path) }
  })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("ночной бэкап", () => {
  it.scoped("в 03:00 по Москве присылает в Telegram базу со всеми записями", () =>
    Effect.gen(function* () {
      const sent = telegramStub()
      yield* TestClock.setTime(MSK("2026-09-28T12:00:00"))
      const server = yield* testServer({ telegram })
      yield* server.post("/api/login", { password: "верный-пароль" })
      yield* server.post("/api/sync", { cursor: 0, changes: [op] })

      yield* TestClock.adjust("14 hours")
      yield* settle
      expect(sent).toHaveLength(0)

      yield* TestClock.adjust("1 hour")
      yield* settle
      expect(sent).toHaveLength(1)
      expect(sent[0]!.url).toBe("https://api.telegram.org/bot123:секрет/sendDocument")
      expect(sent[0]!.form.get("chat_id")).toBe("42")

      const { name, db } = yield* openSent(sent[0]!)
      expect(name).toBe("finances-2026-09-29.sqlite.gz")
      const row = db.prepare("SELECT data FROM records WHERE collection = 'operations' AND id = 'coffee'").get() as { data: string }
      expect(JSON.parse(row.data).description).toBe("кофе")
      db.close()

      yield* TestClock.adjust("1 day")
      yield* settle
      expect(sent).toHaveLength(2)
    }))

  it.scoped("если Telegram не принял файл, следующей ночью бэкап приходит снова", () =>
    Effect.gen(function* () {
      const sent = telegramStub([500])
      yield* TestClock.setTime(MSK("2026-09-28T12:00:00"))
      const server = yield* testServer({ telegram })
      yield* server.get("/api/health")

      yield* TestClock.adjust("15 hours")
      yield* settle
      expect(sent).toHaveLength(1)

      yield* TestClock.adjust("1 day")
      yield* settle
      expect(sent).toHaveLength(2)
      expect((yield* server.get("/api/health")).status).toBe(200)
    }))

  it.scoped("без токена и чата бэкап не шлётся", () =>
    Effect.gen(function* () {
      const sent = telegramStub()
      yield* TestClock.setTime(MSK("2026-09-28T12:00:00"))
      yield* testServer()
      yield* TestClock.adjust("2 days")
      yield* settle
      expect(sent).toHaveLength(0)
    }))
})
