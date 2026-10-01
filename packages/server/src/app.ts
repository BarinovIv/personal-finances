import { HttpApp, HttpRouter, HttpServerResponse } from "@effect/platform"
import { Effect } from "effect"
import { authRoutes, ensurePassword } from "./auth"
import { weeklyBackup } from "./backup"
import type { AppConfig } from "./config"
import type { Db } from "./db"
import { dailyGeneration, generateRecurring } from "./recurring"
import { serveStatic } from "./static"
import { syncRoutes } from "./sync"
import { userRoutes } from "./users"

export const router = HttpRouter.empty.pipe(
  HttpRouter.get("/api/health", HttpServerResponse.json({ ok: true })),
  HttpRouter.concat(authRoutes),
  HttpRouter.concat(userRoutes),
  HttpRouter.concat(syncRoutes),
  HttpRouter.all("/api/*", HttpServerResponse.json({ error: "not-found" }, { status: 404 })),
  HttpRouter.get("*", serveStatic)
)

export type AppServices = AppConfig | Db

/**
 * При старте: вход владельца, пропущенные регулярные операции, периодическая генерация и еженедельный бэкап.
 */
export const startup = Effect.gen(function* () {
  yield* ensurePassword
  const created = yield* generateRecurring
  if (created > 0) yield* Effect.logInfo(`Регулярные операции при старте: создано ${created}`)
  yield* Effect.forkScoped(dailyGeneration)
  yield* Effect.forkScoped(weeklyBackup)
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
