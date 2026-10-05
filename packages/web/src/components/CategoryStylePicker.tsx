import { CATEGORY_ICONS, PALETTE_COLORS } from "@fin/ledger"
import { CATEGORY_EMOJI, CategoryGlyph } from "../categoryIcons"

/** Выбор цвета и иконки при создании и правке категории (ADR-0004). */
export const CategoryStylePicker = ({
  color,
  icon,
  onChange
}: {
  color: string
  icon: string
  onChange: (style: { color?: string; icon?: string }) => void
}) => (
  <div class="style-picker">
    <div class="swatch-grid" role="group" aria-label="Цвет категории">
      {PALETTE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          class="swatch"
          aria-pressed={c === color}
          aria-label={c}
          style={{ background: `var(--palette-${c})` }}
          onClick={() => onChange({ color: c })}
        />
      ))}
    </div>
    <div class="icon-grid" role="group" aria-label="Иконка категории">
      {CATEGORY_ICONS.map((i) => (
        <button
          key={i}
          type="button"
          class="icon-swatch"
          aria-pressed={i === icon}
          aria-label={CATEGORY_EMOJI[i]?.label ?? "Другое"}
          style={i === icon ? { background: `var(--palette-${color})` } : undefined}
          onClick={() => onChange({ icon: i })}
        >
          <CategoryGlyph icon={i} size={16} />
        </button>
      ))}
    </div>
  </div>
)
