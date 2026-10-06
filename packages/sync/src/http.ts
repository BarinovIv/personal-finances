import { ApiError } from "@fin/protocol"
import { Data, Effect, Schema } from "effect"

/** Нет связи с сервером. */
export class Offline extends Data.TaggedError("Offline")<{ readonly cause: unknown }> {}
/** Нет сессии или она истекла. */
export class Unauthorized extends Data.TaggedError("Unauthorized") {}
/** Пользователь удалён; устройство должно стереть его локальные данные. */
export class UserDeleted extends Data.TaggedError("UserDeleted") {}
/** Сервер ответил ошибкой. */
export class ServerError extends Data.TaggedError("ServerError")<{
  readonly status: number
  readonly body: ApiError | undefined
}> {}

export type RequestError = Offline | Unauthorized | UserDeleted | ServerError

export interface Transport {
  readonly baseUrl: string
  readonly fetch: (request: Request) => Promise<Response>
}

/** Запрос к API: тело кодируется и ответ проверяется общими схемами протокола. */
export const request = <A, I>(
  transport: Transport,
  method: string,
  path: string,
  response: Schema.Schema<A, I>,
  body?: unknown,
  timeout = 30_000
): Effect.Effect<A, RequestError> =>
  Effect.acquireUseRelease(
    Effect.sync(() => new AbortController()),
    (controller) => Effect.gen(function* () {
      const res = yield* Effect.tryPromise({
        try: () =>
          transport.fetch(
            new Request(new URL(path, transport.baseUrl), {
              method,
              signal: controller.signal,
              credentials: "same-origin",
              headers: body === undefined ? {} : { "content-type": "application/json" },
              ...(body === undefined ? {} : { body: JSON.stringify(body) })
            })
          ),
        catch: (cause) => new Offline({ cause })
      })
      const text = yield* Effect.tryPromise({ try: () => res.text(), catch: (cause) => new Offline({ cause }) })
      const json = parseJson(text)
      if (res.status === 401 && isError(json, "unauthorized")) return yield* new Unauthorized()
      if (res.status === 410 && isError(json, "user-deleted")) return yield* new UserDeleted()
      if (!res.ok) {
        const decoded = Schema.decodeUnknownOption(ApiError)(json)
        return yield* new ServerError({ status: res.status, body: decoded._tag === "Some" ? decoded.value : undefined })
      }
      return yield* Schema.decodeUnknown(response)(json).pipe(
        Effect.mapError(() => new ServerError({ status: res.status, body: undefined }))
      )
    }),
    (controller) => Effect.sync(() => controller.abort())
  ).pipe(Effect.timeoutFail({
    duration: timeout,
    onTimeout: () => new Offline({ cause: new Error("Сервер не ответил вовремя") })
  }))

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const isError = (json: unknown, error: string) =>
  typeof json === "object" && json !== null && (json as { error?: unknown }).error === error
