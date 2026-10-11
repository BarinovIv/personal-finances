import "fake-indexeddb/auto"
import { describe, expect, it } from "vitest"
import { indexedDbStore } from "@fin/ledger"
import { add, categoryId, makeLedger } from "./support"

describe("ввод операции строкой", () => {
  it("стартовые наборы категорий расходов и доходов", async () => {
    const { ledger } = await makeLedger()
    expect(ledger.categories("expense").map((c) => c.name)).toEqual([
      "Продукты",
      "Кафе",
      "Транспорт",
      "Одежда",
      "Дом",
      "Здоровье",
      "Развлечения",
      "Подписки",
      "Подарки",
      "Прочее"
    ])
    expect(ledger.categories("income").map((c) => c.name)).toEqual(["Зарплата", "Подработка", "Прочие доходы"])
  })

  it("предпросмотр показывает, что распознано", async () => {
    const { ledger } = await makeLedger()
    expect(ledger.preview("вчера такси 450", { categoryId: categoryId(ledger, "Транспорт") })).toMatchObject({
      kind: "expense",
      amount: 45000,
      description: "такси",
      date: "2026-09-27",
      categoryId: categoryId(ledger, "Транспорт"),
      problems: []
    })
    expect(ledger.preview("+подработка 12000", { categoryId: categoryId(ledger, "Подработка") })).toMatchObject({
      kind: "income",
      amount: 1200000,
      date: "2026-09-28"
    })
  })

  it("сохраняет расход и доход, список по дням с итогом дня по расходам", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "кофе 250", { categoryId: categoryId(ledger, "Кафе") })
    await add(ledger, "+подработка 12000", { categoryId: categoryId(ledger, "Подработка") })
    await add(ledger, "молоко 99,90", { categoryId: categoryId(ledger, "Продукты") })
    await add(ledger, "вчера такси 450", { categoryId: categoryId(ledger, "Транспорт") })
    await add(ledger, "футболка 1500", { categoryId: categoryId(ledger, "Одежда"), date: "2026-09-26" })

    const days = ledger.days()
    expect(days.map((d) => [d.label, d.expenseTotal])).toEqual([
      ["Сегодня", 34990],
      ["Вчера", 45000],
      ["26 сентября", 150000]
    ])
    // внутри дня — сначала новые
    expect(days[0]!.items.map((o) => [o.kind, o.description, o.amount, o.category?.name])).toEqual([
      ["expense", "молоко", 9990, "Продукты"],
      ["income", "подработка", 1200000, "Подработка"],
      ["expense", "кофе", 25000, "Кафе"]
    ])
  })

  it("дата прошлого года подписывается с годом", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "ёлка 3000", { categoryId: categoryId(ledger, "Дом"), date: "2025-12-30" })
    expect(ledger.days()[0]!.label).toBe("30 декабря 2025")
  })

  it("без суммы, описания или категории операция не сохраняется, и понятно почему", async () => {
    const { ledger } = await makeLedger()
    expect(await ledger.submit("футболка", { categoryId: categoryId(ledger, "Одежда") })).toEqual({
      ok: false,
      problems: ["no-amount"]
    })
    expect(await ledger.submit("1500", { categoryId: categoryId(ledger, "Одежда") })).toEqual({
      ok: false,
      problems: ["no-description"]
    })
    expect(await ledger.submit("непонятное 1500")).toEqual({ ok: false, problems: ["no-category"] })
    expect(ledger.days()).toEqual([])
  })

  it("категория другого вида не подходит", async () => {
    const { ledger } = await makeLedger()
    expect(ledger.preview("+абвгд 5000", { categoryId: categoryId(ledger, "Кафе") }).problems).toEqual(["no-category"])
  })

  it("у операции есть время последней правки и признак удаления", async () => {
    const { ledger } = await makeLedger()
    const op = await add(ledger, "кофе 250", { categoryId: categoryId(ledger, "Кафе") })
    expect(ledger.pendingChanges()).toEqual([
      expect.objectContaining({
        collection: "operations",
        id: op.id,
        updatedAt: Date.parse("2026-09-28T12:00:00+03:00"),
        deleted: false
      })
    ])
  })

  it("данные переживают перезагрузку", async () => {
    const { ledger, reopen } = await makeLedger()
    await add(ledger, "кофе 250", { categoryId: categoryId(ledger, "Кафе") })
    const again = await reopen()
    expect(again.days()[0]!.items.map((o) => o.description)).toEqual(["кофе"])
  })

  it("данные переживают перезагрузку в IndexedDB", async () => {
    const name = `ledger-${Math.random()}`
    const { ledger } = await makeLedger({ store: indexedDbStore(name) })
    await add(ledger, "кофе 250", { categoryId: categoryId(ledger, "Кафе") })
    await add(ledger, "+подработка 12000", { categoryId: categoryId(ledger, "Подработка") })
    const { ledger: again } = await makeLedger({ store: indexedDbStore(name) })
    expect(again.days()[0]!.items.map((o) => o.description)).toEqual(["подработка", "кофе"])
    expect(again.pendingChanges()).toHaveLength(2)
  })
})

