import { CATEGORY_ICONS, PALETTE_COLORS, isCategoryEmoji } from "@fin/ledger"
import { useState } from "preact/hooks"
import { CATEGORY_EMOJI, CategoryGlyph } from "../categoryIcons"
import { CATEGORY_EMOJI_OPTIONS } from "./constants"

/** Выбор цвета и эмодзи при создании и правке категории (ADR-0004). */
export const CategoryStylePicker = ({
  color,
  icon,
  onChange
}: {
  color: string
  icon: string
  onChange: (style: { color?: string; icon?: string }) => void
}) => {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState("")
  const search = query.trim().toLocaleLowerCase("ru")
  const emojis = isCategoryEmoji(query.trim())
    ? [{ emoji: query.trim(), label: query.trim() }]
    : CATEGORY_EMOJI_OPTIONS.filter((option) => option.label.toLocaleLowerCase("ru").includes(search))

  return (
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
            class="icon-swatch icon-swatch-emoji"
            aria-pressed={i === icon}
            aria-label={CATEGORY_EMOJI[i]?.label ?? "Другое"}
            onClick={() => onChange({ icon: i })}
          >
            <CategoryGlyph icon={i} size={16} />
          </button>
        ))}
        {isCategoryEmoji(icon) && (
          <button
            type="button"
            class="icon-swatch icon-swatch-emoji"
            aria-pressed="true"
            aria-label={`Выбранный эмодзи: ${icon}`}
            onClick={() => onChange({ icon })}
          >
            <CategoryGlyph icon={icon} size={20} />
          </button>
        )}
      </div>
      <button type="button" class="secondary-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? "Скрыть эмодзи" : "Другие эмодзи"}
      </button>
      {expanded && (
        <>
          <input
            class="text-input"
            type="search"
            aria-label="Поиск эмодзи"
            placeholder="Поиск или нужный эмодзи"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              e.preventDefault()
              if (isCategoryEmoji(query.trim())) onChange({ icon: query.trim() })
            }}
          />
          <div class="icon-grid emoji-options" role="group" aria-label="Другие эмодзи">
            {emojis.map(({ emoji, label }) => (
              <button
                key={emoji}
                type="button"
                class="icon-swatch icon-swatch-emoji"
                aria-pressed={emoji === icon}
                aria-label={`Выбрать эмодзи: ${label}`}
                title={label}
                onClick={() => onChange({ icon: emoji })}
              >
                <CategoryGlyph icon={emoji} size={20} />
              </button>
            ))}
          </div>
          <span class="hint" role="status">
            {emojis.length ? "Можно вставить любой эмодзи с клавиатуры и выбрать его." : "Ничего не найдено. Попробуйте другое слово или вставьте один эмодзи."}
          </span>
        </>
      )}
    </div>
  )
}
