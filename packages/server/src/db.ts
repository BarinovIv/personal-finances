import { Context, Effect, Layer } from "effect"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"

/**
 * Адаптер хранилища сервера: SQLite-файл (ADR-0003). Запросы синхронные — один экземпляр, один пользователь.
 * Переезд на другую базу затронет только этот модуль и SQL в репозиториях.
 */
export interface DbShape {
  all<T>(sql: string, ...params: Array<SQLInputValue>): Effect.Effect<Array<T>>
  get<T>(sql: string, ...params: Array<SQLInputValue>): Effect.Effect<T | undefined>
  run(sql: string, ...params: Array<SQLInputValue>): Effect.Effect<void>
  /** Выполнить эффект атомарно. */
  transaction<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
}

export class Db extends Context.Tag("@fin/server/Db")<Db, DbShape>() {}

const MIGRATIONS: ReadonlyArray<string> = [
  `
  CREATE TABLE auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT,
    failures INTEGER NOT NULL DEFAULT 0,
    blocked_until INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO auth (id) VALUES (1);
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    device TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE records (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL,
    data TEXT NOT NULL,
    seq INTEGER NOT NULL,
    PRIMARY KEY (collection, id)
  );
  CREATE INDEX records_seq ON records (seq);
  `
]

const migrate = (db: DatabaseSync) => {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number }
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN")
    db.exec(MIGRATIONS[v]!)
    db.exec(`PRAGMA user_version = ${v + 1}`)
    db.exec("COMMIT")
  }
}

const make = (path: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })
      const db = new DatabaseSync(path)
      db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
      migrate(db)
      return db
    }),
    (db) => Effect.sync(() => db.close())
  ).pipe(
    Effect.map((db): DbShape => {
      let depth = 0
      return {
        all: (sql, ...params) => Effect.sync(() => db.prepare(sql).all(...params) as Array<any>),
        get: (sql, ...params) => Effect.sync(() => db.prepare(sql).get(...params) as any),
        run: (sql, ...params) =>
          Effect.sync(() => {
            db.prepare(sql).run(...params)
          }),
        transaction: (effect) =>
          Effect.suspend(() => {
            if (depth > 0) return effect
            depth++
            db.exec("BEGIN IMMEDIATE")
            return effect.pipe(
              Effect.tap(() => Effect.sync(() => db.exec("COMMIT"))),
              Effect.tapErrorCause(() => Effect.sync(() => db.exec("ROLLBACK"))),
              Effect.ensuring(Effect.sync(() => depth--))
            )
          })
      }
    })
  )

/** База в файле. */
export const dbFile = (path: string) => Layer.scoped(Db, make(path))

/** База в памяти — для тестов. */
export const dbMemory = Layer.scoped(Db, make(":memory:"))
