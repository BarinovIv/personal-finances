import type { Ledger, OperationView } from "@fin/ledger"

export interface OperationRowProps {
  op: OperationView
  sub?: string
  onDelete?: (op: OperationView) => void
  onConfirm?: (op: OperationView) => void
  onEditAmount?: (op: OperationView) => void
  hasSeen?: (id: string) => boolean
  markSeen?: (id: string) => Promise<void>
  leaving?: boolean
}

export interface RecurringAmountSheetProps {
  ledger: Ledger
  op: OperationView
  onClose: () => void
  details?: boolean
}
