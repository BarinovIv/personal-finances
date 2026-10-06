import { formatDecimal } from "@fin/domain"
import type { Ledger, OperationView } from "@fin/ledger"
import { RECURRING_VIEWS_CHANNEL, updateProblemText } from "./constants"
import { limitNotes, showToast } from "./toast"

export const amountText = (kopecks: number) => formatDecimal(kopecks).replace(/,00$/, "")

/** Открытые вкладки одного пользователя разделяют отметку первого показа на устройстве. */
export const shareRecurringViews = (ledger: Ledger): Ledger => {
  if (typeof BroadcastChannel === "undefined") return ledger
  const channel = new BroadcastChannel(RECURRING_VIEWS_CHANNEL)
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data
    if (typeof data !== "object" || data === null || !("id" in data) || !("userId" in data)) return
    if (typeof data.id !== "string" || data.userId !== ledger.device.owner()) return
    void ledger.markRecurringOperationSeen(data.id)
  }
  return {
    ...ledger,
    markRecurringOperationSeen: async (id) => {
      await ledger.markRecurringOperationSeen(id)
      channel.postMessage({ id, userId: ledger.device.owner() })
    }
  }
}

/** Editing one occurrence confirms it without changing its date or monthly template. */
export const confirmRecurringOperation = async (ledger: Ledger, op: OperationView, amount?: number) => {
  const result = await ledger.confirmRecurringOperation(op.id, amount)
  if (!result.ok) return updateProblemText[result.problem]
  showToast({
    text: op.pending ? "Операция подтверждена" : "Сумма сохранена",
    notes: limitNotes(result.warnings),
    action: { label: "Отменить", run: () => result.undo() }
  })
  return null
}
