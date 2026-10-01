/**
 * Заполняет локальную базу правдоподобными тестовыми данными: три месяца операций, регулярные, цели, долги,
 * лимиты и дни зарплаты. Только для разработки — на прод не запускать.
 *
 * Записи пишутся напрямую в SQLite, как их сохранил бы сервер (новый seq у каждой), поэтому клиенты
 * получат их при следующей синхронизации. Все id начинаются с `seed-`: повторный запуск помечает
 * прежние тестовые записи удалёнными и пишет новые, а свои записи не трогает.
 *
 *   npm run seed                      # data/finances.sqlite
 *   DB_PATH=другой.sqlite npm run seed
 */
import {
  addDays,
  occurrencesBetween,
  recurringOperationId,
  SETTINGS_ID,
  todayIn,
  type CategoryData,
  type Collection,
  type GoalData,
  type IsoDate,
  type OperationData,
  type RecurringData,
  type SettingsData
} from "@fin/domain"
import { existsSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"

const DB_PATH = process.env["DB_PATH"] ?? "data/finances.sqlite"
const FROM: IsoDate = "2026-07-01"

if (!existsSync(DB_PATH)) {
  console.error(`Нет базы ${DB_PATH}: сначала запусти сервер один раз, он её создаст.`)
  process.exit(1)
}

const now = Date.now()
const today = todayIn(now)

/** Детерминированный генератор: при одной и той же дате запуска данные одинаковые. */
let state = 20260701
const random = () => {
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const chance = (p: number) => random() < p
const pick = <T>(items: ReadonlyArray<T>): T => items[Math.floor(random() * items.length)]!
/** Сумма в копейках: рубли в [min, max], шагом `step` рублей. */
const rub = (min: number, max: number, step = 10) =>
  (Math.round((min + random() * (max - min)) / step) * step || step) * 100

const records: Array<{ collection: Collection; id: string; data: unknown }> = []
const put = (collection: Collection, id: string, data: unknown) => records.push({ collection, id, data })

let opCount = 0
const op = (date: IsoDate, data: Partial<OperationData> & Pick<OperationData, "kind" | "amount">): string => {
  const id = `seed-op-${++opCount}`
  const createdAt = Date.parse(`${date}T12:00:00+03:00`) + opCount
  const full: OperationData = {
    description: "",
    categoryId: "",
    refundOf: null,
    recurringId: null,
    ...data,
    date,
    createdAt,
    categorizedAt: createdAt
  }
  put("operations", id, full)
  return id
}
const expense = (date: IsoDate, categoryId: string, description: string, amount: number) =>
  op(date, { kind: "expense", categoryId, description, amount })

// Категории: лимиты у стартовых и одна своя.
const STARTER_OVERRIDES: Record<string, CategoryData> = {
  cafe: { kind: "expense", name: "Кафе", color: "orange", icon: "cup", limit: 1_000_000 },
  fun: { kind: "expense", name: "Развлечения", color: "yellow", icon: "star", limit: 500_000 },
  food: { kind: "expense", name: "Продукты", color: "green", icon: "cart", limit: 3_000_000 }
}
for (const [id, data] of Object.entries(STARTER_OVERRIDES)) put("categories", id, data)
put("categories", "seed-cat-books", { kind: "expense", name: "Книги и курсы", color: "teal", icon: "book" } satisfies CategoryData)

// Регулярные: операции по ним создаём сами, тем же id, что и сервер, — перезапуск не нужен.
const recurring: Array<[string, RecurringData]> = [
  ["seed-rec-salary", { kind: "income", description: "зарплата", amount: 9_000_000, categoryId: "salary", dayOfMonth: 5, startDate: FROM, status: "active", position: 0 }],
  ["seed-rec-advance", { kind: "income", description: "аванс", amount: 6_000_000, categoryId: "salary", dayOfMonth: 20, startDate: FROM, status: "active", position: 1 }],
  ["seed-rec-rent", { kind: "expense", description: "аренда", amount: 4_500_000, categoryId: "home", dayOfMonth: 1, startDate: FROM, status: "active", position: 2 }],
  ["seed-rec-phone", { kind: "expense", description: "связь", amount: 65_000, categoryId: "subscriptions", dayOfMonth: 12, startDate: FROM, status: "active", position: 3 }],
  ["seed-rec-plus", { kind: "expense", description: "Яндекс Плюс", amount: 39_900, categoryId: "subscriptions", dayOfMonth: 25, startDate: FROM, status: "active", position: 4 }],
  ["seed-rec-gym", { kind: "expense", description: "спортзал", amount: 350_000, categoryId: "fun", dayOfMonth: 3, startDate: FROM, status: "paused", position: 5 }]
]
for (const [id, t] of recurring) {
  put("recurring", id, t)
  if (t.status !== "active") continue
  for (const occurrence of occurrencesBetween(t, t.startDate, today)) {
    const createdAt = Date.parse(`${occurrence.date}T09:00:00+03:00`)
    put("operations", recurringOperationId(id, occurrence.month), {
      kind: t.kind,
      amount: t.amount,
      description: t.description,
      categoryId: t.categoryId,
      date: occurrence.date,
      createdAt,
      categorizedAt: createdAt,
      refundOf: null,
      recurringId: id
    } satisfies OperationData)
  }
}

// Повседневные расходы.
for (let date = FROM; date <= today; date = addDays(date, 1)) {
  if (chance(0.6)) expense(date, "food", pick(["пятёрочка", "перекрёсток", "вкусвилл", "лента", "продукты"]), rub(250, 2500))
  if (chance(0.35)) expense(date, "cafe", pick(["кофе", "обед", "шава", "бизнес-ланч", "пицца"]), rub(200, 1400))
  if (chance(0.5)) {
    if (chance(0.7)) expense(date, "transport", "метро", 6_400)
    else expense(date, "transport", "такси", rub(300, 900))
  }
  if (chance(0.07)) expense(date, "home", pick(["хозтовары", "IKEA", "лампочки", "стиральный порошок"]), rub(300, 3500))
  if (chance(0.05)) expense(date, "health", pick(["аптека", "витамины", "стоматолог"]), rub(300, 4000))
  if (chance(0.08)) expense(date, "fun", pick(["кино", "концерт", "боулинг", "игра в Steam"]), rub(400, 2500))
  if (chance(0.03)) expense(date, "clothes", pick(["футболка", "джинсы", "носки", "куртка"]), rub(500, 6000, 100) - 100)
  if (chance(0.02)) expense(date, "gifts", pick(["подарок маме", "цветы", "подарок на ДР"]), rub(1000, 5000, 100))
  if (chance(0.03)) expense(date, "other", pick(["стрижка", "ремонт обуви", "почта"]), rub(200, 1500))
  if (chance(0.03)) expense(date, "seed-cat-books", pick(["книга", "курс на Stepik"]), rub(500, 3000, 100))
}

// Подработка и возврат.
op("2026-08-15", { kind: "income", categoryId: "side", description: "фриланс", amount: 2_500_000 })
const sneakers = expense("2026-08-10", "clothes", "кроссовки", 799_000)
op("2026-08-14", { kind: "refund", categoryId: "clothes", description: "кроссовки", amount: 799_000, refundOf: sneakers })

// Цели и накопления.
const goals: Array<[string, GoalData]> = [
  ["seed-goal-vacation", { name: "Отпуск", icon: "plane", target: 15_000_000, deadline: "2027-05-01", archived: false, createdAt: Date.parse("2026-07-01T10:00:00+03:00") }],
  ["seed-goal-cushion", { name: "Подушка", icon: "wallet", target: 30_000_000, deadline: null, archived: false, createdAt: Date.parse("2026-07-01T10:01:00+03:00") }],
  ["seed-goal-laptop", { name: "Ноутбук", icon: "briefcase", target: 12_000_000, deadline: null, archived: true, createdAt: Date.parse("2026-07-01T10:02:00+03:00") }]
]
for (const [id, g] of goals) put("goals", id, g)
for (const [date, goalId, amount] of [
  ["2026-07-06", "seed-goal-cushion", 1_500_000],
  ["2026-07-06", "seed-goal-laptop", 5_000_000],
  ["2026-07-21", "seed-goal-vacation", 1_000_000],
  ["2026-08-06", "seed-goal-cushion", 1_500_000],
  ["2026-08-21", "seed-goal-vacation", 1_000_000],
  ["2026-09-06", "seed-goal-cushion", 1_500_000],
  ["2026-09-21", "seed-goal-vacation", 1_000_000]
] as const) {
  if (date <= today) op(date, { kind: "saved", goalId, amount })
}
op("2026-08-28", { kind: "withdrawn", goalId: "seed-goal-cushion", description: "ремонт машины", amount: 2_000_000 })
op("2026-09-02", { kind: "withdrawn", goalId: "seed-goal-laptop", amount: 5_000_000 })

// Долги.
const sasha = op("2026-08-03", { kind: "lent", person: "Саша", amount: 500_000 })
op("2026-08-20", { kind: "repaid-to-me", repaymentOf: sasha, amount: 200_000 })
op("2026-09-22", { kind: "lent", person: "Лёша", description: "за билеты", amount: 150_000 })
const mom = op("2026-07-25", { kind: "borrowed", person: "Мама", amount: 1_000_000 })
op("2026-08-05", { kind: "repaid-by-me", repaymentOf: mom, amount: 1_000_000 })

// Запись.
const db = new DatabaseSync(DB_PATH)
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'records'").get()) {
  console.error(`В ${DB_PATH} нет таблицы records: сначала запусти сервер один раз.`)
  process.exit(1)
}
const hasSettings = db.prepare("SELECT 1 FROM records WHERE user_id = 'owner' AND collection = 'settings' AND id = ?").get(SETTINGS_ID)
if (!hasSettings) put("settings", SETTINGS_ID, { paydays: [5, 20] } satisfies SettingsData)

const upsert = db.prepare(
  `INSERT INTO records (user_id, collection, id, updated_at, deleted, data, seq) VALUES ('owner', ?, ?, ?, ?, ?, ?)
   ON CONFLICT (user_id, collection, id) DO UPDATE SET
     updated_at = excluded.updated_at, deleted = excluded.deleted, data = excluded.data, seq = excluded.seq`
)
const fresh = new Set(records.map((r) => `${r.collection}:${r.id}`))
const stale = db
  .prepare("SELECT collection, id, data FROM records WHERE user_id = 'owner' AND deleted = 0 AND (id LIKE 'seed-%' OR id LIKE 'rec:seed-%')")
  .all() as Array<{ collection: Collection; id: string; data: string }>

db.exec("BEGIN")
let seq = (db.prepare("SELECT MAX(seq) AS seq FROM records WHERE user_id = 'owner'").get() as { seq: number | null }).seq ?? 0
let removed = 0
for (const row of stale) {
  if (fresh.has(`${row.collection}:${row.id}`)) continue
  upsert.run(row.collection, row.id, now, 1, row.data, ++seq)
  removed++
}
for (const r of records) upsert.run(r.collection, r.id, now, 0, JSON.stringify(r.data), ++seq)
db.exec("COMMIT")
db.close()

const count = (c: Collection) => records.filter((r) => r.collection === c).length
console.log(
  `${DB_PATH}: операций ${count("operations")}, регулярных ${count("recurring")}, целей ${count("goals")}, ` +
    `категорий ${count("categories")}${hasSettings ? "" : ", дни зарплаты 5 и 20"}` +
    (removed ? `; прежних тестовых записей помечено удалёнными: ${removed}` : "")
)