describe("несколько операций одной строкой", () => {
  it("предпросмотр и сохранение отделяют следующую сумму от короткого слагаемого", async () => {
    const { ledger } = await makeLedger()
    const line = "кафе 300 + 300 699 / 2 * 3 - 100 + 23 455"
    const choice = { categoryIds: [categoryId(ledger, "Кафе")] }
    const expected = [["кафе", 60000], ["кафе", 97150], ["кафе", 45500]]

    const previews = ledger.previewEntries(line, choice)
    expect(previews.map((p) => [p.description, p.amount])).toEqual(expected)
    expect(previews.every((p) => p.problems.length === 0)).toBe(true)

    const saved = await ledger.submitEntries(line, choice)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.operations.map((o) => [o.description, o.amount])).toEqual(expected)
    expect(ledger.days()[0]!.expenseTotal).toBe(202650)
  })

  it("каршеринг 150 + 150 400: предпросмотр и сохранение дают две операции, отмена убирает всю строку", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "кофе 123")
    const before = ledger.days()
    const line = "каршеринг 150 + 150 400"
    const choice = { categoryIds: [categoryId(ledger, "Транспорт")] }
    const expected = [
      ["expense", "каршеринг", 30000, "2026-09-28", categoryId(ledger, "Транспорт")],
      ["expense", "каршеринг", 40000, "2026-09-28", categoryId(ledger, "Транспорт")]
    ]

    const previews = ledger.previewEntries(line, choice)
    expect(previews.map((p) => [p.kind, p.description, p.amount, p.date, p.categoryId])).toEqual(expected)
    expect(previews.every((p) => p.problems.length === 0)).toBe(true)

    const saved = await ledger.submitEntries(line, choice)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.operations.map((o) => [o.kind, o.description, o.amount, o.date, o.category?.id])).toEqual(expected)
    expect(ledger.days()[0]!.expenseTotal).toBe(82300)

    expect(await saved.undo()).toEqual({ ok: true })
    expect(ledger.days()).toEqual(before)
    expect(saved.operations.map((o) => ledger.operation(o.id))).toEqual([undefined, undefined])
  })

  it("смешанная строка показывает и сохраняет три одинаково распознанных операции с итогом 1200 рублей", async () => {
    const { ledger } = await makeLedger()
    const line = "вчера 200 * 3 карш шашлык 500 200 / 2 шаурма"
    const choice = { categoryIds: [categoryId(ledger, "Транспорт")] }
    const expected = [
      ["expense", "карш", 60000, "2026-09-27", categoryId(ledger, "Транспорт")],
      ["expense", "шашлык", 50000, "2026-09-27", categoryId(ledger, "Кафе")],
      ["expense", "шаурма", 10000, "2026-09-27", categoryId(ledger, "Кафе")]
    ]
    const previews = ledger.previewEntries(line, choice)
    expect(previews.map((p) => [p.kind, p.description, p.amount, p.date, p.categoryId])).toEqual(expected)
    expect(previews.every((p) => p.problems.length === 0)).toBe(true)

    const result = await ledger.submitEntries(line, choice)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.operations.map((o) => [o.kind, o.description, o.amount, o.date, o.category?.id])).toEqual(expected)
    expect(ledger.days().map((day) => [day.date, day.expenseTotal, day.items.length])).toEqual([["2026-09-27", 120000, 3]])
  })

  it.each([
    ["200 / 0 кофе; такси 300; шаурма 100", 0],
    ["кофе 300; такси 0,01 / 3; шаурма 100", 1],
    ["кофе 300; такси 500; шаурма 200 * 0", 2],
    ["кофе 300; такси 200 / (2 - 2); шаурма 100", 1],
    ["кофе 300; такси 1000 - 1500; шаурма 100", 1],
    ["кофе 300; такси (200 + 100; шаурма 100", 1],
    ["кофе 300; такси (1 500); шаурма 100", 1],
    ["кофе 300; такси 99999999999999 * 100; шаурма 100", 1],
    ["кофе 300; такси 500; шаурма 200 +", 2],
    ["кофе 500 200 / 0 шаурма такси 300", 1],
    ["кофе 200/0 500 шашлык", 0]
  ] as const)("ошибка выражения не сохраняет часть строки и не меняет очередь: %s", async (line, index) => {
    const { ledger } = await makeLedger()
    await add(ledger, "кофе 123")
    const before = ledger.days()
    const pending = ledger.pendingChanges()

    expect(ledger.previewEntries(line)[index]?.problems).toEqual(["invalid-calculation"])
    expect(await ledger.submitEntries(line)).toEqual({ ok: false, index, problems: ["invalid-calculation"] })
    expect(ledger.days()).toEqual(before)
    expect(ledger.pendingChanges()).toEqual(pending)
  })

  it("недописанный доход после разделителя блокирует всю строку и сохраняет прежнюю очередь", async () => {
    const { ledger } = await makeLedger()
    await add(ledger, "кофе 123")
    const before = ledger.days()
    const pending = ledger.pendingChanges()
    const choice = { categoryIds: [null, categoryId(ledger, "Подработка")] }

    expect(await ledger.submitEntries("кофе 100; +", choice)).toEqual({
      ok: false, index: 1, problems: ["no-amount", "no-description"]
    })
    expect(ledger.days()).toEqual(before)
    expect(ledger.pendingChanges()).toEqual(pending)
  })

  it("для одинаковых расходов достаточно выбрать категорию один раз", async () => {
    const { ledger } = await makeLedger()
    const choice = { categoryIds: [categoryId(ledger, "Транспорт")] }

    expect(ledger.previewEntries("карш 100 100", choice)).toMatchObject([
      { description: "карш", amount: 10000, categoryId: categoryId(ledger, "Транспорт"), problems: [] },
      { description: "карш", amount: 10000, categoryId: categoryId(ledger, "Транспорт"), problems: [] }
    ])
    expect(await ledger.submitEntries("карш 100 100", choice)).toMatchObject({
      ok: true,
      operations: [
        { description: "карш", amount: 10000, category: { name: "Транспорт" } },
        { description: "карш", amount: 10000, category: { name: "Транспорт" } }
      ]
    })
  })

  it.each(["карш 100 200", "Карш 100; карш 200", "карш (50 + 50) 200"])(
    "выбор для второй операции подставляется и в первую: %s",
    async (line) => {
      const { ledger } = await makeLedger()
      expect(ledger.previewEntries(line, { categoryIds: [null, categoryId(ledger, "Транспорт")] })).toMatchObject([
        { amount: 10000, categoryId: categoryId(ledger, "Транспорт"), problems: [] },
        { amount: 20000, categoryId: categoryId(ledger, "Транспорт"), problems: [] }
      ])
      expect(ledger.preview("карш 100").categoryId).toBeNull()
      expect(await ledger.submitEntries(line, { categoryIds: [null, categoryId(ledger, "Транспорт")] })).toMatchObject({
        ok: true,
        operations: [
          { amount: 10000, category: { name: "Транспорт" } },
          { amount: 20000, category: { name: "Транспорт" } }
        ]
      })
    }
  )

  it("выбор не переносится на другое описание или вид операции", async () => {
    const { ledger } = await makeLedger()
    expect(
      ledger.previewEntries("карш 100 +карш 200 абвгд 300 карш 400", {
        categoryIds: [categoryId(ledger, "Транспорт")]
      })
    ).toMatchObject([
      { kind: "expense", description: "карш", categoryId: categoryId(ledger, "Транспорт"), problems: [] },
      { kind: "income", description: "карш", categoryId: null, problems: ["no-category"] },
      { kind: "expense", description: "абвгд", categoryId: null, problems: ["no-category"] },
      { kind: "expense", description: "карш", categoryId: categoryId(ledger, "Транспорт"), problems: [] }
    ])
  })

  it("у одинаковых операций можно оставить разные явно выбранные категории", async () => {
    const { ledger } = await makeLedger()
    expect(
      ledger.previewEntries("карш 100 200", {
        categoryIds: [categoryId(ledger, "Транспорт"), categoryId(ledger, "Подарки")]
      })
    ).toMatchObject([
      { categoryId: categoryId(ledger, "Транспорт"), problems: [] },
      { categoryId: categoryId(ledger, "Подарки"), problems: [] }
    ])
  })

  it.each(["咖啡 100; 出租车 200", "🎮 100; 🚕 200"])(
    "разные описания не объединяются, даже если в них нет русских или латинских букв: %s",
    async (line) => {
      const { ledger } = await makeLedger()
      expect(ledger.previewEntries(line, { categoryIds: [categoryId(ledger, "Транспорт")] })).toMatchObject([
        { categoryId: categoryId(ledger, "Транспорт"), problems: [] },
        { categoryId: null, problems: ["no-category"] }
      ])
    }
  )

  it("неподходящая категория не переносится на одинаковые расходы", async () => {
    const { ledger } = await makeLedger()
    expect(
      ledger.previewEntries("карш 100 100", { categoryIds: [categoryId(ledger, "Подработка")] })
    ).toMatchObject([
      { categoryId: null, problems: ["no-category"] },
      { categoryId: null, problems: ["no-category"] }
    ])
  })

  it("предпросмотр показывает каждую операцию со своей категорией", async () => {
    const { ledger } = await makeLedger()
    expect(
      ledger.previewEntries("шаурма 340 абвгд 400 +подработка 5000", { categoryIds: [null, categoryId(ledger, "Кафе")] })
    ).toMatchObject([
      { kind: "expense", description: "шаурма", amount: 34000, categorySource: "dictionary", problems: [] },
      { kind: "expense", description: "абвгд", amount: 40000, categoryId: categoryId(ledger, "Кафе"), problems: [] },
      { kind: "income", description: "подработка", amount: 500000, categoryId: categoryId(ledger, "Подработка") }
    ])
  })

  it("сохраняются все вместе, в ленте — в порядке строки, новые сверху", async () => {
    const { ledger } = await makeLedger()
    const result = await ledger.submitEntries("вчера шаурма 340 такси 500", { categoryIds: [] })
    expect(result).toMatchObject({ ok: true, operations: [{ description: "шаурма" }, { description: "такси" }] })
    expect(ledger.days().map((d) => [d.label, d.expenseTotal, d.items.map((o) => o.description)])).toEqual([
      ["Вчера", 84000, ["такси", "шаурма"]]
    ])
  })

  it("выбранная дата — для всех операций строки", async () => {
    const { ledger } = await makeLedger()
    await ledger.submitEntries("шаурма 340 вчера такси 500", { date: "2026-09-20" })
    expect(ledger.days().map((d) => [d.date, d.items.length])).toEqual([["2026-09-20", 2]])
  })

  it("явная дата действует на следующие операции до следующей даты, включая разделители", async () => {
    const { ledger } = await makeLedger()
    const line = "вчера кофе 100; такси 200 сегодня кино 300\nужин 400"
    const expected = [
      ["кофе", 10000, "2026-09-27"],
      ["такси", 20000, "2026-09-27"],
      ["кино", 30000, "2026-09-28"],
      ["ужин", 40000, "2026-09-28"]
    ]
    expect(ledger.previewEntries(line).map((p) => [p.description, p.amount, p.date])).toEqual(expected)

    const saved = await ledger.submitEntries(line)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.operations.map((o) => [o.description, o.amount, o.date])).toEqual(expected)
    expect(ledger.days().map((d) => [d.date, d.expenseTotal])).toEqual([
      ["2026-09-28", 70000],
      ["2026-09-27", 30000]
    ])
  })

  it("доход наследуется следующей суммой без описания, новое описание начинает расход", async () => {
    const { ledger } = await makeLedger()
    const line = "+подработка 150 + 150 400 кофе 200"
    const expected = [
      ["income", "подработка", 30000, categoryId(ledger, "Подработка")],
      ["income", "подработка", 40000, categoryId(ledger, "Подработка")],
      ["expense", "кофе", 20000, categoryId(ledger, "Кафе")]
    ]
    expect(ledger.previewEntries(line).map((p) => [p.kind, p.description, p.amount, p.categoryId])).toEqual(expected)

    const saved = await ledger.submitEntries(line)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.operations.map((o) => [o.kind, o.description, o.amount, o.category?.id])).toEqual(expected)
    expect(ledger.days()[0]!.expenseTotal).toBe(20000)
  })

  it("сохраняет результат выражений с приоритетом, скобками, тысячами без пробелов и округлением только в конце", async () => {
    const { ledger } = await makeLedger()
    const line = "кофе 100 + 50 * 2; (100 + 50) * 2; 1500 * 2; (150400) / 2; 200 * 1,5; 100 / 3 * 3; 100 - 200 + 300"
    const expected = [20000, 30000, 300000, 7520000, 30000, 10000, 20000]
    const previews = ledger.previewEntries(line)
    expect(previews.map((p) => p.amount)).toEqual(expected)
    expect(previews.every((p) => p.description === "кофе" && p.problems.length === 0)).toBe(true)

    const saved = await ledger.submitEntries(line)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.operations.map((o) => o.amount)).toEqual(expected)
    expect(saved.operations.every((o) => o.description === "кофе" && o.category?.name === "Кафе")).toBe(true)
    expect(ledger.days()[0]!.expenseTotal).toBe(7930000)
  })

  it("если хоть одна не готова, не сохраняется ни одна, и понятно какая", async () => {
    const { ledger } = await makeLedger()
    expect(await ledger.submitEntries("шаурма 340 абвгд 400 такси 500")).toEqual({
      ok: false,
      index: 1,
      problems: ["no-category"]
    })
    expect(await ledger.submitEntries("шаурма 340 такси")).toEqual({ ok: false, index: 1, problems: ["no-amount"] })
    expect(ledger.days()).toEqual([])
  })
})
