import { useEffect, useRef, useState } from "preact/hooks"
import { useTabActive } from "../tabActivity"
import { RECURRING_HIGHLIGHT_MS } from "./constants"
import type { OperationRowProps } from "./types"

/** A hidden tab or a row below the viewport has not been shown to the user yet. */
export const useRecurringHighlight = ({ op, hasSeen, markSeen }: OperationRowProps) => {
  const active = useTabActive()
  const row = useRef<HTMLDivElement>(null)
  const [highlight, setHighlight] = useState(false)

  useEffect(() => {
    const element = row.current
    if (!active || !op.pending || !op.recurringId || !element || !hasSeen || !markSeen || hasSeen(op.id)) return
    let shown = false
    let intersecting = false
    let timer: number | undefined
    const show = () => {
      if (shown || !intersecting || document.visibilityState !== "visible" || hasSeen(op.id)) return
      shown = true
      void markSeen(op.id)
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setHighlight(true)
        timer = window.setTimeout(() => setHighlight(false), RECURRING_HIGHLIGHT_MS)
      }
    }
    const observer = new IntersectionObserver((entries) => {
      intersecting = entries.some((entry) => entry.isIntersecting)
      show()
    })
    observer.observe(element)
    document.addEventListener("visibilitychange", show)
    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", show)
      window.clearTimeout(timer)
      setHighlight(false)
    }
  }, [active, op.id, op.pending, op.recurringId, hasSeen, markSeen])

  return { row, highlight }
}
