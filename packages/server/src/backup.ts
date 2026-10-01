import { todayIn } from "@fin/domain"
import { Clock, Duration, Effect, Option } from "effect"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { AppConfig } from "./config"
import { Db } from "./db"
import { sendDocument, untilMoscowTime } from "./telegram"

export interface BackupFile {
  readonly name: string
  readonly bytes: Uint8Array<ArrayBuffer>
}

/** Снимок базы, сжатый gzip: `finances-2026-09-29.sqlite.gz`. */
export const backupFile = Effect.gen(function* () {
  const db = yield* Db
  const now = yield* Clock.currentTimeMillis
  const bytes = yield* Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "fin-backup-"))),
    (dir) => {
      const path = join(dir, "finances.sqlite")
      return db.snapshot(path).pipe(Effect.map(() => gzipSync(readFileSync(path))))
    },
    (dir) => Effect.sync(() => rmSync(dir, { recursive: true, force: true }))
  )
  return { name: `finances-${todayIn(now)}.sqlite.gz`, bytes } satisfies BackupFile
})

const BACKUP_HOUR = 3

/** Понедельник для ISO-даты (UTC здесь используется только для разбора календарной даты). */
const isMonday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 1

/** Каждый понедельник в 03:00 по Москве шлёт снимок базы в Telegram. Сбой отправки пишется в лог и не роняет сервер. */
export const weeklyBackup = Effect.gen(function* () {
  const { telegram } = yield* AppConfig
  if (Option.isNone(telegram)) {
    yield* Effect.logWarning("BACKUP_TELEGRAM_TOKEN и BACKUP_TELEGRAM_CHAT_ID не заданы — бэкап базы выключен")
    return
  }
  for (;;) {
    const now = yield* Clock.currentTimeMillis
    yield* Effect.sleep(Duration.millis(untilMoscowTime(now, BACKUP_HOUR, isMonday)))
    yield* backupFile.pipe(
      Effect.flatMap((file) =>
        sendDocument(telegram.value, { ...file, type: "application/gzip" }).pipe(
          Effect.tap(() => Effect.logInfo(`Бэкап отправлен: ${file.name}, ${file.bytes.length} байт`))
        )
      ),
      Effect.catchAllCause((cause) => Effect.logError("Бэкап не отправлен", cause))
    )
  }
})
