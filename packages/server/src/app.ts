import { HttpApp, HttpRouter, HttpServerResponse } from "@effect/platform"
import { Effect } from "effect"
import { authRoutes, ensurePassword } from "./auth"
import { nightlyBackup } from "./backup"
import type { AppConfig } from "./config"
import type { Db } from "./db"
import { dailyGeneration, generateRecurring } from "./recurring"
import { serveStatic } from "./static"
import { syncRoutes } from "./sync"

export const router = HttpRouter.empty.pipe(
  HttpRouter.get("/api/health", HttpServerResponse.json({ ok: true })),
  HttpRouter.concat(authRoutes),
  HttpRouter.concat(syncRoutes),
  HttpRouter.all("/api/*", HttpServerResponse.json({ error: "not-found" }, { status: 404 })),
  HttpRouter.get("*", serveStatic)
)

export type AppServices = AppConfig | Db

/** Что сервер делает при старте, до приёма запросов: пароль, пропущенные регулярные операции, ежедневная генерация, ночной бэкап. */
export const startup = Effect.gen(function* () {
  yield* ensurePassword
  const created = yield* generateRecurring
  if (created > 0) yield* Effect.logInfo(`Регулярные операции при старте: создано ${created}`)
  yield* Effect.forkScoped(dailyGeneration)
  yield* Effect.forkScoped(nightlyBackup)
})

/**
 * Приложение как обычная функция `Request → Response` поверх текущего окружения.
 * Так сервер работает в процессе теста без сети — с его часами и базой.
 */
export const makeWebHandler = Effect.gen(function* () {
  yield* startup
  const runtime = yield* Effect.runtime<AppServices>()
  const app = yield* HttpRouter.toHttpApp(router)
  return HttpApp.toWebHandlerRuntime(runtime)(app)
})
