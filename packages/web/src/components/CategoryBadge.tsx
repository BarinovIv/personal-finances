import type { CategoryView } from "@fin/ledger"
import { CategoryGlyph, SymbolGlyph } from "../categoryIcons"

/** Категории показываем системными эмодзи, служебные символы — на цветном круге. */
export const CategoryBadge = ({ category, size = 30, symbol = false }: { category: Pick<CategoryView, "color" | "icon" | "name">; size?: number; symbol?: boolean }) => (
  <span
    class={symbol ? "cat-badge" : "cat-badge cat-badge-emoji"}
    style={{ width: `${size}px`, height: `${size}px`, background: symbol ? `var(--palette-${category.color})` : undefined }}
    aria-hidden="true"
  >
    {symbol ? <SymbolGlyph icon={category.icon} size={Math.round(size * 0.58)} /> : <CategoryGlyph icon={category.icon} size={Math.round(size * 0.66)} />}
  </span>
)
