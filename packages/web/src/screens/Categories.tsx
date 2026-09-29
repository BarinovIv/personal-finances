import type { CategoryKind } from "@fin/domain"
import type { CategoryProblem, CategoryView, DeleteCategoryProblem, Ledger } from "@fin/ledger"
import { useState } from "preact/hooks"
import { CategoryBadge } from "../components/CategoryBadge"
import { CategoryStylePicker } from "../components/CategoryStylePicker"
import { Sheet } from "../components/Sheet"
import { plural } from "../format"
import { ForwardIcon, PlusIcon } from "../icons"
import { showToast } from "../toast"

const problemText: Record<CategoryProblem | DeleteCategoryProblem, string> = {
  "empty-name": "Введите название.",
  duplicate: "Такая категория уже есть.",
  "not-found": "Категория уже удалена.",
  "needs-target": "Выберите, куда перенести операции.",
  "bad-target": "Выберите другую категорию того же вида.",
  "last-category": "Последнюю категорию удалить нельзя."
}

const operations = (n: number) => `${n} ${plural(n, "операция", "операции", "операций")}`

const CategoryRow = ({ ledger, category }: { ledger: Ledger; category: CategoryView }) => {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [style, setStyle] = useState({ color: category.color, icon: category.icon })
  const [moveTo, setMoveTo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const usage = ledger.categoryUsage(category.id)
  const others = ledger.categories(category.kind).filter((c) => c.id !== category.id)

  const row = (
    <button type="button" class="row row-button" aria-label={`Изменить: ${category.name}`} onClick={() => setEditing(true)}>
      <CategoryBadge category={category} />
      <span class="row-main">
        <span class="row-title">{category.name}</span>
        {usage > 0 && <span class="row-sub">{operations(usage)}</span>}
      </span>
      <span class="row-chevron">
        <ForwardIcon size={16} />
      </span>
    </button>
  )
  if (!editing) return row

  const reset = () => {
    setEditing(false)
    setName(category.name)
    setStyle({ color: category.color, icon: category.icon })
    setMoveTo("")
    setError(null)
  }
  const save = async (close: () => void) => {
    const renamed = await ledger.renameCategory(category.id, name)
    if (!renamed.ok) return setError(problemText[renamed.problem])
    if (style.color !== category.color || style.icon !== category.icon) {
      await ledger.setCategoryStyle(category.id, style)
    }
    close()
  }
  const remove = async () => {
    const result = await ledger.deleteCategory(category.id, moveTo ? { moveTo } : {})
    if (!result.ok) return setError(problemText[result.problem])
    const target = others.find((c) => c.id === moveTo)
    showToast({ text: target ? `«${category.name}» удалена, операции — в «${target.name}»` : `«${category.name}» удалена` })
  }

  return (
    <>
      {row}
      <Sheet label={`Категория «${category.name}»`} onClose={reset}>
        {(close) => (
          <div class="sheet-form">
            <div class="sheet-title-row">
              <CategoryBadge category={{ ...style, name }} size={36} />
              <input
                class="text-input"
                type="text"
                aria-label="Название категории"
                value={name}
                onInput={(e) => {
                  setName(e.currentTarget.value)
                  setError(null)
                }}
              />
            </div>
            <CategoryStylePicker color={style.color} icon={style.icon} onChange={(patch) => setStyle({ ...style, ...patch })} />
            {usage > 0 && (
              <label class="field">
                <span>Чтобы удалить, перенесите операции ({usage}) в</span>
                <select class="text-input" value={moveTo} onChange={(e) => setMoveTo(e.currentTarget.value)}>
                  <option value="">— выберите —</option>
                  {others.map((c) => (
                    <option value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}
            {error && <span class="hint error">{error}</span>}
            <div class="actions-row">
              <button
                type="button"
                class="secondary-button danger-button grow"
                disabled={usage > 0 && !moveTo}
                onClick={() => void remove()}
              >
                Удалить
              </button>
              <button type="button" class="accent-button grow" onClick={() => void save(close)}>
                Сохранить
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  )
}

const NEW_CATEGORY_STYLE = { color: "gray", icon: "dots" }

const NewCategorySheet = ({ ledger, kind, onDone }: { ledger: Ledger; kind: CategoryKind; onDone: () => void }) => {
  const [name, setName] = useState("")
  const [style, setStyle] = useState(NEW_CATEGORY_STYLE)
  const [error, setError] = useState<string | null>(null)
  const add = async (close: () => void) => {
    const result = await ledger.addCategory(kind, name, style)
    if (!result.ok) return setError(problemText[result.problem])
    close()
  }
  return (
    <Sheet label="Новая категория" onClose={onDone}>
      {(close) => (
        <form
          class="sheet-form"
          onSubmit={(e) => {
            e.preventDefault()
            void add(close)
          }}
        >
          <div class="sheet-title">{kind === "expense" ? "Новая категория расходов" : "Новая категория доходов"}</div>
          <div class="sheet-title-row">
            <CategoryBadge category={{ ...style, name }} size={36} />
            <input
              class="text-input"
              type="text"
              placeholder="Название"
              aria-label="Название категории"
              value={name}
              onInput={(e) => {
                setName(e.currentTarget.value)
                setError(null)
              }}
            />
          </div>
          <CategoryStylePicker color={style.color} icon={style.icon} onChange={(patch) => setStyle({ ...style, ...patch })} />
          {error && <span class="hint error">{error}</span>}
          <div class="actions-row">
            <button type="button" class="secondary-button grow" onClick={close}>
              Отмена
            </button>
            <button type="submit" class="accent-button grow" disabled={!name.trim()}>
              Добавить
            </button>
          </div>
        </form>
      )}
    </Sheet>
  )
}

const KindList = ({ ledger, kind, title }: { ledger: Ledger; kind: CategoryKind; title: string }) => {
  const [adding, setAdding] = useState(false)
  return (
    <div class="section">
      <h2 class="section-header">{title}</h2>
      <div class="card-list">
        {ledger.categories(kind).map((c) => (
          <CategoryRow key={`${c.id}:${c.name}`} ledger={ledger} category={c} />
        ))}
        <button type="button" class="row row-button action-row" onClick={() => setAdding(true)}>
          <PlusIcon />
          <span>Новая категория</span>
        </button>
      </div>
      {adding && <NewCategorySheet ledger={ledger} kind={kind} onDone={() => setAdding(false)} />}
    </div>
  )
}

export const CategoriesSection = ({ ledger }: { ledger: Ledger }) => (
  <section class="section">
    <KindList ledger={ledger} kind="expense" title="Расходы" />
    <KindList ledger={ledger} kind="income" title="Доходы" />
  </section>
)
