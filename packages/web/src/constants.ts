import type { UpdateProblem } from "@fin/ledger"

export const RECURRING_VIEWS_CHANNEL = "finances-recurring-views"

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
