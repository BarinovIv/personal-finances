import { isCategoryEmoji, type CategoryView } from "@fin/ledger"
import { CategoryBadge } from "./CategoryBadge"

/** Нажатие на саму иконку открывает системную клавиатуру без отдельного видимого поля. */
export const CategoryIconInput = ({
  category,
  onChange
}: {
  category: Pick<CategoryView, "color" | "icon" | "name">
  onChange: (icon: string) => void
}) => (
  <label class="category-icon-input" title="Выбрать эмодзи">
    <CategoryBadge category={category} size={36} />
    <input
      type="text"
      inputMode="text"
      aria-label="Выбрать эмодзи категории"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellcheck={false}
      onInput={(e) => {
        if (e instanceof InputEvent && e.isComposing) return
        const emoji = e.currentTarget.value.trim()
        if (isCategoryEmoji(emoji)) onChange(emoji)
        e.currentTarget.value = ""
      }}
      onCompositionEnd={(e) => {
        const emoji = e.currentTarget.value.trim()
        if (isCategoryEmoji(emoji)) onChange(emoji)
        e.currentTarget.value = ""
      }}
      onBlur={(e) => { e.currentTarget.value = "" }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return
        e.preventDefault()
        e.currentTarget.blur()
      }}
    />
  </label>
)
