import { CloseIcon } from "../icons"

export const DebtDueDateField = ({ id, value, onChange }: {
  id: string
  value: string
  onChange: (value: string) => void
}) => (
  <label class="row input-row">
    <span class="row-label">Дата возврата</span>
    <span class="date-pill">
      <input
        id={id}
        aria-label="Дата возврата"
        class="row-input"
        type="date"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      {value && (
        <button type="button" class="date-clear" aria-label="Очистить дату возврата" onClick={() => onChange("")}>
          <CloseIcon size={10} />
        </button>
      )}
    </span>
  </label>
)
