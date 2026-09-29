import { dateParts, formatDecimal, type IsoDate, type OperationData } from "@fin/domain"
import type { LedgerContext } from "./context"
import { OPERATION_KIND_TEXT } from "./format"

const HEADER = ["Дата", "Вид", "Описание", "Категория", "Сумма", "Регулярная", "Исходная операция", "Человек"]

const date = (iso: IsoDate) => {
  const { year, month, day } = dateParts(iso)
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`
}

/** Поле CSV: кавычки при необходимости; текст, похожий на формулу, Excel не выполнит. */
const field = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Исходная операция словами: описание, а у долга без описания — вид и человек. */
const describe = (data: OperationData) => data.description || `${OPERATION_KIND_TEXT[data.kind]} ${data.person ?? ""}`.trim()

/**
 * Все живые операции в CSV для Excel: UTF-8 с BOM, разделитель «;», десятичная запятая.
 * У возврата — ссылка на исходный расход, у погашения — на долг, у регулярных — пометка.
 * У операций вне расходов и доходов категории нет; у долгов и погашений — человек.
 */
export const exportCsv = (ctx: LedgerContext): string => {
  const rows = ctx
    .operations()
    .slice()
    .sort((a, b) => (a.data.date === b.data.date ? a.data.createdAt - b.data.createdAt : a.data.date < b.data.date ? -1 : 1))
    .map((record) => {
      const op = ctx.toView(record)
      const parent = op.refundOf ?? op.repaymentOf
      const original = parent ? ctx.records.get("operations", parent) : undefined
      return [
        date(op.date),
        OPERATION_KIND_TEXT[op.kind],
        op.description,
        op.category?.name ?? "",
        formatDecimal(op.amount),
        op.recurringId ? "да" : "",
        original ? `${date(original.data.date)} ${describe(original.data)} ${formatDecimal(original.data.amount)}` : "",
        op.person ?? ""
      ]
    })
  return "﻿" + [HEADER, ...rows].map((row) => row.map(field).join(";") + "\r\n").join("")
}
