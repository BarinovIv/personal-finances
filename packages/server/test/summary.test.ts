import { afterEach, describe, expect, it, vi } from "@effect/vitest"
import { Effect, Logger, LogLevel, Option, TestClock } from "effect"
import { testServer, type TestClient } from "./support"

const MSK = (iso: string) => Date.parse(`${iso}+03:00`)

const telegram = Option.some({ telegramToken: "123:секрет", telegramChatId: "42" })

let seq = 0
const operation = (
  kind: "expense" | "income" | "refund",
  amount: number,
  categoryId: string,
  date: string,
  fields: Partial<{ id: string; refundOf: string; deleted: boolean }> = {}
) => ({
  collection: "operations",
  id: fields.id ?? `op${++seq}`,
  updatedAt: 1,
  deleted: fields.deleted ?? false,
  data: {
    kind,
    amount: amount * 100,
    description: categoryId,
    categoryId,
    date,
    createdAt: 1,
    categorizedAt: 1,
    refundOf: fields.refundOf ?? null,
    recurringId: null
  }
})

/**
 * Подменяет fetch: запоминает сообщения в Telegram и отвечает по очереди статусами из `statuses` (дальше — 200).
 * Неразрывные пробелы в суммах запоминаются обычными — так ожидаемый текст читается в тесте.
 */
const telegramStub = (statuses: Array<number> = []) => {
  const messages: Array<{ url: string; chatId: string; text: string }> = []
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (url.endsWith("/sendMessage")) {
      const body = JSON.parse(init.body as string)
      messages.push({ url, chatId: body.chat_id, text: body.text.replace(/[  ]/g, " ") })
      return new Response("{}", { status: statuses.shift() ?? 200 })
    }
    return new Response("{}")
  })
  return messages
}

/** Дать фоновому файберу дойти до отправки. */
const settle = Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 20)))

