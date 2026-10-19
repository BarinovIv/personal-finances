import type { OperationData } from "@fin/domain"
import { CATEGORY_PALETTE } from "../categories"
import type { LedgerContext } from "../context"
import { exportCsv } from "../csv"
import { OPERATION_KIND_TEXT } from "../format"
import { normalizeIcon } from "../icons"
import type { CsvProblem, CsvRow, CsvChange, CsvImportOptions } from "../types"

/** Разобрать CSV без потери переводов строк внутри кавычек. */
export const parseCsvRows = (text: string): string[][] | null => {
  const input = text.replace(/^\uFEFF/, "")
  const rows: string[][] = []
  let row: string[] = []
  let value = ""
  let quoted = false
  let closed = false
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { value += '"'; i++ }
        else { quoted = false; closed = true }
      } else value += char
      continue
    }
    if (char === '"') {
      if (value || closed) return null
      quoted = true
    } else if (char === ";" || char === "\r" || char === "\n") {
      row.push(value)
      value = ""
      closed = false
      if (char !== ";") {
        rows.push(row)
        row = []
        if (char === "\r" && input[i + 1] === "\n") i++
      }
    } else {
      if (closed) return null
      value += char
    }
  }
  if (quoted) return null
  if (value || closed || row.length) { row.push(value); rows.push(row) }
  return rows
}

export const csvDate = (value: string): string | null => {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value)
  if (!match) return null
  const [, day, month, year] = match
  const iso = `${year}-${month}-${day}`
  const parsed = new Date(`${iso}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null
}

export const csvAmount = (value: string): number | null => {
  if (!/^\d+,\d{2}$/.test(value)) return null
  const cents = Number(value.replace(",", ""))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

/** Отменить защитный апостроф, который добавляет наша выгрузка. */
export const csvText = (value: string): string => /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value

export const planCsv = (ctx: LedgerContext, text: string, options: CsvImportOptions = {}, commit = false) => {
  let sequence = 0
  const newId = () => commit ? ctx.newId() : `preview-${++sequence}`
  const stampOf = () => commit ? ctx.records.stamp() : sequence
  const signature = (row: string[]) => JSON.stringify(row.map((value, index) => index === 3 ? value.toLocaleLowerCase("ru") : value))
  const rows = parseCsvRows(text)
  const existing = parseCsvRows(exportCsv(ctx))!
  const problems: CsvProblem[] = []
  const ignored: CsvProblem[] = []
  const ignoredRows = new Set(options.ignoredRows)
  if (!rows || JSON.stringify(rows[0]) !== JSON.stringify(existing[0])) {
    return { ok: false, problems: [{ row: 1, message: "Не удалось прочитать CSV приложения: проверьте заголовок и кавычки." }] } as const
  }
  const available = new Map<string, number>()
  for (const row of existing.slice(1)) {
    const key = signature(row)
    available.set(key, (available.get(key) ?? 0) + 1)
  }
  const changes: CsvChange[] = []
  const categories = [...ctx.categories().values()]
  const newRows: CsvRow[] = []
  let duplicates = 0
  let added = 0
  for (const [index, row] of rows.slice(1).entries()) {
    const rowNumber = index + 2
    const fail = (message: string, ignorable = false) => {
      const problem: CsvProblem = ignorable ? { row: rowNumber, message, ignorable: true } : { row: rowNumber, message }
      if (ignorable && ignoredRows.has(rowNumber)) ignored.push(problem)
      else problems.push(problem)
    }
    if (row.length !== 8) { fail("В строке должно быть 8 столбцов."); continue }
    const [rawDate = "", kind = "", rawDescription = "", rawCategory = "", rawAmount = "", recurring = "", original = "", rawPerson = ""] = row
    const date = csvDate(rawDate)
    const amount = csvAmount(rawAmount)
    if (!date || amount === null) { fail("Некорректная дата или сумма: нужна положительная сумма с двумя знаками после запятой."); continue }
    if (!Object.values(OPERATION_KIND_TEXT).includes(kind)) { fail("Неизвестный вид операции."); continue }
    const key = signature(row)
    const count = available.get(key) ?? 0
    if (count > 0) { available.set(key, count - 1); duplicates++; continue }
    const description = csvText(rawDescription)
    const categoryName = csvText(rawCategory)
    const person = csvText(rawPerson)
    if ((kind === "расход" || kind === "доход") && (!description.trim() || !categoryName.trim() || original || person)) {
      fail("У расхода и дохода нужны описание и категория; ссылка и человек должны быть пустыми."); continue
    }
    if ((kind === "одолжил" || kind === "занял") && (!person.trim() || categoryName || original)) {
      fail("У долга нужен человек, без категории и исходной операции."); continue
    }
    if (recurring) {
      fail("У отсутствующей регулярной операции нельзя восстановить связь с шаблоном из CSV.", kind === "расход" || kind === "доход"); continue
    }
    let data: OperationData
    const stamp = stampOf()
    if (kind === "расход" || kind === "доход") {
      const operationKind = kind === "расход" ? "expense" : "income"
      let category = categories.find((c) => c.kind === operationKind && c.name.toLocaleLowerCase("ru") === categoryName.toLocaleLowerCase("ru"))
      if (!category) {
        category = { id: newId(), kind: operationKind, name: categoryName, icon: normalizeIcon("", operationKind), color: CATEGORY_PALETTE[0]!, limit: null }
        categories.push(category)
        changes.push({ collection: "categories", id: category.id, data: { kind: category.kind, name: category.name, icon: category.icon, color: category.color } })
      }
      data = { kind: operationKind, amount, description, categoryId: category.id, date, createdAt: stamp, categorizedAt: stamp, refundOf: null, recurringId: null }
    } else if (kind === "одолжил" || kind === "занял") {
      data = { kind: kind === "одолжил" ? "lent" : "borrowed", amount, description, person, categoryId: "", date, createdAt: stamp, categorizedAt: stamp, refundOf: null, recurringId: null }
    } else {
      fail("Этот вид операции нельзя однозначно восстановить из CSV: отсутствуют идентификаторы цели или исходной операции.", true); continue
    }
    changes.push({ collection: "operations", id: newId(), data })
    newRows.push({ row: rowNumber, date, kind, description, category: categoryName, amount })
    added++
  }
  return problems.length ? { ok: false, problems } as const : { ok: true, total: rows.length - 1, duplicates, added, rows: newRows, ignored, changes } as const
}
