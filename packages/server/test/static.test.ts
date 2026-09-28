import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { staticFixture, testServer } from "./support"

describe("статика PWA", () => {
  const staticDir = staticFixture({
    "index.html": "<!doctype html><title>Учёт</title><div id=app></div>",
    "assets/app-1.js": "console.log(1)",
    "manifest.webmanifest": "{}"
  })

  it.scoped("экран приложения отдаёт index.html", () =>
    Effect.gen(function* () {
      const server = yield* testServer({ staticDir })
      for (const path of ["/", "/dashboard"]) {
        const res = yield* server.get(path)
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toContain("text/html")
        expect(res.text).toContain("<title>Учёт</title>")
      }
    }))

  it.scoped("файлы сборки отдаются с типом и кэшем", () =>
    Effect.gen(function* () {
      const server = yield* testServer({ staticDir })
      const js = yield* server.get("/assets/app-1.js")
      expect(js.status).toBe(200)
      expect(js.headers.get("content-type")).toContain("javascript")
      expect(js.headers.get("cache-control")).toContain("immutable")
      const manifest = yield* server.get("/manifest.webmanifest")
      expect(manifest.headers.get("content-type")).toContain("manifest+json")
    }))

  it.scoped("нет файла или выход за папку — 404", () =>
    Effect.gen(function* () {
      const server = yield* testServer({ staticDir })
      expect((yield* server.get("/assets/nope.js")).status).toBe(404)
      expect((yield* server.get("/..%2F..%2Fetc%2Fpasswd.txt")).status).toBe(404)
      expect((yield* server.get("/api/nope")).status).toBe(404)
    }))

  it.scoped("health", () =>
    Effect.gen(function* () {
      const server = yield* testServer({ staticDir })
      const res = yield* server.get("/api/health")
      expect(res.json).toEqual({ ok: true })
    }))
})
