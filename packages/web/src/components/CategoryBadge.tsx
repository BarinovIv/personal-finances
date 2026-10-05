import type { CategoryView } from "@fin/ledger"
import { CategoryGlyph, SymbolGlyph } from "../categoryIcons"

/** Цветной круг с иконкой категории — заменяет цветную точку везде, где показана категория. */
export const CategoryBadge = ({ category, size = 30, symbol = false }: { category: Pick<CategoryView, "color" | "icon" | "name">; size?: number; symbol?: boolean }) => (
  <span
    class="cat-badge"
    style={{ width: `${size}px`, height: `${size}px`, background: `var(--palette-${category.color})` }}
    aria-hidden="true"
  >
    {symbol ? <SymbolGlyph icon={category.icon} size={Math.round(size * 0.58)} /> : <CategoryGlyph icon={category.icon} size={Math.round(size * 0.66)} />}
  </span>
)
