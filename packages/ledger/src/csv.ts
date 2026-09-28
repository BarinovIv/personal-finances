import { dateParts, formatDecimal, type IsoDate, type OperationKind } from "@fin/domain"
import type { LedgerContext } from "./context"

const KIND: Record<OperationKind, string> = { expense: "расход", income: "доход", refund: "возврат" }

const HEADER = ["Дата", "Вид", "Описание", "Категория", "Сумма", "Регулярная", "Исходная операция"]

const date = (iso: IsoDate) => {
  const { year, month, day } = dateParts(iso)
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`
}

/** Поле CSV: кавычки при необходимости; текст, похожий на формулу, Excel не выполнит. */
const field = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/**
 * Все живые операции в CSV для Excel: UTF-8 с BOM, разделитель «;», десятичная запятая.
 * У возврата — ссылка на исходный расход, у регулярных — пометка.
 */
export const exportCsv = (ctx: LedgerContext): string => {
  const rows = ctx
    .operations()
    .slice()
    .sort((a, b) => (a.data.date === b.data.date ? a.data.createdAt - b.data.createdAt : a.data.date < b.data.date ? -1 : 1))
    .map((record) => {
      const op = ctx.toView(record)
      const original = op.refundOf ? ctx.records.get("operations", op.refundOf) : undefined
      return [
        date(op.date),
        KIND[op.kind],
        op.description,
        op.category.name,
        formatDecimal(op.amount),
        op.recurringId ? "да" : "",
        original ? `${date(original.data.date)} ${original.data.description} ${formatDecimal(original.data.amount)}` : ""
      ]
    })
  return "﻿" + [HEADER, ...rows].map((row) => row.map(field).join(";") + "\r\n").join("")
}
