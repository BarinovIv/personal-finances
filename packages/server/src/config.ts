import { Config, Context, Effect, Layer, Option } from "effect"

export interface AppConfigShape {
  /** Папка со сборкой PWA. */
  readonly staticDir: string
  /** Пароль входа из переменной окружения. В базе хранится только его хэш. */
  readonly password: Option.Option<string>
  /** Неизменяемый логин владельца при первом запуске. */
  readonly login?: string
  /** Добавлять ли к cookie сессии флаг Secure. */
  readonly secureCookies: boolean
  /** Куда слать еженедельный бэкап всей базы. Нет — отправка выключена. */
  readonly telegram: Option.Option<TelegramTarget>
}

/** Telegram-бот и чат владельца для бэкапа всей базы. */
export interface TelegramTarget {
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
    const login = yield* Config.string("APP_LOGIN").pipe(Config.withDefault("owner"))
    const secureCookies = yield* Config.boolean("SECURE_COOKIES").pipe(Config.withDefault(true))
    const telegram = yield* Config.option(
      Config.all({
        telegramToken: Config.nonEmptyString("BACKUP_TELEGRAM_TOKEN"),
        telegramChatId: Config.nonEmptyString("BACKUP_TELEGRAM_CHAT_ID")
      })
    )
    return { staticDir, password, login, secureCookies, telegram }
  })
)
