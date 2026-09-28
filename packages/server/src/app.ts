import { HttpApp, HttpRouter, HttpServerResponse } from "@effect/platform"
import { Effect } from "effect"
import type { AppConfig } from "./config"
import { serveStatic } from "./static"

export const router = HttpRouter.empty.pipe(
  HttpRouter.get("/api/health", HttpServerResponse.json({ ok: true })),
  HttpRouter.all("/api/*", HttpServerResponse.json({ error: "not-found" }, { status: 404 })),
  HttpRouter.get("*", serveStatic)
)

export type AppServices = AppConfig

/**
 * Приложение как обычная функция `Request → Response` поверх текущего окружения.
 * Так сервер работает в процессе теста без сети — с его часами и базой.
 */
export const makeWebHandler = Effect.gen(function* () {
  const runtime = yield* Effect.runtime<AppServices>()
  const app = yield* HttpRouter.toHttpApp(router)
  return HttpApp.toWebHandlerRuntime(runtime)(app)
})
