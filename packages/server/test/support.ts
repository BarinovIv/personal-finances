import { Effect, Layer, Option, type Scope } from "effect"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { appConfigLayer, dbMemory, makeWebHandler, type AppConfigShape } from "@fin/server"

/** Папка с «собранной» PWA для тестов. */
export const staticFixture = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "fin-static-"))
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return dir
}

export interface TestResponse {
  readonly status: number
  readonly headers: Headers
  readonly text: string
  readonly json: any
}

/** HTTP-клиент к серверу в процессе. Хранит cookie, как браузер одного устройства. */
export interface TestClient {
  request(method: string, path: string, body?: unknown, headers?: Record<string, string>): Effect.Effect<TestResponse>
  get(path: string): Effect.Effect<TestResponse>
  post(path: string, body?: unknown): Effect.Effect<TestResponse>
  /** Новое устройство с пустыми cookie, тот же сервер. */
  device(userAgent?: string): TestClient
}

const makeClient = (handler: (request: Request) => Promise<Response>, userAgent: string): TestClient => {
  const cookies = new Map<string, string>()
  const request: TestClient["request"] = (method, path, body, headers = {}) =>
    Effect.promise(async () => {
      const response = await handler(
        new Request(`http://app.test${path}`, {
          method,
          headers: {
            "user-agent": userAgent,
            ...(cookies.size > 0 ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
            ...(body === undefined ? {} : { "content-type": "application/json" }),
            ...headers
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) })
        })
      )
      for (const header of response.headers.getSetCookie()) {
        const [pair] = header.split(";")
        const [name, ...value] = pair!.split("=")
        const v = value.join("=")
        if (v === "" || /max-age=0/i.test(header)) cookies.delete(name!.trim())
        else cookies.set(name!.trim(), v)
      }
      const text = await response.text()
      let json: unknown = undefined
      try {
        json = JSON.parse(text)
      } catch {}
      return { status: response.status, headers: response.headers, text, json }
    })
  return {
    request,
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body ?? {}),
    device: (ua = userAgent) => makeClient(handler, ua)
  }
}

export const defaultConfig: AppConfigShape = {
  staticDir: staticFixture({ "index.html": "<!doctype html><title>Учёт</title>" }),
  password: Option.some("верный-пароль"),
  secureCookies: true
}

export const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
export const MAC_CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

/**
 * Сервер в процессе: SQLite в памяти, текущие (тестовые) часы. Живёт до конца scope теста.
 * Возвращает клиента «iPhone»; `device()` — ещё одно устройство.
 */
export const testServer = (config: Partial<AppConfigShape> = {}): Effect.Effect<TestClient, never, Scope.Scope> =>
  Effect.gen(function* () {
    const context = yield* Layer.build(Layer.merge(appConfigLayer({ ...defaultConfig, ...config }), dbMemory))
    const handler = yield* makeWebHandler.pipe(Effect.provide(context))
    return makeClient(handler, IPHONE_UA)
  })
