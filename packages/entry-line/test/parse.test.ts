import { describe, expect, it } from "vitest"
import { parseEntryLine } from "@fin/entry-line"

describe("строка ввода", () => {
  it.each([
    // строка, вид, сумма (копейки), описание, сдвиг даты
    ["футболка 1500", "expense", 150000, "футболка", 0],
    ["1500 футболка", "expense", 150000, "футболка", 0],
    ["кофе 250", "expense", 25000, "кофе", 0],
    ["футболка 1 500", "expense", 150000, "футболка", 0],
    ["1 500 футболка", "expense", 150000, "футболка", 0],
    ["телевизор 1 250 000", "expense", 125000000, "телевизор", 0],
    ["молоко 99.90", "expense", 9990, "молоко", 0],
    ["молоко 99,90", "expense", 9990, "молоко", 0],
    ["молоко 99,9", "expense", 9990, "молоко", 0],
    ["обед 1.5к", "expense", 150000, "обед", 0],
    ["обед 1,2к", "expense", 120000, "обед", 0],
    ["куртка 2к", "expense", 200000, "куртка", 0],
    ["куртка 2К", "expense", 200000, "куртка", 0],
    ["кофе 250р", "expense", 25000, "кофе", 0],
    ["кофе 250 ₽", "expense", 25000, "кофе", 0],
    ["+зарплата 150000", "income", 15000000, "зарплата", 0],
    ["+подработка 12000", "income", 1200000, "подработка", 0],
    ["+ кэшбэк 350", "income", 35000, "кэшбэк", 0],
    ["+5000 подарок от мамы", "income", 500000, "подарок от мамы", 0],
    ["вчера такси 450", "expense", 45000, "такси", -1],
    ["Вчера такси 450", "expense", 45000, "такси", -1],
    ["такси вчера 450", "expense", 45000, "такси", -1],
    ["позавчера кино 800", "expense", 80000, "кино", -2],
    ["+вчера зарплата 95000", "income", 9500000, "зарплата", -1],
    ["2 кофе 500", "expense", 50000, "2 кофе", 0],
    ["  футболка   для  сына   1500 ", "expense", 150000, "футболка для сына", 0],
    ["Яндекс Go 350", "expense", 35000, "Яндекс Go", 0]
  ] as const)("«%s» → %s %i «%s»", (line, kind, amount, description, dateShift) => {
    expect(parseEntryLine(line)).toEqual({ kind, amount, description, dateShift, problems: [] })
  })

  it.each([
    ["футболка", ["no-amount"]],
    ["футболка 0", ["no-amount"]],
    ["1500", ["no-description"]],
    ["вчера 1500", ["no-description"]],
    ["+", ["no-amount", "no-description"]],
    ["", ["no-amount", "no-description"]]
  ] as const)("«%s» не сохраняется: %j", (line, problems) => {
    expect(parseEntryLine(line).problems).toEqual(problems)
  })

  it("без суммы описание всё равно распознаётся", () => {
    expect(parseEntryLine("вчера футболка")).toEqual({
      kind: "expense",
      amount: null,
      description: "футболка",
      dateShift: -1,
      problems: ["no-amount"]
    })
  })
})
