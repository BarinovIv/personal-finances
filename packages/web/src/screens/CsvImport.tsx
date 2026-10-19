import type { CsvPreview } from "@fin/ledger"
import { CSV_IMPORT_PREVIEW_LIMIT } from "../constants"
import { amountText } from "../helpers"

export const CsvImportDetails = ({ preview, busy, ignoredRows, onConfirm, onIgnore }: { preview: CsvPreview; busy: boolean; ignoredRows: ReadonlyArray<number>; onConfirm: () => void; onIgnore: () => void }) => <>
  {preview.ok ? <>
    <p class="section-footer" role="status">Всего: {preview.total}. Уже есть: {preview.duplicates}. Новых: {preview.added}. Будет проигнорировано: {preview.ignored.length}.</p>
    {preview.ignored.length > 0 && <>
      <p class="section-footer">Эти операции не будут добавлены. Исходный файл останется без изменений.</p>
      <ul class="import-problem-list">{preview.ignored.slice(0, CSV_IMPORT_PREVIEW_LIMIT).map((problem) => <li key={problem.row}>Строка {problem.row}: {problem.message}</li>)}</ul>
      {preview.ignored.length > CSV_IMPORT_PREVIEW_LIMIT && <p class="section-footer">Показаны первые {CSV_IMPORT_PREVIEW_LIMIT} проигнорированных строк.</p>}
    </>}
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
  </> : <div class="import-problems" role="alert">
    <p class="section-footer">{preview.problems.some((problem) => problem.ignorable)
      ? "Файл не импортирован. Неподдерживаемые операции можно игнорировать; остальные ошибки нужно исправить в файле."
      : "Файл не импортирован. Исправьте следующие строки и выберите файл снова."}</p>
    <ul class="import-problem-list">{preview.problems.slice(0, CSV_IMPORT_PREVIEW_LIMIT).map((problem, index) => <li key={index}>Строка {problem.row}: {problem.message}</li>)}</ul>
    {preview.problems.length > CSV_IMPORT_PREVIEW_LIMIT && <p class="section-footer">Всего ошибок: {preview.problems.length}. Показаны первые {CSV_IMPORT_PREVIEW_LIMIT}.</p>}
    {ignoredRows.length > 0 && <p class="section-footer">Выбрано для игнорирования строк: {ignoredRows.length}. Остальные ошибки всё ещё мешают импорту.</p>}
    {preview.problems.some((problem) => problem.ignorable) && <>
      <p class="section-footer">Пропустим только операции, для которых в CSV не хватает связей. Перед добавлением покажем оставшиеся операции.</p>
      <button type="button" class="secondary-button import-ignore" disabled={busy} onClick={onIgnore}>Игнорировать эти строки</button>
    </>}
  </div>}
  <p class="section-footer">CSV добавляет операции, но не восстанавливает полную копию приложения. Существующие операции не изменятся. Выгрузку друга нужно импортировать под его входом.</p>
</>
