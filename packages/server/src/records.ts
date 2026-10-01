import type { Collection, SyncRecord } from "@fin/domain"
import { Effect } from "effect"
import { Db } from "./db"

interface Row {
  collection: Collection
  id: string
  updated_at: number
  deleted: number
  data: string
  seq: number
}

const toRecord = (row: Row): SyncRecord => ({
  collection: row.collection,
  id: row.id,
  updatedAt: row.updated_at,
  deleted: row.deleted === 1,
  data: JSON.parse(row.data)
})

export const getRecord = (collection: Collection, id: string, userId = "owner") =>
  Effect.gen(function* () {
    const db = yield* Db
    const row = yield* db.get<Row>("SELECT * FROM records WHERE user_id = ? AND collection = ? AND id = ?", userId, collection, id)
    return row ? toRecord(row) : undefined
  })

export const allRecords = (collection: Collection, userId = "owner") =>
  Effect.gen(function* () {
    const db = yield* Db
    const rows = yield* db.all<Row>("SELECT * FROM records WHERE user_id = ? AND collection = ?", userId, collection)
    return rows.map(toRecord)
  })

/**
 * Записать, если запись новее сохранённой (ADR-0001: побеждает последняя правка, удаление — тоже правка).
 * При равном времени остаётся сохранённая. Возвращает, принята ли запись.
 */
export const putIfNewer = (record: SyncRecord, userId = "owner") =>
  Effect.gen(function* () {
    const db = yield* Db
    const stored = yield* db.get<{ updated_at: number }>(
      "SELECT updated_at FROM records WHERE user_id = ? AND collection = ? AND id = ?",
      userId,
      record.collection,
      record.id
    )
    if (stored && stored.updated_at >= record.updatedAt) return false
    const seq = (yield* currentUserSeq(userId)) + 1
    yield* db.run(
      `INSERT INTO records (user_id, collection, id, updated_at, deleted, data, seq) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, collection, id) DO UPDATE SET
         updated_at = excluded.updated_at, deleted = excluded.deleted, data = excluded.data, seq = excluded.seq`,
      userId,
      record.collection,
      record.id,
      record.updatedAt,
      record.deleted ? 1 : 0,
      JSON.stringify(record.data),
      seq
    )
    return true
  })

/** Записи новее курсора, по порядку версий. */
export const recordsSince = (cursor: number, limit: number, userId = "owner") =>
  Effect.gen(function* () {
    const db = yield* Db
    const rows = yield* db.all<Row>("SELECT * FROM records WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?", userId, cursor, limit + 1)
    return {
      records: rows.slice(0, limit).map(toRecord),
      cursor: rows.length > 0 ? rows[Math.min(rows.length, limit) - 1]!.seq : cursor,
      hasMore: rows.length > limit
    }
  })

/** Номер последней версии учёта пользователя; курсоры разных пользователей независимы. */
const currentUserSeq = (userId: string) => Effect.gen(function* () {
  const db = yield* Db
  const row = yield* db.get<{ seq: number | null }>("SELECT MAX(seq) AS seq FROM records WHERE user_id = ?", userId)
  return row?.seq ?? 0
})
