import { describe, expect, it } from "vitest"
import { parseEntryLine, parseEntryLines } from "@fin/entry-line"

describe("команды строки ввода", () => {
  it.each([
    ["одолжил Петя 2к", "lent", "Петя", 200000],
    ["занял Петя 1к", "borrowed", "Петя", 100000],
    ["мне вернули Петя 500", "repaid-to-me", "Петя", 50000],
    ["я вернул Петя 500", "repaid-by-me", "Петя", 50000],
    ["вернул Петя 500", "repaid-by-me", "Петя", 50000],
    ["возврат шаурма 150", "refund", "шаурма", 15000],
    ["отложить отпуск 3к", "saved", "отпуск", 300000],
    ["отложил отпуск 3к", "saved", "отпуск", 300000],
    ["снять отпуск 1к", "withdrawn", "отпуск", 100000]
  ] as const)("%s", (line, kind, description, amount) => {
    expect(parseEntryLine(line)).toEqual({ kind, description, amount, dateShift: 0, problems: [] })
  })

  it("команды сохраняют правила суммы, регистра, пробелов и даты", () => {
    expect(parseEntryLine("вчера МНЕ  ВЕРНУЛИ  Пётр Иванов  1 500 руб")).toEqual({
      kind: "repaid-to-me", description: "Пётр Иванов", amount: 150000, dateShift: -1, problems: []
    })
    expect(parseEntryLine("+возврат шаурма 150").kind).toBe("income")
    expect(parseEntryLine("возвратный билет 150").kind).toBe("expense")
  })

  it.each([
    ["одолжил", "lent", ["no-amount", "no-person"]],
    ["мне вернули 500", "repaid-to-me", ["no-person"]],
    ["мне", "repaid-to-me", ["no-amount", "no-person"]],
    ["я", "repaid-by-me", ["no-amount", "no-person"]],
    ["отложить 300", "saved", ["no-goal"]],
    ["возврат 150", "refund", ["no-expense"]]
  ] as const)("недописанная команда %s не превращается в расход", (line, kind, problems) => {
    expect(parseEntryLine(line)).toMatchObject({ kind, description: "", problems })
  })

  it("смешивает команды, расходы и доходы, сохраняя общую дату", () => {
    expect(parseEntryLines("вчера одолжил Петя 2к кофе 250 отложил отпуск 1 500 ₽ +зарплата 50к возврат шаурма 150").map(
      (p) => [p.kind, p.description, p.amount, p.dateShift]
    )).toEqual([
      ["lent", "Петя", 200000, -1],
      ["expense", "кофе", 25000, -1],
      ["saved", "отпуск", 150000, -1],
      ["income", "зарплата", 5000000, -1],
      ["refund", "шаурма", 15000, -1]
    ])
  })

  it.each([
    ["ноль с разрядами", "000 000"],
    ["округление до нуля", "0,000001к"],
    ["ноль", "0"],
    ["бесконечные копейки", "9".repeat(307)],
    ["копейки без точного целого представления", "90 071 992 547 410"]
  ])(
    "не принимает некорректную сумму: %s", (_, amount) => {
      expect(parseEntryLine(`одолжил Петя ${amount}`)).toMatchObject({ kind: "lent", amount: null, problems: ["no-amount"] })
    }
  )
})
