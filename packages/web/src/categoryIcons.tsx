import { SfSymbol } from "./icons"
import type { SymbolName } from "./symbols"

/**
 * Пиктограммы категорий — заливные символы, белые на цветном круге (см. `CategoryBadge`), как в iOS.
 * Ключи — сохранённые имена иконок (`CATEGORY_ICONS` в `@fin/ledger`), их не переименовываем.
 */
const GLYPHS: Record<string, SymbolName> = {
  cart: "cart_fill",
  cup: "cup_and_saucer_fill",
  car: "car_fill",
  shirt: "bag_fill",
  home: "house_fill",
  heart: "heart_fill",
  star: "star_fill",
  card: "creditcard_fill",
  gift: "gift_fill",
  dots: "ellipsis",
  banknote: "money_rubl",
  briefcase: "briefcase_fill",
  wallet: "wallet_fill",
  book: "book_fill",
  plane: "airplane",
  plus: "plus"
}

const DEFAULT_CATEGORY_ICON = "dots"

export const SymbolGlyph = ({ icon, size = 13 }: { icon: string; size?: number }) => (
  <SfSymbol name={GLYPHS[icon] ?? GLYPHS[DEFAULT_CATEGORY_ICON]!} size={size} />
)

/** Системные эмодзи: сохранённые идентификаторы остаются прежними. */
export const CATEGORY_EMOJI: Record<string, { emoji: string; label: string }> = {
  cart: { emoji: "🛒", label: "Продукты" },
  cup: { emoji: "☕", label: "Кафе" },
  car: { emoji: "🚗", label: "Транспорт" },
  shirt: { emoji: "👕", label: "Одежда" },
  home: { emoji: "🏠", label: "Дом" },
  heart: { emoji: "❤️", label: "Здоровье" },
  star: { emoji: "⭐", label: "Развлечения" },
  card: { emoji: "💳", label: "Карта" },
  gift: { emoji: "🎁", label: "Подарки" },
  dots: { emoji: "🔹", label: "Другое" },
  banknote: { emoji: "💵", label: "Деньги" },
  briefcase: { emoji: "💼", label: "Работа" },
  wallet: { emoji: "👛", label: "Кошелёк" },
  book: { emoji: "📚", label: "Книги" },
  plane: { emoji: "✈️", label: "Путешествия" },
  plus: { emoji: "➕", label: "Дополнительно" }
}

export const CategoryGlyph = ({ icon, size = 13 }: { icon: string; size?: number }) => (
  <span class="category-emoji" aria-hidden="true" style={{ fontSize: `${size}px` }}>
    {(CATEGORY_EMOJI[icon] ?? CATEGORY_EMOJI[DEFAULT_CATEGORY_ICON]!).emoji}
  </span>
)
