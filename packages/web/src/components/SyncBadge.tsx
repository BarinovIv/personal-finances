import type { Sync, SyncState } from "@fin/sync"
import { memo } from "preact/compat"
import { useEffect, useState } from "preact/hooks"
import { CloudIcon } from "../icons"

/**
 * Состояние синхронизации. Статус приходит новым объектом на каждое изменение журнала и каждый обмен
 * с сервером — храним только состояние, чтобы перерисовываться, лишь когда оно действительно сменилось.
 */
const useSyncState = (sync: Sync): SyncState => {
  const [state, setState] = useState(() => sync.status().state)
  useEffect(() => sync.subscribe((status) => setState(status.state)), [sync])
  return state
}

/** Синхронизация обозначена значком; текст появляется, если нужен вход. */
export const SyncBadge = memo(({ sync }: { sync: Sync }) => {
  const state = useSyncState(sync)
  if (state === "synced") {
    return (
      <span class="sync-status" role="status" aria-label="синхронизировано" title="синхронизировано">
        <CloudIcon size={16} />
      </span>
    )
  }
  if (state === "pending") {
    return (
      <span class="sync-status waiting" role="status" aria-label="ждёт сети" title="ждёт сети">
        <CloudIcon size={20} warning />
      </span>
    )
  }
  return (
    <span class="sync-status pending" role="status">
      <CloudIcon size={14} />
      нужен вход
    </span>
  )
})
