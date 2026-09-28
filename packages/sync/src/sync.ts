import type { SyncRecord } from "@fin/domain"
import type { LedgerSyncPort } from "@fin/ledger"
import { SyncRecord as SyncRecordSchema, SyncResponse } from "@fin/protocol"
import { Duration, Effect, Either, Fiber, Queue, Schema } from "effect"
import { request, type RequestError, type Transport } from "./http"

/** «синхронизировано» / «ждёт сети» / нужен вход. */
export type SyncState = "synced" | "pending" | "unauthorized"

export interface SyncStatus {
  readonly state: SyncState
  /** Сколько изменений ждут отправки. */
  readonly pending: number
  readonly syncing: boolean
  readonly lastSyncedAt: number | null
}

export type SyncOutcome = "ok" | "offline" | "unauthorized" | "error"

export interface SyncOptions {
  readonly ledger: { readonly sync: LedgerSyncPort; subscribe(listener: () => void): () => void }
  readonly transport: Transport
  /** Пауза перед повтором при ошибке сети растёт от `base` до `max`, мс. */
  readonly retry?: { readonly base: number; readonly max: number }
  /** Как часто забирать чужие изменения, когда своих нет, мс. */
  readonly interval?: number
  /** Сколько подождать после локальной правки, чтобы отправить пачкой, мс. */
  readonly debounce?: number
}

/** Синхронизация в фоне. Снаружи — обычные функции; Effect только внутри. */
export interface Sync {
  /** Один обмен с сервером прямо сейчас. */
  syncNow(): Promise<SyncOutcome>
  /** Запустить фоновую синхронизацию: после правок, по таймеру, с повторами при ошибках сети. */
  start(): void
  stop(): Promise<void>
  /** Попробовать сейчас, не дожидаясь паузы (сеть вернулась, вошли заново). */
  wake(): void
  status(): SyncStatus
  subscribe(listener: (status: SyncStatus) => void): () => void
}

const encodeRecord = Schema.encodeEither(SyncRecordSchema)

export const createSync = (options: SyncOptions): Sync => {
  const port = options.ledger.sync
  const retry = options.retry ?? { base: 1_000, max: 5 * 60_000 }
  const interval = options.interval ?? 60_000
  const debounce = options.debounce ?? 300

  let lastOutcome: SyncOutcome | null = null
  let lastSyncedAt: number | null = null
  let syncing = false
  const listeners = new Set<(status: SyncStatus) => void>()

  const status = (): SyncStatus => {
    const pending = port.pending().length
    const state: SyncState =
      lastOutcome === "unauthorized"
        ? "unauthorized"
        : pending > 0 || lastOutcome === "offline" || lastOutcome === "error"
          ? "pending"
          : "synced"
    return { state, pending, syncing, lastSyncedAt }
  }
  const notify = () => {
    const s = status()
    for (const listener of listeners) listener(s)
  }

  /** Отправить очередь и забрать чужие изменения; повторять, пока сервер говорит «есть ещё». */
  const exchange: Effect.Effect<void, RequestError> = Effect.gen(function* () {
    for (;;) {
      const pending = port.pending()
      const changes: Array<unknown> = []
      const invalid: Array<SyncRecord> = []
      for (const record of pending) {
        const encoded = encodeRecord(record as never)
        if (Either.isRight(encoded)) changes.push(encoded.right)
        else invalid.push(record)
      }
      const response = yield* request(transport(), "POST", "/api/sync", SyncResponse, {
        cursor: port.cursor(),
        changes
      })
      yield* Effect.promise(() => port.receive(response.changes, response.cursor))
      yield* Effect.promise(() => port.acknowledge([...pending, ...invalid]))
      if (!response.hasMore) return
    }
  })
  const transport = () => options.transport

  const lock = Effect.unsafeMakeSemaphore(1)

  const once: Effect.Effect<SyncOutcome> = lock.withPermits(1)(
    Effect.gen(function* () {
      syncing = true
      notify()
      const result = yield* Effect.either(exchange)
      syncing = false
      if (Either.isRight(result)) {
        lastOutcome = "ok"
        lastSyncedAt = Date.now()
      } else {
        const error = result.left
        lastOutcome = error._tag === "Unauthorized" ? "unauthorized" : error._tag === "Offline" ? "offline" : "error"
      }
      notify()
      return lastOutcome
    })
  )

  const wakeups = Effect.runSync(Queue.sliding<void>(1))

  /** Ждать пробуждения, но не дольше `ms` (null — только пробуждения). */
  const waitFor = (ms: number | null) =>
    ms === null
      ? Queue.take(wakeups)
      : Effect.race(Queue.take(wakeups), Effect.sleep(Duration.millis(ms)))

  const loop = Effect.gen(function* () {
    let failures = 0
    for (;;) {
      const outcome = yield* once
      if (outcome === "ok") {
        failures = 0
        yield* waitFor(interval)
      } else if (outcome === "unauthorized") {
        failures = 0
        yield* waitFor(null)
      } else {
        const pause = Math.min(retry.base * 2 ** failures, retry.max)
        failures++
        yield* waitFor(pause)
      }
      if (port.pending().length > 0) yield* Effect.sleep(Duration.millis(debounce))
    }
  })

  let fiber: Fiber.RuntimeFiber<never> | null = null
  let unsubscribe: (() => void) | null = null
  const wake = () => Effect.runSync(Queue.offer(wakeups, undefined))

  return {
    syncNow: () => Effect.runPromise(once),
    start: () => {
      if (fiber) return
      fiber = Effect.runFork(loop)
      unsubscribe = options.ledger.subscribe(() => {
        notify()
        if (port.pending().length > 0) wake()
      })
    },
    stop: async () => {
      unsubscribe?.()
      unsubscribe = null
      if (fiber) await Effect.runPromise(Fiber.interrupt(fiber))
      fiber = null
    },
    wake,
    status,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
