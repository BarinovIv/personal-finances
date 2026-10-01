import { formatMoney } from "@fin/domain"
import type { DailyAllowance } from "@fin/ledger"

export interface AllowanceItem {
  readonly label: string
  readonly value: string
  /** Превышение за сегодня — показывается красным. */
  readonly over: boolean
}

/** «Можно тратить в день» и «сегодня осталось» — одними словами на экране ввода и на дашборде. */
export const allowanceItems = (a: DailyAllowance): Array<AllowanceItem> => {
  if (a.kind === "overspent") {
    return a.overspent > 0 ? [] : [{ label: "Можно тратить в день", value: formatMoney(0), over: false }]
  }
  return [
    { label: "Можно тратить в день", value: formatMoney(a.perDay), over: false },
    a.leftToday >= 0
      ? { label: "Сегодня осталось", value: formatMoney(a.leftToday), over: false }
      : { label: "Превышение за сегодня", value: formatMoney(-a.leftToday), over: true }
  ]
}
