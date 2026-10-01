import { describe, expect, it } from "@effect/vitest"
import { appConfigLayer, dbFile, makeWebHandler, type AppConfigShape } from "@fin/server"
import { Effect, Layer, Option, TestClock } from "effect"
import { createHash, scryptSync } from "node:crypto"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { defaultConfig, IPHONE_UA, makeClient } from "./support"

const now = Date.parse("2026-09-28T09:00:00Z")
const legacyRecords = [
  { collection: "operations", id: "debt", data: { kind: "lent", amount: 100000, description: "", categoryId: "", date: "2026-09-28", createdAt: 1, categorizedAt: 1, refundOf: null, recurringId: null, person: "Петя" } },
  { collection: "categories", id: "cafe", data: { kind: "expense", name: "Кафе", color: "orange", icon: "cup" } },
  { collection: "recurring", id: "service", data: { kind: "expense", amount: 10000, description: "Сервис", categoryId: "subscriptions", dayOfMonth: 1, startDate: "2026-09-01", status: "paused" } },
  { collection: "settings", id: "main", data: { paydays: [5, 20] } },
  { collection: "goals", id: "car", data: { name: "Машина", icon: "car", target: 10000000, deadline: null, archived: false, createdAt: 1 } }
].map((r) => ({ ...r, updatedAt: 100, deleted: false }))

const legacyFixture = () => {
  const path = join(mkdtempSync(join(tmpdir(), "fin-migration-")), "app.sqlite")
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE auth(id INTEGER PRIMARY KEY, password_hash TEXT, failures INTEGER NOT NULL DEFAULT 0, blocked_until INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE sessions(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, device TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE records(collection TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL, data TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY(collection,id));
    CREATE INDEX records_seq ON records(seq);
    PRAGMA user_version = 2;
  `)
  const salt = Buffer.from("migration-fixture")
  const hash = ["scrypt", 16384, 8, 1, salt.toString("base64"), scryptSync("верный-пароль", salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64")].join("$")
  db.prepare("INSERT INTO auth(id,password_hash) VALUES(1,?)").run(hash)
  db.prepare("INSERT INTO sessions VALUES(?,?,?,?,?,?)").run("legacy-device", createHash("sha256").update("legacy-token").digest("hex"), "iPhone · Safari", now, now, now + 183 * 86400000)
  for (const [i, record] of legacyRecords.entries()) db.prepare("INSERT INTO records VALUES(?,?,?,?,?,?)").run(record.collection, record.id, 100, 0, JSON.stringify(record.data), i + 1)
  db.close()
  return path
}

const onServer = <A, E, R>(path: string, config: Partial<AppConfigShape>, use: (client: ReturnType<typeof makeClient>) => Effect.Effect<A, E, R>) =>
  Effect.scoped(Effect.gen(function* () {
    const handler = yield* makeWebHandler
    return yield* use(makeClient(handler, IPHONE_UA))
  }).pipe(Effect.provide(Layer.merge(appConfigLayer({ ...defaultConfig, ...config }), dbFile(path)))))

describe("переход владельца на пользователей", () => {
  it.scoped("миграция сохраняет все коллекции, старые устройства и курсор после перезапуска", () => Effect.gen(function* () {
    yield* TestClock.setTime(now)
    const path = legacyFixture()
    yield* onServer(path, { login: "Ivan" }, (client) => Effect.gen(function* () {
      const legacy = { cookie: "sid=legacy-token" }
      expect((yield* client.request("GET", "/api/me", undefined, legacy)).json.user).toEqual({ id: "owner", login: "ivan", isOwner: true })
      expect((yield* client.request("POST", "/api/sync", { cursor: 0, changes: [] }, legacy)).json).toEqual({ cursor: 5, changes: legacyRecords, hasMore: false })
      const queued = { ...legacyRecords[0]!, id: "queued", updatedAt: 200 }
      expect((yield* client.request("POST", "/api/sync", { cursor: 5, changes: [queued] }, legacy)).json).toEqual({ cursor: 6, changes: [queued], hasMore: false })
      expect((yield* client.post("/api/login", { login: "IVAN", password: "верный-пароль" })).status).toBe(200)
      expect((yield* client.post("/api/password", { currentPassword: "верный-пароль", newPassword: "app-changed" })).status).toBe(200)
    }))
    yield* onServer(path, { login: "ignored-new-name" }, (client) => Effect.gen(function* () {
      expect((yield* client.post("/api/login", { login: "ivan", password: "верный-пароль" })).status).toBe(401)
      expect((yield* client.post("/api/login", { login: "ivan", password: "app-changed" })).status).toBe(200)
      expect((yield* client.post("/api/sync", { cursor: 5, changes: [] })).json.cursor).toBe(6)
      expect((yield* client.request("GET", "/api/me", undefined, { cookie: "sid=legacy-token" })).status).toBe(200)
    }))
    yield* onServer(path, { password: Option.some("env-changed") }, (client) => Effect.gen(function* () {
      expect((yield* client.post("/api/login", { login: "ivan", password: "app-changed" })).status).toBe(401)
      expect((yield* client.post("/api/login", { login: "ivan", password: "env-changed" })).status).toBe(200)
    }))
  }))
})
