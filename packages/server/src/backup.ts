import { addDays, todayIn } from "@fin/domain"
import { Clock, Duration, Effect, Option } from "effect"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { AppConfig, type BackupTarget } from "./config"
import { Db } from "./db"

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

/** Отправить файл в чат через Telegram Bot API (`sendDocument`, до 50 МБ). */
export const sendToTelegram = (target: BackupTarget, file: BackupFile) =>
  Effect.tryPromise(async () => {
    const form = new FormData()
    form.append("chat_id", target.telegramChatId)
    form.append("document", new Blob([file.bytes], { type: "application/gzip" }), file.name)
    const response = await fetch(`https://api.telegram.org/bot${target.telegramToken}/sendDocument`, {
      method: "POST",
      body: form
    })
    if (!response.ok) throw new Error(`Telegram ответил ${response.status}: ${await response.text()}`)
  })

const BACKUP_HOUR = 3

/** До ближайших 03:00 по Москве (UTC+3 без перехода на летнее время). */
const untilBackupTime = (now: number) => {
  const today = Date.parse(`${todayIn(now)}T0${BACKUP_HOUR}:00:00+03:00`)
  const next = today > now ? today : Date.parse(`${addDays(todayIn(now), 1)}T0${BACKUP_HOUR}:00:00+03:00`)
  return next - now
}

/** Каждую ночь в 03:00 по Москве шлёт снимок базы в Telegram. Сбой отправки пишется в лог и не роняет сервер. */
export const nightlyBackup = Effect.gen(function* () {
  const { backup } = yield* AppConfig
  if (Option.isNone(backup)) {
    yield* Effect.logWarning("BACKUP_TELEGRAM_TOKEN и BACKUP_TELEGRAM_CHAT_ID не заданы — бэкап базы выключен")
    return
  }
  for (;;) {
    const now = yield* Clock.currentTimeMillis
    yield* Effect.sleep(Duration.millis(untilBackupTime(now)))
    yield* backupFile.pipe(
      Effect.flatMap((file) =>
        sendToTelegram(backup.value, file).pipe(
          Effect.tap(() => Effect.logInfo(`Бэкап отправлен: ${file.name}, ${file.bytes.length} байт`))
        )
      ),
      Effect.catchAllCause((cause) => Effect.logError("Бэкап не отправлен", cause))
    )
  }
})
