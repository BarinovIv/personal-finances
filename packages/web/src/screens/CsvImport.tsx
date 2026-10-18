import type { CsvPreview } from "@fin/ledger"
import { CSV_IMPORT_PREVIEW_LIMIT } from "../constants"
import { amountText } from "../helpers"

export const CsvImportDetails = ({ preview, busy, onConfirm }: { preview: CsvPreview; busy: boolean; onConfirm: () => void }) => <>
  {preview.ok ? <>
    <p class="section-footer" role="status">Всего: {preview.total}. Уже есть: {preview.duplicates}. Новых: {preview.added}.</p>
    {preview.added > 0 && <>
      <div class="card-list">
        {preview.rows.slice(0, CSV_IMPORT_PREVIEW_LIMIT).map((row) => <div class="row" key={row.row}>
          <span class="row-main">
            <span class="row-title">{row.description || row.kind}</span>
            <span class="row-sub">{row.date} · {row.kind}{row.category ? ` · ${row.category}` : ""}</span>
          </span>
          <span class="num">{amountText(row.amount)} ₽</span>
        </div>)}
      </div>
      {preview.added > CSV_IMPORT_PREVIEW_LIMIT && <p class="section-footer">Показаны первые {CSV_IMPORT_PREVIEW_LIMIT} новых операций. Будут добавлены все {preview.added}.</p>}
      <p class="section-footer">Перед импортом скачается полная копия текущего состояния.</p>
      <button type="button" class="accent-button large" disabled={busy} onClick={onConfirm}>Добавить новые операции ({preview.added})</button>
    </>}
  </> : <div role="alert">
    <p class="section-footer">Файл не импортирован. Исправьте следующие строки и выберите его снова.</p>
    <ul>{preview.problems.slice(0, CSV_IMPORT_PREVIEW_LIMIT).map((problem, index) => <li key={index}>Строка {problem.row}: {problem.message}</li>)}</ul>
    {preview.problems.length > CSV_IMPORT_PREVIEW_LIMIT && <p class="section-footer">Всего ошибок: {preview.problems.length}. Показаны первые {CSV_IMPORT_PREVIEW_LIMIT}.</p>}
  </div>}
  <p class="section-footer">CSV добавляет операции, но не восстанавливает полную копию приложения. Существующие операции не изменятся. Выгрузку друга нужно импортировать под его входом.</p>
</>
