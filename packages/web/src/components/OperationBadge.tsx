import { isMovement, type MovementKind } from "@fin/domain"
import { OPERATION_KIND_TEXT, type OperationView } from "@fin/ledger"
import { CategoryBadge } from "./CategoryBadge"

/** Вид операции с заглавной буквы: «Одолжил», «Мне вернули». */
export const kindLabel = (kind: OperationView["kind"]) => {
  const text = OPERATION_KIND_TEXT[kind]
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const isGoalKind = (kind: MovementKind) => kind === "saved" || kind === "withdrawn"

/**
 * Заголовок операции: описание; у возврата — «Возврат: …».
 * У операций вне расходов и доходов: у долгов и погашений — человек, у целей — название цели.
 */
export const operationTitle = (op: OperationView): string => {
  if (op.kind === "refund") return `Возврат: ${op.description}`
  if (!isMovement(op.kind)) return op.description
  return (isGoalKind(op.kind) ? op.goalName : op.person) ?? kindLabel(op.kind)
}

/** Подпись под заголовком: категория, а у операций вне расходов и доходов — вид операции и описание. */
export const operationSubtitle = (op: OperationView): string => {
  if (op.category) return op.category.name + (op.recurringId ? " · регулярная" : "")
  if (!isMovement(op.kind)) return ""
  return kindLabel(op.kind) + (op.description ? ` · ${op.description}` : "")
}

/** Вид значка операции без категории: серый круг, у целей — звезда, у долгов — купюра. */
const movementLook = (kind: MovementKind) => ({
  name: kindLabel(kind),
  color: "gray",
  icon: isGoalKind(kind) ? "star" : "banknote"
})

/** Значок операции: цвет и иконка категории, а у операций вне расходов и доходов — свой нейтральный значок. */
export const OperationBadge = ({ op, size }: { op: Pick<OperationView, "kind" | "category">; size?: number }) => {
  if (op.category) return <CategoryBadge category={op.category} size={size} />
  return isMovement(op.kind) ? <CategoryBadge category={movementLook(op.kind)} size={size} /> : null
}
