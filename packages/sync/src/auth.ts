import { SessionList, type SessionInfo } from "@fin/protocol"
import { Effect, Schema } from "effect"
import { request, type Transport } from "./http"

export type LoginResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "wrong-password"; readonly attemptsLeft: number }
  | { readonly ok: false; readonly reason: "blocked"; readonly retryAfter: number }
  | { readonly ok: false; readonly reason: "offline" | "error" }

export type SessionState = "signed-in" | "signed-out" | "offline"

export type { SessionInfo }

/** Вход, выход и устройства — обычные функции поверх HTTP API. */
export interface AuthApi {
  /** Есть ли действующая сессия. Без сети — `offline`: приложение работает дальше. */
  checkSession(): Promise<SessionState>
  login(password: string): Promise<LoginResult>
  /** Выйти на этом устройстве. */
  logout(): Promise<void>
  /** Устройства с активной сессией; null — без сети или без сессии. */
  sessions(): Promise<ReadonlyArray<SessionInfo> | null>
  /** Отозвать сессию устройства — оно сразу разлогинится. */
  revokeSession(id: string): Promise<boolean>
}

const Ok = Schema.Struct({ ok: Schema.Literal(true) })

export const createAuthApi = (transport: Transport): AuthApi => ({
  checkSession: () =>
    request(transport, "GET", "/api/me", Ok).pipe(
      Effect.as<SessionState>("signed-in"),
      Effect.catchTags({
        Unauthorized: () => Effect.succeed<SessionState>("signed-out"),
        Offline: () => Effect.succeed<SessionState>("offline"),
        ServerError: () => Effect.succeed<SessionState>("offline")
      }),
      Effect.runPromise
    ),

  login: (password) =>
    request(transport, "POST", "/api/login", Ok, { password }).pipe(
      Effect.as<LoginResult>({ ok: true }),
      Effect.catchTags({
        Offline: () => Effect.succeed<LoginResult>({ ok: false, reason: "offline" }),
        Unauthorized: () => Effect.succeed<LoginResult>({ ok: false, reason: "error" }),
        ServerError: ({ body }) =>
          Effect.succeed<LoginResult>(
            body?.error === "wrong-password"
              ? { ok: false, reason: "wrong-password", attemptsLeft: body.attemptsLeft ?? 0 }
              : body?.error === "blocked"
                ? { ok: false, reason: "blocked", retryAfter: body.retryAfter ?? 0 }
                : { ok: false, reason: "error" }
          )
      }),
      Effect.runPromise
    ),

  logout: () =>
    request(transport, "POST", "/api/logout", Ok).pipe(Effect.ignore, Effect.runPromise),

  sessions: () =>
    request(transport, "GET", "/api/sessions", SessionList).pipe(
      Effect.map((list) => list.sessions),
      Effect.orElseSucceed(() => null),
      Effect.runPromise
    ),

  revokeSession: (id) =>
    request(transport, "DELETE", `/api/sessions/${encodeURIComponent(id)}`, Ok).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
      Effect.runPromise
    )
})
