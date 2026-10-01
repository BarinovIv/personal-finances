/** Всё, что журнал хранит на устройстве. */
export interface StoredState {
  readonly records: ReadonlyArray<unknown>
  readonly outbox: ReadonlyArray<string>
  readonly meta: Readonly<Record<string, unknown>>
}

export interface StoreChange {
  /** Проверяется в транзакции: прежняя вкладка не пишет данные после смены пользователя. */
  readonly expectedOwner?: string | null
  /** Очистить записи, очередь и метаданные в той же транзакции перед остальными изменениями. */
  readonly clear?: boolean
  readonly records?: ReadonlyArray<{ readonly key: string; readonly value: unknown }>
  readonly outboxAdd?: ReadonlyArray<string>
  readonly outboxRemove?: ReadonlyArray<string>
  readonly meta?: Readonly<Record<string, unknown>>
}

export class LocalUserChanged extends Error {
  constructor() {
    super("Пользователь устройства изменился в другой вкладке. Откройте приложение заново.")
    this.name = "LocalUserChanged"
  }
}

/** Хранилище журнала на устройстве: в памяти (тесты) или IndexedDB (браузер). */
export interface LedgerStore {
  load(): Promise<StoredState>
  save(change: StoreChange): Promise<void>
}

/** Хранилище в памяти. Один и тот же объект можно открыть заново — как после перезагрузки. */
export const memoryStore = (): LedgerStore => {
  const records = new Map<string, unknown>()
  const outbox = new Set<string>()
  const meta = new Map<string, unknown>()
  const clone = <T>(value: T): T => structuredClone(value)
  return {
    load: async () => ({
      records: [...records.values()].map(clone),
      outbox: [...outbox],
      meta: clone(Object.fromEntries(meta))
    }),
    save: async (change) => {
      if (change.expectedOwner !== undefined && (meta.get("userId") ?? null) !== change.expectedOwner) {
        throw new LocalUserChanged()
      }
      if (change.clear) {
        records.clear()
        outbox.clear()
        meta.clear()
      }
      for (const { key, value } of change.records ?? []) records.set(key, clone(value))
      for (const key of change.outboxAdd ?? []) outbox.add(key)
      for (const key of change.outboxRemove ?? []) outbox.delete(key)
      for (const [key, value] of Object.entries(change.meta ?? {})) meta.set(key, clone(value))
    }
  }
}
