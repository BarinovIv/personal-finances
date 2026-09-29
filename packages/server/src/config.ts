import { Config, Context, Effect, Layer, Option } from "effect"

export interface AppConfigShape {
  /** Папка со сборкой PWA. */
  readonly staticDir: string
  /** Пароль входа из переменной окружения. В базе хранится только его хэш. */
  readonly password: Option.Option<string>
  /** Добавлять ли к cookie сессии флаг Secure. */
  readonly secureCookies: boolean
  /** Куда слать ночной бэкап базы. Нет — бэкап выключен. */
  readonly backup: Option.Option<BackupTarget>
}

/** Telegram-бот, который присылает файл бэкапа в чат. */
export interface BackupTarget {
  readonly telegramToken: string
  readonly telegramChatId: string
}

export class AppConfig extends Context.Tag("@fin/server/AppConfig")<AppConfig, AppConfigShape>() {}

export const appConfigLayer = (config: AppConfigShape) => Layer.succeed(AppConfig, config)

export const appConfigFromEnv = Layer.effect(
  AppConfig,
  Effect.gen(function* () {
    const staticDir = yield* Config.string("STATIC_DIR").pipe(Config.withDefault("packages/web/dist"))
    const password = yield* Config.option(Config.nonEmptyString("APP_PASSWORD"))
    const secureCookies = yield* Config.boolean("SECURE_COOKIES").pipe(Config.withDefault(true))
    const backup = yield* Config.option(
      Config.all({
        telegramToken: Config.nonEmptyString("BACKUP_TELEGRAM_TOKEN"),
        telegramChatId: Config.nonEmptyString("BACKUP_TELEGRAM_CHAT_ID")
      })
    )
    return { staticDir, password, secureCookies, backup }
  })
)
