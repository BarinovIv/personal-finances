import type { Sync, SyncStatus } from "@fin/sync"
import { useEffect, useState } from "preact/hooks"
import { CloudIcon } from "../icons"

export const useSyncStatus = (sync: Sync): SyncStatus => {
  const [status, setStatus] = useState(sync.status())
  useEffect(() => sync.subscribe(setStatus), [sync])
  return status
}

export const SyncBadge = ({ sync }: { sync: Sync }) => {
  const status = useSyncStatus(sync)
  const pending = status.state !== "synced"
  return (
    <span class={`sync-status ${pending ? "pending" : ""}`} role="status">
      <CloudIcon size={14} />
      {status.state === "synced" ? "синхронизировано" : status.state === "pending" ? "ждёт сети" : "нужен вход"}
    </span>
  )
}
