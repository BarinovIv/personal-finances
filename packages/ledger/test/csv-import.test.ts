import { describe, expect, it } from "vitest"
import { memoryStore, openLedger } from "@fin/ledger"
import { add, makeLedger } from "./support"

const header = "Дата;Вид;Описание;Категория;Сумма;Регулярная;Исходная операция;Человек\r\n"
const coffee = "28.09.2026;расход;кофе;Кафе;250,00;;;\r\n"

describe("восстановление CSV", () => {
  it("сохраняет число одинаковых покупок, повторный импорт ничего не добавляет", async () => {
    const { ledger } = await makeLedger()
    const csv = header + coffee + coffee
    expect(ledger.previewCsv(csv)).toMatchObject({ ok: true, total: 2, added: 2, duplicates: 0 })
    expect(ledger.exportCsv()).not.toContain("кофе")
    expect(await ledger.importCsv(csv)).toMatchObject({ ok: true, added: 2 })
    expect(await ledger.importCsv(csv)).toMatchObject({ ok: true, added: 0, duplicates: 2 })
    expect(ledger.exportCsv().split("кофе")).toHaveLength(3)
  })

  it("одновременные импорты одного файла не создают лишние операции", async () => {
    const { ledger } = await makeLedger()
    const csv = header + coffee + coffee
    const results = await Promise.all([ledger.importCsv(csv), ledger.importCsv(csv)])
    expect(results[0]).toMatchObject({ ok: true, added: 2, duplicates: 0 })
    expect(results[1]).toMatchObject({ ok: true, added: 0, duplicates: 2 })
    expect(ledger.exportCsv().split("кофе")).toHaveLength(3)
  })

  it("пересчитывает совпадения после предпросмотра", async () => {
    const { ledger } = await makeLedger()
    const source = await makeLedger()
    await add(source.ledger, "кофе 250", { categoryId: "cafe" })
    const csv = source.ledger.exportCsv()
    expect(ledger.previewCsv(csv)).toMatchObject({ ok: true, added: 1 })
    await add(ledger, "кофе 250", { categoryId: "cafe" })
    expect(await ledger.importCsv(csv)).toMatchObject({ ok: true, added: 0, duplicates: 1 })
  })

  it("восстанавливает новые категории, кавычки, переводы строк и защиту формул", async () => {
    const { ledger } = await makeLedger()
    const source = await makeLedger()
    const category = await source.ledger.addCategory("expense", "Моя категория")
    if (!category.ok) throw new Error()
    await add(source.ledger, '=формула; "текст" 123,45', { categoryId: category.category.id })
    const csv = source.ledger.exportCsv()
    expect(await ledger.importCsv(csv)).toMatchObject({ ok: true, added: 1 })
    expect(ledger.exportCsv()).toBe(csv)
    const multiline = header + '28.09.2026;расход;"два\nряда";Прочее;1,00;;;\r\n'
    expect(await ledger.importCsv(multiline)).toMatchObject({ ok: true, added: 1 })
    expect(ledger.exportCsv()).toContain('"два\nряда"')
  })

  it("ошибка одной строки не сохраняет другие операции или категории", async () => {
    const { ledger } = await makeLedger()
    const before = ledger.exportCsv()
    const categories = ledger.categories("expense")
    const csv = header + coffee + "31.02.2026;расход;ошибка;Новая;1,00;;;\r\n"
    expect(await ledger.importCsv(csv)).toMatchObject({ ok: false, problems: [{ row: 3 }] })
    expect(ledger.exportCsv()).toBe(before)
    expect(ledger.categories("expense")).toEqual(categories)
  })

  it("не угадывает отсутствующие цели, связи и регулярные шаблоны", async () => {
    const { ledger } = await makeLedger()
    for (const row of ["28.09.2026;отложено;;;1,00;;;", "28.09.2026;расход;кофе;Кафе;1,00;да;;", "28.09.2026;возврат;кофе;Кафе;1,00;;28.09.2026 кофе 250,00;"]) {
      expect(await ledger.importCsv(header + row)).toMatchObject({ ok: false, problems: [{ row: 2, ignorable: true }] })
    }
    expect(ledger.exportCsv()).toBe("\uFEFF" + header)
  })

  it("пропускает выбранные неподдерживаемые строки, сохраняя число одинаковых покупок", async () => {
    const { ledger } = await makeLedger()
    await ledger.importCsv(header + coffee)
    const csv = header + "28.09.2026;отложено;;;1,00;;;\r\n" + coffee
      + "28.09.2026;расход;интернет;Связь;650,00;да;;\r\n" + coffee
    const options = { ignoredRows: [2, 4] }
    const preview = ledger.previewCsv(csv, options)
    expect(preview).toMatchObject({
      ok: true, total: 4, added: 1, duplicates: 1,
      ignored: [{ row: 2, ignorable: true }, { row: 4, ignorable: true }],
      rows: [{ row: 5, description: "кофе" }]
    })
    if (!preview.ok) throw new Error()
    expect(preview.ignored.every((problem) => problem.message.length > 0)).toBe(true)
    expect(await ledger.importCsv(csv, options)).toMatchObject({ ok: true, total: 4, added: 1, duplicates: 1, ignored: preview.ignored })
    expect(await ledger.importCsv(csv, options)).toMatchObject({ ok: true, total: 4, added: 0, duplicates: 2, ignored: preview.ignored })
    expect(ledger.exportCsv().split("кофе")).toHaveLength(3)
    expect(ledger.previewCsv(csv)).toMatchObject({ ok: false, problems: [{ row: 2 }, { row: 4 }] })
  })

  it("не позволяет пропускать ошибки формата, даты, суммы и обязательных полей", async () => {
    const { ledger } = await makeLedger()
    const rows = [
      "28.09.2026;расход;кофе;Кафе;1,00;да;",
      "31.02.2026;отложено;;;1,00;;;",
      "28.09.2026;отложено;;;0,00;;;",
      "28.09.2026;расход;;Кафе;1,00;да;;",
      "28.09.2026;одолжил;;;1,00;да;;"
    ]
    for (const row of rows) {
      const csv = header + row
      const options = { ignoredRows: [1, 2] }
      const preview = ledger.previewCsv(csv, options)
      expect(preview).toMatchObject({ ok: false, problems: [{ row: 2 }] })
      if (preview.ok) throw new Error()
      expect(preview.problems[0]?.ignorable).not.toBe(true)
      expect(await ledger.importCsv(csv, options)).toEqual(preview)
    }
    expect(ledger.previewCsv("сломанный заголовок", { ignoredRows: [1] })).toMatchObject({ ok: false, problems: [{ row: 1 }] })
    expect(ledger.exportCsv()).toBe("\uFEFF" + header)
  })

  it("считает выбранную неподдерживаемую строку совпадением, если операция уже есть", async () => {
    const { ledger } = await makeLedger()
    const operation = await add(ledger, "кофе 250", { categoryId: "cafe" })
    expect(await ledger.addRefund(operation.id, { amount: 10000, date: "2026-09-28" })).toMatchObject({ ok: true })
    const csv = ledger.exportCsv()
    const options = { ignoredRows: [3] }
    expect(ledger.previewCsv(csv, options)).toMatchObject({ ok: true, total: 2, added: 0, duplicates: 2, ignored: [] })
    expect(await ledger.importCsv(csv, options)).toMatchObject({ ok: true, total: 2, added: 0, duplicates: 2, ignored: [] })
    expect(ledger.exportCsv()).toBe(csv)
  })

  it("не позволяет пропустить неизвестный или пустой вид операции с регулярной пометкой или без неё", async () => {
    const { ledger } = await makeLedger()
    for (const kind of ["расхд", ""]) {
      for (const recurring of ["", "да"]) {
        const csv = header + `28.09.2026;${kind};кофе;Кафе;250,00;${recurring};;\r\n`
        const options = { ignoredRows: [2] }
        const preview = ledger.previewCsv(csv, options)
        expect(preview).toEqual({ ok: false, problems: [{ row: 2, message: "Неизвестный вид операции." }] })
        expect(await ledger.importCsv(csv, options)).toEqual(preview)
      }
    }
    expect(ledger.exportCsv()).toBe("\uFEFF" + header)
  })

  it("с выбранным пропуском предпросмотр не пишет данные, а другая ошибка отменяет весь импорт", async () => {
    const store = memoryStore()
    let ids = 0
    const ledger = await openLedger({ store, newId: () => `id-${++ids}` })
    const before = await store.load()
    const categories = ledger.categories("expense")
    const csv = header + "28.09.2026;отложено;;;1,00;;;\r\n" + coffee.replace("Кафе", "Новая")
    const options = { ignoredRows: [2, 3] }
    expect(ledger.previewCsv(csv, options)).toMatchObject({ ok: true, added: 1, ignored: [{ row: 2 }] })
    expect(ids).toBe(0)
    expect(await store.load()).toEqual(before)
    expect(await ledger.importCsv(csv + "31.02.2026;расход;ошибка;Новая;1,00;;;\r\n", options)).toMatchObject({ ok: false, problems: [{ row: 4 }] })
    expect(await store.load()).toEqual(before)
    expect(ledger.categories("expense")).toEqual(categories)
    expect(ledger.days()).toEqual([])
  })

  it("поддерживает долги и общую отмену импорта", async () => {
    const { ledger } = await makeLedger()
    const result = await ledger.importCsv(header + coffee + "28.09.2026;одолжил;;;100,00;;;Петя\r\n")
    expect(result).toMatchObject({ ok: true, added: 2 })
    if (!result.ok) throw new Error()
    expect(await result.undo()).toEqual({ ok: true })
    expect(ledger.exportCsv()).toBe("\uFEFF" + header)
  })

  it("предпросмотр не расходует идентификаторы и ничего не записывает", async () => {
    const store = memoryStore()
    let ids = 0
    const ledger = await openLedger({ store, newId: () => `id-${++ids}` })
    const before = await store.load()
    ledger.previewCsv(header + coffee.replace("Кафе", "Новая"))
    expect(ids).toBe(0)
    expect(await store.load()).toEqual(before)
  })

  it("после ошибки хранилища повторный импорт восстанавливает данные и переживает перезапуск", async () => {
    const store = memoryStore()
    let fail = true
    const ledger = await openLedger({ store: {
      load: () => store.load(),
      save: async (change) => {
        if (fail) { fail = false; throw new Error("Нет места") }
        await store.save(change)
      }
    } })
    const csv = header + coffee.replace("Кафе", "Новая категория")
    await expect(ledger.importCsv(csv)).rejects.toThrow("Нет места")
    expect(ledger.previewCsv(csv)).toMatchObject({ ok: true, added: 1, duplicates: 0 })
    expect(ledger.categories("expense").some((category) => category.name === "Новая категория")).toBe(false)
    expect(ledger.pendingChanges()).toEqual([])
    expect((await store.load()).records).toEqual([])
    expect(await ledger.importCsv(csv)).toMatchObject({ ok: true, added: 1, duplicates: 0 })
    const reopened = await openLedger({ store })
    expect(reopened.previewCsv(csv)).toMatchObject({ ok: true, added: 0, duplicates: 1 })
    expect(reopened.exportCsv()).toBe(ledger.exportCsv())
  })

  it("не публикует операцию без категории при отложенной ошибке сохранения", async () => {
    const store = memoryStore()
    let rejectSave: (error: Error) => void = () => { throw new Error("Сохранение не началось") }
    let markStarted: () => void = () => {}
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    let writes = 0
    const ledger = await openLedger({ store: {
      load: () => store.load(),
      save: async (change) => {
        if (writes++ === 0) await new Promise<void>((_resolve, reject) => { rejectSave = reject; markStarted() })
        await store.save(change)
      }
    } })
    const csv = header + coffee.replace("Кафе", "Новая категория")
    const importing = ledger.importCsv(csv)
    await started
    expect(ledger.days()).toEqual([])
    expect(ledger.categories("expense").some((category) => category.name === "Новая категория")).toBe(false)
    rejectSave(new Error("Ошибка диска"))
    await expect(importing).rejects.toThrow("Ошибка диска")
    expect(await ledger.importCsv(csv)).toMatchObject({ ok: true, added: 1 })
    const operation = ledger.days()[0]!.items[0]!
    expect(await ledger.updateOperation(operation.id, { description: "новое описание" })).toMatchObject({ ok: true })
    const reopened = await openLedger({ store })
    expect(reopened.operation(operation.id)?.category?.name).toBe("Новая категория")
    expect(reopened.operation(operation.id)?.description).toBe("новое описание")
    expect(await reopened.importCsv(reopened.exportCsv())).toMatchObject({ ok: true, added: 0, duplicates: 1 })
  })

  it("очистка устройства во время сохранения не возвращает импортированные данные", async () => {
    const store = memoryStore()
    let release: () => void = () => {}
    let markStarted: () => void = () => {}
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    let writes = 0
    const ledger = await openLedger({ store: {
      load: () => store.load(),
      save: async (change) => {
        if (writes++ === 0) await new Promise<void>((resolve) => { release = resolve; markStarted() })
        await store.save(change)
      }
    } })
    const importing = ledger.importCsv(header + coffee)
    await started
    const clearing = ledger.device.clear()
    release()
    await expect(importing).rejects.toThrow("Данные устройства изменились")
    await clearing
    expect(ledger.days()).toEqual([])
    expect((await store.load()).records).toEqual([])
  })

  it("сравнивает категории без учёта регистра при повторном импорте", async () => {
    const { ledger } = await makeLedger()
    const csv = header + coffee.replace("Кафе", "кафе")
    expect(await ledger.importCsv(csv)).toMatchObject({ ok: true, added: 1 })
    expect(await ledger.importCsv(csv)).toMatchObject({ ok: true, added: 0, duplicates: 1 })
  })

  it("отклоняет сломанные кавычки и небезопасные суммы", async () => {
    const { ledger } = await makeLedger()
    for (const csv of [header + '"нет конца', header + coffee.replace("250,00", "9007199254740992,00"), header + coffee.replace("250,00", "-1,00")]) {
      expect(ledger.previewCsv(csv)).toMatchObject({ ok: false })
    }
  })
})