const upload = (server: TestClient, changes: Array<unknown>) =>
  Effect.gen(function* () {
    yield* server.post("/api/login", { password: "верный-пароль" })
    yield* server.post("/api/sync", { cursor: 0, changes })
  })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("еженедельная сводка", () => {
  it.scoped("в понедельник в 09:00 по Москве присылает итоги прошлой недели и зарплатного периода", () =>
    Effect.gen(function* () {
      const messages = telegramStub()
      // воскресенье; зарплатный период по умолчанию — 20 сентября – 4 октября
      yield* TestClock.setTime(MSK("2026-09-27T12:00:00"))
      const server = yield* testServer({ telegram })
      const clothes = operation("expense", 2000, "clothes", "2026-09-25", { id: "shirt" })
      yield* upload(server, [
        operation("income", 150000, "salary", "2026-09-20"),
        // позапрошлая неделя, 14–20 сентября
        operation("expense", 4000, "food", "2026-09-20"),
        // прошлая неделя, 21–27 сентября
        operation("expense", 3000, "food", "2026-09-22"),
        operation("expense", 1600, "cafe", "2026-09-23"),
        operation("expense", 500, "transport", "2026-09-24"),
        clothes,
        operation("refund", 500, "clothes", "2026-09-26", { refundOf: "shirt" }),
        operation("expense", 100, "home", "2026-09-27"),
        operation("expense", 50, "health", "2026-09-27"),
        operation("expense", 9999, "fun", "2026-09-24", { deleted: true }),
        // лимит кафе 2 000 ₽ в месяц → 1 000 ₽ на 15 дней периода
        { collection: "categories", id: "cafe", updatedAt: 1, deleted: false, data: { kind: "expense", name: "Кофейни", color: "orange", icon: "cup", limit: 200000 } },
        // Интернет 1 октября ещё предстоит
        {
          collection: "recurring",
          id: "net",
          updatedAt: 1,
          deleted: false,
          data: { kind: "expense", description: "Интернет", amount: 65000, categoryId: "subscriptions", dayOfMonth: 1, startDate: "2026-09-01", status: "active" }
        }
      ])

      yield* TestClock.adjust("20 hours") // понедельник, 08:00
      yield* settle
      expect(messages).toHaveLength(0)

      yield* TestClock.adjust("1 hour")
      yield* settle
      expect(messages).toHaveLength(1)
      expect(messages[0]!.url).toBe("https://api.telegram.org/bot123:секрет/sendMessage")
      expect(messages[0]!.chatId).toBe("42")
      // расходы периода: 4 000 + 6 750 + Интернет 650 за 1 сентября не в периоде;
      // свободно 150 000 − 10 750 − 650 предстоящих = 138 600 ₽ на 7 дней
      expect(messages[0]!.text).toBe(
        [
          "Неделя 21–27 сентября",
          "",
          "Расходы: 6 750 ₽",
          "↑ на 69% больше, чем неделей раньше",
          "",
          "Продукты — 3 000 ₽",
          "Кофейни — 1 600 ₽",
          "Одежда — 1 500 ₽",
          "Транспорт — 500 ₽",
          "Дом — 100 ₽",
          "",
          "Зарплатный период 20 сентября – 4 октября",
          "Потрачено: 10 750 ₽",
          "Можно тратить в день: 19 800 ₽",
          "",
          "Сверх лимита:",
          "Кофейни — 1 600 ₽ из 1 000 ₽"
        ].join("\n")
      )

      yield* TestClock.adjust("6 days")
      yield* settle
      expect(messages).toHaveLength(1)
      yield* TestClock.adjust("1 day")
      yield* settle
      expect(messages).toHaveLength(2)
    }))

  it.scoped("неделя без расходов → коротко «расходов нет» и состояние периода", () =>
    Effect.gen(function* () {
      const messages = telegramStub()
      yield* TestClock.setTime(MSK("2026-09-27T12:00:00"))
      const server = yield* testServer({ telegram })
      yield* upload(server, [
        operation("expense", 1000, "food", "2026-09-20"),
        operation("expense", 700, "cafe", "2026-09-23", { deleted: true })
      ])

      yield* TestClock.adjust("21 hours")
      yield* settle
      expect(messages.map((m) => m.text)).toEqual([
        [
          "Неделя 21–27 сентября",
          "",
          "За неделю расходов нет",
          "",
          "Зарплатный период 20 сентября – 4 октября",
          "Потрачено: 1 000 ₽",
          "Перерасход за период: 1 000 ₽"
        ].join("\n")
      ])
    }))

  it.scoped("пропущенную сводку не догоняет: сервер запущен в понедельник после 09:00 — следующая через неделю", () =>
    Effect.gen(function* () {
      const messages = telegramStub()
      yield* TestClock.setTime(MSK("2026-09-28T10:00:00"))
      yield* testServer({ telegram })
      yield* TestClock.adjust("6 days")
      yield* settle
      expect(messages).toHaveLength(0)

      yield* TestClock.adjust("23 hours")
      yield* settle
      expect(messages).toHaveLength(1)
      expect(messages[0]!.text.split("\n")[0]).toBe("Неделя 28 сентября – 4 октября")
    }))

  it.scoped("если Telegram не принял сводку, сервер работает, а через неделю она приходит снова", () =>
    Effect.gen(function* () {
      const messages = telegramStub([500])
      yield* TestClock.setTime(MSK("2026-09-27T12:00:00"))
      const server = yield* testServer({ telegram })

      yield* TestClock.adjust("21 hours")
      yield* settle
      expect(messages).toHaveLength(1)
      expect((yield* server.get("/api/health")).status).toBe(200)

      yield* TestClock.adjust("7 days")
      yield* settle
      expect(messages).toHaveLength(2)
    }))

  it.scoped("без токена и чата сводка выключена, в логе предупреждение", () =>
    Effect.gen(function* () {
      const messages = telegramStub()
      const warnings: Array<string> = []
      const logger = Logger.make(({ logLevel, message }) => {
        if (logLevel === LogLevel.Warning) warnings.push(String(message))
      })
      yield* TestClock.setTime(MSK("2026-09-27T12:00:00"))
      yield* testServer().pipe(Effect.provide(Logger.replace(Logger.defaultLogger, logger)))
      yield* TestClock.adjust("8 days")
      yield* settle
      expect(messages).toHaveLength(0)
      expect(warnings).toContain("BACKUP_TELEGRAM_TOKEN и BACKUP_TELEGRAM_CHAT_ID не заданы — еженедельная сводка выключена")
    }))
})
