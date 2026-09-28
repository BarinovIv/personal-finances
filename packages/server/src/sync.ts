import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import type { SyncRecord } from "@fin/domain"
import { SyncRequest, SyncResponse } from "@fin/protocol"
import { Effect, Option, Schema } from "effect"
import { apiError, withSession } from "./auth"
import { Db } from "./db"
import { getRecord, putIfNewer, recordsSince } from "./records"

/** Сколько записей отдавать за один обмен. */
export const PAGE_SIZE = 1000

const sync = withSession(() =>
  Effect.gen(function* () {
    const db = yield* Db
    const body = yield* HttpServerRequest.schemaBodyJson(SyncRequest).pipe(Effect.option)
    if (Option.isNone(body)) return apiError(400, { error: "bad-request" })
    const { cursor, changes } = body.value

    const response = yield* db.transaction(
      Effect.gen(function* () {
        // отклонённые правки проиграли более поздним: клиенту нужна победившая версия
        const winners: Array<SyncRecord> = []
        for (const change of changes) {
          const accepted = yield* putIfNewer(change)
          if (!accepted) {
            const stored = yield* getRecord(change.collection, change.id)
            if (stored) winners.push(stored)
          }
        }
        const page = yield* recordsSince(cursor, PAGE_SIZE)
        const seen = new Set(page.records.map((r) => `${r.collection}:${r.id}`))
        return {
          cursor: page.cursor,
          changes: [...page.records, ...winners.filter((w) => !seen.has(`${w.collection}:${w.id}`))],
          hasMore: page.hasMore
        }
      })
    )
    return HttpServerResponse.unsafeJson(Schema.encodeSync(SyncResponse)(response as SyncResponse))
  })
)

export const syncRoutes = HttpRouter.empty.pipe(HttpRouter.post("/api/sync", sync))
