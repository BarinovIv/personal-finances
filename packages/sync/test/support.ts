import { memoryStore, openLedger, type Ledger } from "@fin/ledger"
import { appConfigLayer, dbMemory, makeWebHandler } from "@fin/server"
import { Clock, Duration, Effect, Exit, Layer, Option, Scope } from "effect"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Transport } from "@fin/sync"

export const PASSWORD = "верный-пароль"

/** Общие часы теста: и для сервера, и для устройств. Время стоит, пока его не сдвинут. */
export const testClock = (iso: string) => {
  let now = Date.parse(iso)
  return {
    now: () => now,
    set: (next: string) => {
      now = Date.parse(next)
    },
    advance: (ms: number) => {
      now += ms
    }
  }
}
export type TestClock = ReturnType<typeof testClock>

const effectClock = (now: () => number): Clock.Clock => ({
  [Clock.ClockTypeId]: Clock.ClockTypeId,
  unsafeCurrentTimeMillis: () => now(),
  unsafeCurrentTimeNanos: () => BigInt(now()) * 1_000_000n,
  currentTimeMillis: Effect.sync(() => now()),
  currentTimeNanos: Effect.sync(() => BigInt(now()) * 1_000_000n),
  sleep: (duration) =>
    Effect.async<void>((resume) => {
      const timer = setTimeout(() => resume(Effect.void), Duration.toMillis(duration))
      return Effect.sync(() => clearTimeout(timer))
    })
})

/** Устройство: свои cookie, своя сеть (её можно выключить), общий сервер. */
export interface Device {
  readonly transport: Transport
  online: boolean
  /** Сколько запросов ушло на сервер. */
  requests: number
}

/** Сервер в процессе: SQLite в памяти, общие часы, запросы — вызовы функции, без сети. */
export const inProcessServer = async (clock: TestClock) => {
  const scope = Effect.runSync(Scope.make())
  const handler = await Effect.runPromise(
    Layer.build(
      Layer.merge(
        appConfigLayer({
          staticDir: mkdtempSync(join(tmpdir(), "fin-static-")),
          password: Option.some(PASSWORD),
          secureCookies: true
        }),
        dbMemory
      )
    ).pipe(
      Effect.flatMap((context) => makeWebHandler.pipe(Effect.provide(context))),
      Effect.withClock(effectClock(clock.now)),
      Scope.extend(scope)
    )
  )

  const device = (): Device => {
    const cookies = new Map<string, string>()
    const state: Device = {
      online: true,
      requests: 0,
      transport: {
        baseUrl: "http://app.test",
        fetch: async (request) => {
          if (!state.online) throw new TypeError("Failed to fetch")
          state.requests++
          const headers = new Headers(request.headers)
          if (cookies.size > 0) headers.set("cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "))
          const response = await handler(new Request(request, { headers }))
          for (const header of response.headers.getSetCookie()) {
            const [pair] = header.split(";")
            const [name, ...value] = pair!.split("=")
            if (/max-age=0/i.test(header) || value.join("=") === "") cookies.delete(name!.trim())
            else cookies.set(name!.trim(), value.join("="))
          }
          return response
        }
      }
    }
    return state
  }

  return {
    device,
    close: () => Effect.runPromise(Scope.close(scope, Exit.void))
  }
}

export type InProcessServer = Awaited<ReturnType<typeof inProcessServer>>

export const newLedger = (clock: TestClock): Promise<Ledger> => openLedger({ store: memoryStore(), now: clock.now })
