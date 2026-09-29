import { addDays, todayIn } from "@fin/domain"
import { Effect } from "effect"
import type { TelegramTarget } from "./config"

export interface TelegramFile {
  readonly name: string
  readonly bytes: Uint8Array<ArrayBuffer>
  readonly type: string
}

/** Вызов Telegram Bot API; ответ не 2xx — ошибка. */
const call = (target: TelegramTarget, method: string, body: FormData | string) =>
  Effect.tryPromise(async () => {
    const response = await fetch(`https://api.telegram.org/bot${target.telegramToken}/${method}`, {
      method: "POST",
      body,
      ...(typeof body === "string" ? { headers: { "content-type": "application/json" } } : {})
    })
    if (!response.ok) throw new Error(`Telegram ответил ${response.status}: ${await response.text()}`)
  })

/** Отправить файл в чат (`sendDocument`, до 50 МБ). */
export const sendDocument = (target: TelegramTarget, file: TelegramFile) => {
  const form = new FormData()
  form.append("chat_id", target.telegramChatId)
  form.append("document", new Blob([file.bytes], { type: file.type }), file.name)
  return call(target, "sendDocument", form)
}

/** Отправить текст в чат (`sendMessage`), без разметки. */
export const sendMessage = (target: TelegramTarget, text: string) =>
  call(target, "sendMessage", JSON.stringify({ chat_id: target.telegramChatId, text }))

/**
 * Сколько ждать до ближайшего `hour`:00 по Москве (UTC+3 без перехода на летнее время)
 * в один из дней, которые подходят под `day`.
 */
export const untilMoscowTime = (now: number, hour: number, day: (date: string) => boolean = () => true) => {
  const at = (date: string) => Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00+03:00`)
  let date = todayIn(now)
  while (at(date) <= now || !day(date)) date = addDays(date, 1)
  return at(date) - now
}
