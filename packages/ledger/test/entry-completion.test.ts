import { describe, expect, it } from "vitest"
import { add, addGoal, makeLedger } from "./support"

describe("окончание строки ввода", () => {
  it("дописывает команду возврата, сохраняя регистр, пробелы и дату", async () => {
    const { ledger } = await makeLedger()
    expect(ledger.completeEntry("возвр")).toBe("возврат ")
    expect(ledger.completeEntry("  Вчера  ВОЗВР")).toBe("  Вчера  ВОЗВРат ")
    expect(ledger.completeEntry("возврат")).toBe("возврат ")
  })

  it("не предлагает команды долгов и целей даже при существующих именах", async () => {
    const { ledger } = await makeLedger()
    await addGoal(ledger, { name: "Отпуск", target: 100000 })
    await ledger.addMovement({ kind: "lent", person: "Петя", amount: 10000 })
    for (const line of ["од", "одолжил пе", "зан", "занял пе", "мне", "мне вернули пе", "я в", "вернул пе", "отл", "отложил от", "отложить от", "снял", "снять от"]) {
      expect(ledger.completeEntry(line)).toBeNull()
    }
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

  it("подсказывает одинаковое описание, оставляя выбор покупки предпросмотру", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "Джинсы 1000")
    await add(ledger, "джинсы 2000")
    expect(ledger.completeEntry("возврат дж")).toBe("возврат джинсы")
  })

  it("дописывает только последнюю операцию пачки после суммы или разделителя", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "Джинсы 1000")
    for (const input of ["кофе 250 возврат дж", "вчера кофе 250,  возврат дж", "кофе 150,возврат дж", "кофе 250;возврат дж", "кофе 250\nвозврат дж", "кофе 99,90 возврат дж"]) {
      expect(ledger.completeEntry(input)).toBe(input + "инсы")
    }
    expect(ledger.completeEntry("кофе 250, возвр")).toBe("кофе 250, возврат ")
  })

  it("не дописывает суммы, обычные описания и доходы и не меняет журнал", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "Джинсы 1000")
    const before = ledger.pendingChanges()
    const days = ledger.days()
    for (const line of ["", " ", "вчера ", "коф", "+возвр", "кофе возвр", "возврат джинсы", "возврат дж 100", "возврат дж "]) {
      expect(ledger.completeEntry(line)).toBeNull()
    }
    expect(ledger.completeEntry("возврат дж")).toBe("возврат джинсы")
    expect(ledger.pendingChanges()).toEqual(before)
    expect(ledger.days()).toEqual(days)
  })
})
