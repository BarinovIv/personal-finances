import type { CategoryView } from "@fin/ledger"
import { CategoryBadge } from "./CategoryBadge"

export const CategoryGrid = (props: {
  categories: ReadonlyArray<CategoryView>
  selected: string | null
  onPick: (id: string) => void
}) => (
  <div class="cat-grid">
    {props.categories.map((c) => (
      <button type="button" class="cat-option" aria-pressed={c.id === props.selected} onClick={() => props.onPick(c.id)}>
        <CategoryBadge category={c} size={24} />
        <span>{c.name}</span>
      </button>
    ))}
  </div>
)
