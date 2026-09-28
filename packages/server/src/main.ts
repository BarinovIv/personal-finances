import { HttpServer } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { Config, Effect, Layer } from "effect"
import { createServer } from "node:http"
import { router } from "./app"
import { appConfigFromEnv } from "./config"

const HttpLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const port = yield* Config.port("PORT").pipe(Config.withDefault(8080))
    return router.pipe(
      HttpServer.serve(),
      HttpServer.withLogAddress,
      Layer.provide(NodeHttpServer.layer(createServer, { port }))
    )
  })
)

/** Весь сервер: HTTP, конфигурация из окружения. */
export const ServerLive = HttpLive.pipe(Layer.provide(appConfigFromEnv))
