import { describe, expect, it } from "vitest"
import type { Ledger, MovementInput } from "@fin/ledger"
import { add, addGoal, makeLedger } from "./support"

const move = async (ledger: Ledger, input: MovementInput) => {
  const result = await ledger.addMovement(input)
  if (!result.ok) throw new Error(`${input.kind}: ${result.problem}`)
  return result.operation
}

describe("окончание строки ввода", () => {
  it("дописывает команды, сохраняя регистр, пробелы и дату", async () => {
    const { ledger } = await makeLedger()
    expect(ledger.completeEntry("од")).toBe("одолжил ")
    expect(ledger.completeEntry("зан")).toBe("занял ")
    expect(ledger.completeEntry("мне")).toBe("мне вернули ")
    expect(ledger.completeEntry("я в")).toBe("я вернул ")
    expect(ledger.completeEntry("  Вчера  МНЕ  в")).toBe("  Вчера  МНЕ  вернули ")
    expect(ledger.completeEntry("возвр")).toBe("возврат ")
    expect(ledger.completeEntry("снял")).toBe("снял ")
  })

  it("подсказывает единственную подходящую цель без замены введённых букв", async () => {
    const { ledger } = await makeLedger()
    const vacation = await addGoal(ledger, { name: "Отпуск", target: 100000 })
    expect(ledger.completeEntry("отложил от")).toBe("отложил отпуск")
    expect(ledger.completeEntry("отложить ОТ")).toBe("отложить ОТпуск")
    expect(ledger.completeEntry("снять от")).toBeNull()
    await move(ledger, { kind: "saved", goalId: vacation.id, amount: 10000 })
    expect(ledger.completeEntry("снял от")).toBe("снял отпуск")
    await ledger.archiveGoal(vacation.id, true)
    expect(ledger.completeEntry("отложил от")).toBe("отложил отпуск")
    await addGoal(ledger, { name: "Отпуск зимой", target: 100000 })
    expect(ledger.completeEntry("отложил от")).toBeNull()
    expect(ledger.completeEntry("отложил отпуск з")).toBe("отложил отпуск зимой")
  })

  it("использует известных людей и не предлагает погашенные долги или противоположное направление", async () => {
    const { ledger } = await makeLedger()
    const lent = await move(ledger, { kind: "lent", person: "Пётр Петров", amount: 10000 })
    const borrowed = await move(ledger, { kind: "borrowed", person: "Маша", amount: 10000 })
    expect(ledger.completeEntry("одолжил пе")).toBe("одолжил петр Петров")
    expect(ledger.completeEntry("занял ПеТР  Пе")).toBe("занял ПеТР  Петров")
    expect(ledger.completeEntry("мне вернули пе")).toBe("мне вернули петр Петров")
    expect(ledger.completeEntry("я вернул пе")).toBeNull()
    expect(ledger.completeEntry("вернул ма")).toBe("вернул маша")
    expect(ledger.completeEntry("мне вернули ма")).toBeNull()
    await move(ledger, { kind: "repaid-to-me", debtId: lent.id })
    await move(ledger, { kind: "repaid-by-me", debtId: borrowed.id })
    expect(ledger.completeEntry("мне вернули пе")).toBeNull()
    expect(ledger.completeEntry("вернул ма")).toBeNull()
    expect(ledger.completeEntry("занял пе")).toBe("занял петр Петров")
  })

  it("для возврата предлагает только живые расходы с невозвращённой суммой", async () => {
    const { ledger } = await makeLedger()
    const jeans = await add(ledger, "Джинсы 1000")
    const shoes = await add(ledger, "Ботинки 2000")
    await add(ledger, "+Бонус 5000")
    expect(ledger.completeEntry("возврат дж")).toBe("возврат джинсы")
    expect(ledger.completeEntry("возврат бонус")).toBeNull()
    await ledger.addRefund(jeans.id, { amount: 50000 })
    expect(ledger.completeEntry("возврат дж")).toBe("возврат джинсы")
    await ledger.addRefund(jeans.id)
    expect(ledger.completeEntry("возврат дж")).toBeNull()
    await ledger.deleteOperation(shoes.id)
    expect(ledger.completeEntry("возврат бо")).toBeNull()
  })

  it("подсказывает одинаковое имя цели или расхода, оставляя выбор исходной операции предпросмотру", async () => {
    const { ledger } = await makeLedger()
    const goal = await addGoal(ledger, { name: "Самолёт", target: 100000 })
    expect(ledger.completeEntry("отложил само")).toBe("отложил самолёт")
    await addGoal(ledger, { name: "самолет", target: 100000 })
    expect(ledger.completeEntry("отложил само")).toBe("отложил самолёт")
    await ledger.deleteGoal(goal.id)
    expect(ledger.completeEntry("отложил само")).toBe("отложил самолет")
    await add(ledger, "Джинсы 1000")
    await add(ledger, "джинсы 2000")
    expect(ledger.completeEntry("возврат дж")).toBe("возврат джинсы")
  })

  it("дописывает только последнюю операцию пачки после суммы или разделителя", async () => {
    const { ledger } = await makeLedger()
    await addGoal(ledger, { name: "Отпуск", target: 100000 })
    for (const input of ["кофе 250 отложил от", "вчера кофе 250,  отложил от", "кофе 150,отложил от", "кофе 250;отложил от", "кофе 250\nотложил от", "кофе 99,90 отложил от"]) {
      expect(ledger.completeEntry(input)).toBe(input + "пуск")
    }
    expect(ledger.completeEntry("кофе 250, отл")).toBe("кофе 250, отложить ")
  })

  it("не дописывает суммы, обычные описания и доходы и не меняет журнал", async () => {
    const { ledger } = await makeLedger()
    await addGoal(ledger, { name: "Отпуск", target: 100000 })
    const before = ledger.pendingChanges()
    for (const line of ["", " ", "вчера ", "коф", "+од", "+отложил от", "кофе од", "отложил отпуск", "отложил от 100", "отложил от "]) {
      expect(ledger.completeEntry(line)).toBeNull()
    }
    expect(ledger.completeEntry("отложил от")).toBe("отложил отпуск")
    expect(ledger.pendingChanges()).toEqual(before)
    expect(ledger.days()).toEqual([])
  })
})
