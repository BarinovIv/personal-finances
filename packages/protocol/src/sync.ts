import { Schema } from "effect"
import { SyncRecord } from "./records"

/**
 * Один обмен: клиент отправляет свои изменения и номер последней полученной версии (курсор),
 * сервер отвечает изменениями новее курсора. При конфликте побеждает бóльший `updatedAt` (ADR-0001).
 */
export const SyncRequest = Schema.Struct({
  cursor: Schema.Int.pipe(Schema.nonNegative()),
  changes: Schema.Array(SyncRecord)
})
export type SyncRequest = typeof SyncRequest.Type

export const SyncResponse = Schema.Struct({
  cursor: Schema.Int.pipe(Schema.nonNegative()),
  changes: Schema.Array(SyncRecord),
  /** Есть ещё изменения — нужен следующий обмен. */
  hasMore: Schema.Boolean
})
export type SyncResponse = typeof SyncResponse.Type
