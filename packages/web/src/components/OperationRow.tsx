import { formatMoney } from "@fin/domain"
import type { OperationView } from "@fin/ledger"
import { RefundIcon, RepeatIcon } from "../icons"

export const signedAmount = (op: Pick<OperationView, "kind" | "amount">) =>
  formatMoney(op.amount, { sign: op.kind === "expense" ? "−" : "+" })

export const OperationRow = ({ op, sub }: { op: OperationView; sub?: string }) => (
  <a class="op-row" href={`#/op/${op.id}`}>
    <span class="dot" style={{ background: op.category.color }} />
    <span class="op-main">
      <span class="op-desc">
        {op.kind === "refund" && <RefundIcon label="Возврат" />}
        <span>{op.kind === "refund" ? `Возврат: ${op.description}` : op.description}</span>
        {op.recurringId && <RepeatIcon label="Регулярная операция" />}
      </span>
      <span class="op-sub">{sub ?? op.category.name + (op.recurringId ? " · регулярная" : "")}</span>
    </span>
    <span class={`op-amount num ${op.kind}`}>{signedAmount(op)}</span>
  </a>
)
