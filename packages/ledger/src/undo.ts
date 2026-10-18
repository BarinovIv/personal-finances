import type { Collection } from "@fin/domain"
import type { Records } from "./records"

/**
 * «Отменить» только что сделанное изменение. Отмена — обычная правка: записям возвращаются прежние версии
 * с новым временем, поэтому она синхронизируется как любая другая (ADR-0001). Созданные записи удаляются,
 * а удалённое, у чего записи не было (стартовая категория), возвращается записью с теми же данными.
 * Если после изменения записи уже правили (здесь или на другом устройстве), отмена ничего не делает: `ok: false`.
 */
export type Undo = () => Promise<{ readonly ok: boolean }>

type Change = { readonly collection: Collection; readonly id: string; readonly data: unknown; readonly deleted?: boolean }

/** Записать правки одной пачкой и вернуть их отмену. */
export const writeUndoable = async (
  records: Records,
  changes: ReadonlyArray<Change>,
  updatedAt: number = records.stamp(),
  durable = false
): Promise<Undo> => {
  const before = changes.map((c) => records.get(c.collection, c.id))
  if (durable) await records.writeDurable(changes, updatedAt)
  else await records.write(changes, updatedAt)
  return async () => {
    const now = changes.map((c) => records.get(c.collection, c.id))
    if (now.some((r) => !r || r.updatedAt !== updatedAt)) return { ok: false }
    await records.write(
      changes.map((c, i) => {
        const previous = before[i]
        return previous
          ? { collection: c.collection, id: c.id, data: previous.data, deleted: previous.deleted }
          : { collection: c.collection, id: c.id, data: c.data, deleted: !c.deleted }
      })
    )
    return { ok: true }
  }
}
