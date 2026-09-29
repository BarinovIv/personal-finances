import type { CategoryKind } from "@fin/domain"
import type { CategoryProblem, CategoryView, DeleteCategoryProblem, Ledger } from "@fin/ledger"
import { useState } from "preact/hooks"
import { CategoryBadge } from "../components/CategoryBadge"
import { CategoryStylePicker } from "../components/CategoryStylePicker"
import { showToast } from "../toast"

const problemText: Record<CategoryProblem | DeleteCategoryProblem, string> = {
  "empty-name": "Введите название.",
  duplicate: "Такая категория уже есть.",
  "not-found": "Категория уже удалена.",
  "needs-target": "Выберите, куда перенести операции.",
  "bad-target": "Выберите другую категорию того же вида.",
  "last-category": "Последнюю категорию удалить нельзя."
}

const plural = (n: number) => {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return "операция"
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "операции"
  return "операций"
}

const CategoryRow = ({ ledger, category }: { ledger: Ledger; category: CategoryView }) => {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [style, setStyle] = useState({ color: category.color, icon: category.icon })
  const [moveTo, setMoveTo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const usage = ledger.categoryUsage(category.id)
  const others = ledger.categories(category.kind).filter((c) => c.id !== category.id)

  if (!editing) {
    return (
      <div class="row">
        <CategoryBadge category={category} />
        <div class="row-main">
          <span class="row-title">{category.name}</span>
          {usage > 0 && <span class="row-sub">{`${usage} ${plural(usage)}`}</span>}
        </div>
        <button type="button" class="text-button" onClick={() => setEditing(true)}>
          Изменить
        </button>
      </div>
    )
  }

  const save = async () => {
    const renamed = await ledger.renameCategory(category.id, name)
    if (!renamed.ok) return setError(problemText[renamed.problem])
    if (style.color !== category.color || style.icon !== category.icon) {
      await ledger.setCategoryStyle(category.id, style)
    }
    setEditing(false)
  }
  const remove = async () => {
    const result = await ledger.deleteCategory(category.id, moveTo ? { moveTo } : {})
    if (!result.ok) return setError(problemText[result.problem])
    const target = others.find((c) => c.id === moveTo)
    showToast({ text: target ? `«${category.name}» удалена, операции — в «${target.name}»` : `«${category.name}» удалена` })
  }

  return (
    <div class="row editing">
      <div class="row-main stack">
        <div class="inline-form">
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
          <button type="button" class="secondary-button" onClick={() => void save()}>
            Сохранить
          </button>
        </div>
        <CategoryStylePicker color={style.color} icon={style.icon} onChange={(patch) => setStyle({ ...style, ...patch })} />
        {usage > 0 && (
          <label class="field">
            <span>При удалении перенести {`${usage} ${plural(usage)}`} в</span>
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
          <button type="button" class="secondary-button grow" onClick={() => setEditing(false)}>
            Отмена
          </button>
          <button
            type="button"
            class="secondary-button danger-button grow"
            disabled={usage > 0 && !moveTo}
            onClick={() => void remove()}
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  )
}

const NEW_CATEGORY_STYLE = { color: "gray", icon: "dots" }

const KindList = ({ ledger, kind, title }: { ledger: Ledger; kind: CategoryKind; title: string }) => {
  const [name, setName] = useState("")
  const [style, setStyle] = useState(NEW_CATEGORY_STYLE)
  const [error, setError] = useState<string | null>(null)
  const add = async () => {
    const result = await ledger.addCategory(kind, name, style)
    if (!result.ok) return setError(problemText[result.problem])
    setName("")
    setStyle(NEW_CATEGORY_STYLE)
  }
  return (
    <div class="section">
      <h3 class="subhead">{title}</h3>
      <div class="card-list">
        {ledger.categories(kind).map((c) => (
          <CategoryRow key={`${c.id}:${c.name}`} ledger={ledger} category={c} />
        ))}
      </div>
      <form
        class="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <input
          class="text-input"
          type="text"
          placeholder="Новая категория"
          aria-label={`Новая категория: ${title.toLowerCase()}`}
          value={name}
          onInput={(e) => {
            setName(e.currentTarget.value)
            setError(null)
          }}
        />
        <button type="submit" class="secondary-button" disabled={!name.trim()}>
          Добавить
        </button>
      </form>
      {name.trim() && (
        <CategoryStylePicker color={style.color} icon={style.icon} onChange={(patch) => setStyle({ ...style, ...patch })} />
      )}
      {error && <span class="hint error">{error}</span>}
    </div>
  )
}

export const CategoriesSection = ({ ledger }: { ledger: Ledger }) => (
  <section class="section">
    <h2>Категории</h2>
    <KindList ledger={ledger} kind="expense" title="Расходы" />
    <KindList ledger={ledger} kind="income" title="Доходы" />
  </section>
)
