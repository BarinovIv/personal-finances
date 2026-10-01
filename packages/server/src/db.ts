import { Context, Effect, Exit, FiberRef, Layer } from "effect"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"

/**
 * Адаптер хранилища сервера: SQLite-файл (ADR-0003). Запросы синхронные — один экземпляр сервера.
 * Переезд на другую базу затронет только этот модуль и SQL в репозиториях.
 */
export interface DbShape {
  all<T>(sql: string, ...params: Array<SQLInputValue>): Effect.Effect<Array<T>>
  get<T>(sql: string, ...params: Array<SQLInputValue>): Effect.Effect<T | undefined>
  run(sql: string, ...params: Array<SQLInputValue>): Effect.Effect<void>
  /** Выполнить эффект атомарно. */
  transaction<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
  /** Согласованная копия всей базы в новый файл (`VACUUM INTO`), в том числе незаписанное из WAL. */
  snapshot(path: string): Effect.Effect<void>
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
  `,
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    login TEXT NOT NULL UNIQUE COLLATE NOCASE,
    is_owner INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT,
    created_at INTEGER NOT NULL,
    last_active_at INTEGER,
    deleted_at INTEGER
  );
  CREATE UNIQUE INDEX single_owner ON users(is_owner) WHERE is_owner = 1;
  INSERT INTO users(id, login, is_owner, password_hash, created_at)
    SELECT 'owner', 'owner', 1, password_hash, 0 FROM auth WHERE id = 1;
  ALTER TABLE auth ADD COLUMN env_password_hash TEXT;
  ALTER TABLE sessions RENAME TO legacy_sessions;
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    device TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id)
  );
  INSERT INTO sessions SELECT id, token_hash, device, created_at, last_seen_at, expires_at, 'owner' FROM legacy_sessions;
  DROP TABLE legacy_sessions;
  CREATE INDEX sessions_user ON sessions(user_id);
  ALTER TABLE records RENAME TO legacy_records;
  DROP INDEX records_seq;
  CREATE TABLE records (
    user_id TEXT NOT NULL REFERENCES users(id),
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL,
    data TEXT NOT NULL,
    seq INTEGER NOT NULL,
    PRIMARY KEY(user_id, collection, id)
  );
  INSERT INTO records SELECT 'owner', collection, id, updated_at, deleted, data, seq FROM legacy_records;
  DROP TABLE legacy_records;
  CREATE INDEX records_seq ON records(user_id, seq);
  CREATE TABLE login_attempts (
    login TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    blocked_until INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE invitations (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    used_by TEXT REFERENCES users(id),
    revoked_at INTEGER
  );
  CREATE TABLE password_resets (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );
  CREATE TABLE deleted_sessions(token_hash TEXT PRIMARY KEY);
  CREATE TABLE session_tokens(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));
  INSERT INTO session_tokens SELECT token_hash, user_id FROM sessions;
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
      const mutex = Effect.unsafeMakeSemaphore(1)
      const inTransaction = FiberRef.unsafeMake(false, { fork: () => false })
      const access = <A>(effect: Effect.Effect<A>) => Effect.gen(function* () {
        return yield* (yield* FiberRef.get(inTransaction)) ? effect : mutex.withPermits(1)(effect)
      })
      return {
        all: (sql, ...params) => access(Effect.sync(() => db.prepare(sql).all(...params) as Array<any>)),
        get: (sql, ...params) => access(Effect.sync(() => db.prepare(sql).get(...params) as any)),
        run: (sql, ...params) =>
          access(Effect.sync(() => {
            db.prepare(sql).run(...params)
          })),
        transaction: (effect) =>
          Effect.gen(function* () {
            if (yield* FiberRef.get(inTransaction)) return yield* effect
            return yield* mutex.withPermits(1)(Effect.uninterruptibleMask((restore) =>
              Effect.sync(() => db.exec("BEGIN IMMEDIATE")).pipe(
                Effect.zipRight(restore(effect).pipe(
                  Effect.locally(inTransaction, true),
                  Effect.onExit((exit) => Effect.sync(() => db.exec(Exit.isSuccess(exit) ? "COMMIT" : "ROLLBACK")))
                ))
              )
            ))
          }),
        snapshot: (path) =>
          access(Effect.sync(() => {
            db.prepare("VACUUM INTO ?").run(path)
          }))
      }
    })
  )

/** База в файле. */
export const dbFile = (path: string) => Layer.scoped(Db, make(path))

/** База в памяти — для тестов. */
export const dbMemory = Layer.scoped(Db, make(":memory:"))
