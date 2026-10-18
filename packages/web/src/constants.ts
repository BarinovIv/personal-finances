import type { UpdateProblem } from "@fin/ledger"
import type { Collection } from "@fin/domain"

export const RECURRING_VIEWS_CHANNEL = "finances-recurring-views"
export const CSV_IMPORT_MAX_BYTES = 10 * 1024 * 1024
export const CSV_IMPORT_PREVIEW_LIMIT = 100
export const BACKUP_IMPORT_MAX_BYTES = 50 * 1024 * 1024
export const BACKUP_COLLECTION_LABELS: ReadonlyArray<readonly [Collection, string]> = [
  ["operations", "Операции"],
  ["categories", "Категории"],
  ["recurring", "Регулярные шаблоны"],
  ["settings", "Настройки"],
  ["goals", "Цели"]
]

export const updateProblemText: Record<UpdateProblem, string> = {
  "not-found": "Операция уже удалена.",
  "not-recurring": "Эта операция не создана по регулярной операции.",
  "bad-amount": "Проверьте сумму.",
  "no-description": "Добавьте описание.",
  "bad-category": "Выберите категорию.",
  "below-refunds": "Сумма меньше уже оформленных возвратов.",
  "below-repayments": "Сумма меньше уже погашенного.",
  "no-person": "Укажите, кто."
}
