import { HttpServer } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { Config, Effect, Layer } from "effect"
import { createServer } from "node:http"
import { router, startup } from "./app"
import { appConfigFromEnv } from "./config"
import { dbFile } from "./db"

const HttpLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    yield* startup
    const port = yield* Config.port("PORT").pipe(Config.withDefault(8080))
    return router.pipe(
      HttpServer.serve(),
      HttpServer.withLogAddress,
      Layer.provide(NodeHttpServer.layer(createServer, { port }))
    )
  })
)

const DbLive = Layer.unwrapEffect(
  Config.string("DB_PATH").pipe(Config.withDefault("data/finances.sqlite"), Effect.map(dbFile))
)

/** Весь сервер: старт, затем HTTP; база и конфигурация из окружения. */
export const ServerLive = HttpLive.pipe(
  Layer.provide(DbLive),
  Layer.provide(appConfigFromEnv)
)
