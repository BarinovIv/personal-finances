import { recurringOperationId } from "@fin/domain"
import { describe, expect, it } from "vitest"
import { add, makeLedger } from "./support"

describe("выгрузка в CSV", () => {
  it("все операции, включая возвраты и регулярные; UTF-8 с BOM, «;», десятичная запятая", async () => {
    const { ledger } = await makeLedger()
    const jeans = await add(ledger, "джинсы 3990", { date: "2026-08-12" })
    await ledger.addRefund(jeans.id, { amount: 99050, date: "2026-09-02" })
    await add(ledger, "+зарплата 150000", { date: "2026-09-05" })
    await add(ledger, "молоко 99,90", { date: "2026-09-28" })
    await ledger.sync.receive(
      [
        {
          collection: "operations",
          id: recurringOperationId("tpl", { year: 2026, month: 9 }),
          updatedAt: 1,
          deleted: false,
          data: {
            kind: "expense",
            amount: 39900,
            description: "Яндекс Плюс",
            categoryId: "subscriptions",
            date: "2026-09-25",
            createdAt: 1,
            refundOf: null,
            recurringId: "tpl"
          }
        }
      ],
      1
    )

    const csv = ledger.exportCsv()
    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Дата;Вид;Описание;Категория;Сумма;Регулярная;Исходная операция",
      "12.08.2026;расход;джинсы;Одежда;3990,00;;",
      "02.09.2026;возврат;джинсы;Одежда;990,50;;12.08.2026 джинсы 3990,00",
      "05.09.2026;доход;зарплата;Зарплата;150000,00;;",
      "25.09.2026;расход;Яндекс Плюс;Подписки;399,00;да;",
      "28.09.2026;расход;молоко;Продукты;99,90;;",
      ""
    ])
  })

  it("удалённые операции не выгружаются", async () => {
    const { ledger } = await makeLedger()
    const op = await add(ledger, "кофе 250")
    await add(ledger, "чай 100", { categoryId: "cafe" })
    await ledger.deleteOperation(op.id)
    expect(ledger.exportCsv().slice(1).split("\r\n")).toHaveLength(3)
    expect(ledger.exportCsv()).not.toContain("кофе")
  })

  it("точка с запятой, кавычки и формулы в описании не ломают файл", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, 'подарок; "мишка" 500', { categoryId: "gifts" })
    await add(ledger, "=СУММ(A1) 100", { categoryId: "other" })
    const rows = ledger.exportCsv().slice(1).split("\r\n")
    expect(rows[1]).toBe(`28.09.2026;расход;"подарок; ""мишка""";Подарки;500,00;;`)
    expect(rows[2]).toBe(`28.09.2026;расход;'=СУММ(A1);Прочее;100,00;;`)
  })
})
