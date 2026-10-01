import {
  recordKey,
  type CategoryData,
  type Collection,
  type GoalData,
  type OperationData,
  type RecurringData,
  type SettingsData,
  type SyncRecord
} from "@fin/domain"
import { LocalUserChanged, type LedgerStore } from "./store"

interface DataOf {
  operations: OperationData
  categories: CategoryData
  recurring: RecurringData
  settings: SettingsData
  goals: GoalData
}

export type RecordOf<C extends Collection> = SyncRecord<C, DataOf[C]>

/**
 * Все записи журнала в памяти и очередь изменений для синхронизации.
 * Каждая локальная правка получает время не раньше предыдущей, поэтому «последняя правка» однозначна.
 */
export class Records {
  private readonly byKey = new Map<string, SyncRecord>()
  private readonly outbox = new Set<string>()
  private readonly listeners = new Set<() => void>()
  private readonly meta: Map<string, unknown>
  private lastStamp = 0
  private saving: Promise<void> = Promise.resolve()
  private storageOwner: string | null
  /** Растёт при каждом изменении — для кэширования расчётов. */
  version = 0

  constructor(
    private readonly store: LedgerStore,
    private readonly now: () => number,
    records: ReadonlyArray<unknown>,
    outbox: ReadonlyArray<string>,
    meta: Readonly<Record<string, unknown>>
  ) {
    this.meta = new Map(Object.entries(meta))
    this.storageOwner = typeof meta.userId === "string" ? meta.userId : null
    for (const record of records as ReadonlyArray<SyncRecord>) {
      this.byKey.set(recordKey(record.collection, record.id), record)
      this.lastStamp = Math.max(this.lastStamp, record.updatedAt)
    }
    for (const key of outbox) this.outbox.add(key)
  }

  /** Время для новой правки: текущее, но строго позже предыдущей правки на этом устройстве. */
  stamp(): number {
    this.lastStamp = Math.max(this.now(), this.lastStamp + 1)
    return this.lastStamp
  }

  get<C extends Collection>(collection: C, id: string): RecordOf<C> | undefined {
    return this.byKey.get(recordKey(collection, id)) as RecordOf<C> | undefined
  }

  all<C extends Collection>(collection: C): Array<RecordOf<C>> {
    const out: Array<RecordOf<C>> = []
    for (const record of this.byKey.values()) if (record.collection === collection) out.push(record as RecordOf<C>)
    return out
  }

  /** Живые (не удалённые) записи. */
  live<C extends Collection>(collection: C): Array<RecordOf<C>> {
    return this.all(collection).filter((r) => !r.deleted)
  }

  /** Локальные правки: одна отметка времени на всю пачку, в очередь на отправку. */
  write(
    changes: ReadonlyArray<{ collection: Collection; id: string; data: unknown; deleted?: boolean }>,
    updatedAt: number = this.stamp()
  ): Promise<void> {
    if (changes.length === 0) return this.saving
    const records = changes.map(
      (c): SyncRecord => ({ collection: c.collection, id: c.id, updatedAt, deleted: c.deleted ?? false, data: c.data })
    )
    const keys = records.map((r) => recordKey(r.collection, r.id))
    records.forEach((r, i) => this.byKey.set(keys[i]!, r))
    keys.forEach((k) => this.outbox.add(k))
    return this.persist({ records: records.map((value, i) => ({ key: keys[i]!, value })), outboxAdd: keys })
  }

  /** Записи с сервера: принимаются, если не старше локальных (ADR-0001). `meta` сохраняется вместе с ними. */
  applyRemote(records: ReadonlyArray<SyncRecord>, meta: Record<string, unknown> = {}): Promise<void> {
    for (const [key, value] of Object.entries(meta)) this.meta.set(key, value)
    const accepted: Array<{ key: string; value: SyncRecord }> = []
    const superseded: Array<string> = []
    for (const record of records) {
      const key = recordKey(record.collection, record.id)
      const local = this.byKey.get(key)
      if (local && local.updatedAt > record.updatedAt) continue
      // локальная правка проиграла более поздней (или это она сама вернулась) — отправлять больше нечего
      if (this.outbox.delete(key)) superseded.push(key)
      if (local && sameRecord(local, record)) continue
      this.byKey.set(key, record)
      this.lastStamp = Math.max(this.lastStamp, record.updatedAt)
      accepted.push({ key, value: record })
    }
    return this.persist({ records: accepted, outboxRemove: superseded, meta }, accepted.length > 0)
  }

  pending(): Array<SyncRecord> {
    return [...this.outbox].map((k) => this.byKey.get(k)).filter((r): r is SyncRecord => r !== undefined)
  }

  /** Сервер принял эти версии: убираем их из очереди, если после отправки их не правили. */
  acknowledge(records: ReadonlyArray<SyncRecord>): Promise<void> {
    const done: Array<string> = []
    for (const sent of records) {
      const key = recordKey(sent.collection, sent.id)
      const local = this.byKey.get(key)
      if (this.outbox.has(key) && (!local || local.updatedAt <= sent.updatedAt)) {
        this.outbox.delete(key)
        done.push(key)
      }
    }
    if (done.length === 0) return this.saving
    return this.persist({ outboxRemove: done }, false)
  }

  getMeta<T>(key: string): T | undefined {
    return this.meta.get(key) as T | undefined
  }

  saveMeta(meta: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(meta)) this.meta.set(key, value)
    return this.persist({ meta }, false)
  }

  /** Стереть данные пользователя, включая очередь, курсор и производные расчёты. */
  clear(): Promise<void> {
    this.byKey.clear()
    this.outbox.clear()
    this.meta.clear()
    this.lastStamp = 0
    return this.persist({ clear: true })
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Дождаться, пока все правки лягут в хранилище. */
  flushed(): Promise<void> {
    return this.saving
  }

  private persist(change: Parameters<LedgerStore["save"]>[0], changed = true): Promise<void> {
    if (changed) {
      this.version++
      for (const listener of this.listeners) listener()
    }
    this.saving = this.saving.catch((error) => {
      // Вкладка после смены пользователя больше не может писать даже после неудачного adopt/clear.
      if (error instanceof LocalUserChanged) throw error
    }).then(async () => {
      await this.store.save({ ...change, expectedOwner: this.storageOwner })
      if (change.clear) this.storageOwner = null
      if (typeof change.meta?.userId === "string") this.storageOwner = change.meta.userId
    })
    return this.saving
  }
}

const sameRecord = (a: SyncRecord, b: SyncRecord) =>
  a.updatedAt === b.updatedAt && a.deleted === b.deleted && JSON.stringify(a.data) === JSON.stringify(b.data)
