import type { CategoryView } from "@fin/ledger"

export const CategoryGrid = (props: {
  categories: ReadonlyArray<CategoryView>
  selected: string | null
  onPick: (id: string) => void
}) => (
  <div class="cat-grid">
    {props.categories.map((c) => (
      <button type="button" class="cat-option" aria-pressed={c.id === props.selected} onClick={() => props.onPick(c.id)}>
        <span class="dot" style={{ background: c.color }} />
        <span>{c.name}</span>
      </button>
    ))}
  </div>
)
