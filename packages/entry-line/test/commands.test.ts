import { describe, expect, it } from "vitest"
import { parseEntryLine, parseEntryLines } from "@fin/entry-line"

describe("бывшие команды — обычные описания", () => {
  it.each([
    ["одолжил Петя 2к", "expense", "одолжил Петя", 200000],
    ["занял Петя 1к", "expense", "занял Петя", 100000],
    ["мне вернули Петя 500", "expense", "мне вернули Петя", 50000],
    ["я вернул Петя 500", "expense", "я вернул Петя", 50000],
    ["вернул Петя 500", "expense", "вернул Петя", 50000],
    ["возврат шаурма 150", "expense", "возврат шаурма", 15000],
    ["отложить отпуск 3к", "expense", "отложить отпуск", 300000],
    ["отложил отпуск 3к", "expense", "отложил отпуск", 300000],
    ["снять отпуск 1к", "expense", "снять отпуск", 100000],
    ["снял отпуск 1к", "expense", "снял отпуск", 100000]
  ] as const)("%s", (line, kind, description, amount) => {
    expect(parseEntryLine(line)).toEqual({ kind, description, amount, dateShift: 0, problems: [] })
  })

  it("описания сохраняют правила суммы, регистра, пробелов и даты", () => {
    expect(parseEntryLine("вчера ВОЗВРАТ  Пётр Иванов  (1 500) руб")).toEqual({
      kind: "expense", description: "ВОЗВРАТ Пётр Иванов", amount: 150000, dateShift: -1, problems: []
    })
    expect(parseEntryLine("+возврат шаурма 150").kind).toBe("income")
    expect(parseEntryLine("возвратный билет 150").kind).toBe("expense")
  })

  it.each([
    ["возврат", ["no-amount"]],
    ["возврат 150", []]
  ] as const)("%s сохраняет описание", (line, problems) => {
    expect(parseEntryLine(line)).toMatchObject({ kind: "expense", description: "возврат", problems })
  })

  it("смешивает описания расходов и доходы, сохраняя общую дату", () => {
    expect(parseEntryLines("вчера одолжил Петя 2к кофе 250 отложил отпуск (1 500) ₽ +зарплата 50к возврат шаурма 150").map(
      (p) => [p.kind, p.description, p.amount, p.dateShift]
    )).toEqual([
      ["expense", "одолжил Петя", 200000, -1],
      ["expense", "кофе", 25000, -1],
      ["expense", "отложил отпуск", 150000, -1],
      ["income", "зарплата", 5000000, -1],
      ["expense", "возврат шаурма", 15000, -1]
    ])
  })

  it.each([
    ["ноль с ведущими нулями", "000"],
    ["округление до нуля", "0,000001к"],
    ["ноль", "0"],
    ["бесконечные копейки", "9".repeat(307)],
    ["копейки без точного целого представления", "90071992547410"]
  ])(
    "не принимает некорректную сумму: %s", (_, amount) => {
      expect(parseEntryLine(`возврат шаурма ${amount}`)).toMatchObject({ kind: "expense", amount: null, problems: ["no-amount"] })
    }
  )
})
