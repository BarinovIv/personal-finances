import type { CategoryView } from "@fin/ledger"
import { CategoryGlyph } from "../categoryIcons"

/** Цветной круг с иконкой категории — заменяет цветную точку везде, где показана категория. */
export const CategoryBadge = ({ category, size = 28 }: { category: Pick<CategoryView, "color" | "icon" | "name">; size?: number }) => (
  <span
    class="cat-badge"
    style={{ width: `${size}px`, height: `${size}px`, background: `var(--palette-${category.color})` }}
    aria-hidden="true"
  >
    <CategoryGlyph icon={category.icon} size={Math.round(size * 0.5)} />
  </span>
)
