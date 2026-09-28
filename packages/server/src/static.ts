import { HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect } from "effect"
import { readFile } from "node:fs/promises"
import { extname, join, normalize, resolve, sep } from "node:path"
import { AppConfig } from "./config"

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2"
}

const read = (path: string) =>
  Effect.tryPromise(() => readFile(path)).pipe(Effect.option)

/** Отдаёт собранную PWA. Пути без расширения — это экраны приложения, для них отдаётся index.html. */
export const serveStatic = Effect.gen(function* () {
  const { staticDir } = yield* AppConfig
  const request = yield* HttpServerRequest.HttpServerRequest
  const root = resolve(staticDir)
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
  const requested = resolve(join(root, normalize(pathname)))
  if (requested !== root && !requested.startsWith(root + sep)) {
    return HttpServerResponse.empty({ status: 404 })
  }
  const isAsset = extname(pathname) !== ""
  const file = isAsset ? requested : join(root, "index.html")
  const body = yield* read(file)
  if (body._tag === "None") return HttpServerResponse.text("Не найдено", { status: 404 })
  const ext = extname(file)
  const immutable = pathname.startsWith("/assets/")
  return HttpServerResponse.uint8Array(new Uint8Array(body.value), {
    contentType: contentTypes[ext] ?? "application/octet-stream",
    headers: { "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache" }
  })
})
