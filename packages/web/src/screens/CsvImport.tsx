import type { CsvPreview, Ledger } from "@fin/ledger"
import type { Sync } from "@fin/sync"
import { useState } from "preact/hooks"
import { CSV_IMPORT_MAX_BYTES, CSV_IMPORT_PREVIEW_LIMIT } from "../constants"
import { amountText } from "../helpers"
import { DownloadIcon } from "../icons"
import type { DataTransferState } from "../types"

export const CsvImport = ({ ledger, sync, transfer }: { ledger: Ledger; sync: Sync; transfer: DataTransferState }) => {
  const [text, setText] = useState<string | null>(null)
  const [filename, setFilename] = useState("")
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const { busy, setBusy, working } = transfer

  return <section class="section">
    <h2>Импорт из CSV</h2>
    <p class="section-footer">Выберите свою выгрузку из приложения. Сначала проверим файл и покажем новые операции. Существующие операции не изменятся.</p>
    <div class="card-list">
      <label class="row row-button action-row">
        <DownloadIcon />
        <span>Выбрать CSV</span>
        <input class="visually-hidden" type="file" accept=".csv,text/csv" aria-label="Файл CSV" disabled={busy} onChange={async (event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (!file || working.current) return
          working.current = true
          setBusy(true)
          setPreview(null)
          setText(null)
          setNote(null)
          setFilename(file.name)
          try {
            if (file.size > CSV_IMPORT_MAX_BYTES) {
              setNote("Файл слишком большой. Максимум — 10 МБ.")
              return
            }
            const content = await file.text()
            if (await sync.syncNow() !== "ok") {
              setNote("Для проверки дублей нужна связь с сервером. Проверьте интернет и вход, затем выберите файл ещё раз.")
              return
            }
            setText(content)
            setPreview(ledger.previewCsv(content))
          } catch {
            setNote("Не получилось прочитать или проверить файл. Операции не импортированы.")
          } finally {
            working.current = false
            setBusy(false)
          }
        }} />
      </label>
    </div>
    {busy && <p class="section-footer" role="status">Проверяю данные…</p>}
    {preview && <>
      <p class="section-footer">{filename}</p>
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
          <button type="button" class="accent-button large" disabled={busy} onClick={async () => {
            if (working.current || text === null) return
            working.current = true
            setBusy(true)
            setNote(null)
            try {
              if (await sync.syncNow() !== "ok") {
                setNote("Не удалось свериться с сервером. Импорт не выполнен — попробуйте ещё раз при наличии связи.")
                return
              }
              const current = ledger.previewCsv(text)
              if (JSON.stringify(current) !== JSON.stringify(preview)) {
                setPreview(current)
                setNote("Данные изменились после проверки. Посмотрите обновлённый список перед импортом.")
                return
              }
              const result = await ledger.importCsv(text)
              if (!result.ok) {
                setPreview(result)
                return
              }
              setPreview(null)
              setText(null)
              const outcome = await sync.syncNow()
              setNote(`Добавлено: ${result.added}. Пропущено дублей: ${result.duplicates}. ${outcome === "ok" ? "Изменения синхронизированы." : "Операции сохранены на устройстве и ждут синхронизации. Не выходите из приложения."}`)
            } catch {
              setPreview(null)
              setText(null)
              setNote("Не получилось завершить импорт. Выберите файл снова для проверки: уже сохранённые операции будут учтены как дубли.")
            } finally {
              working.current = false
              setBusy(false)
            }
          }}>Добавить новые операции ({preview.added})</button>
        </>}
      </> : <div role="alert">
        <p class="section-footer">Файл не импортирован. Исправьте следующие строки и выберите его снова.</p>
        <ul>{preview.problems.slice(0, CSV_IMPORT_PREVIEW_LIMIT).map((problem, index) => <li key={index}>Строка {problem.row}: {problem.message}</li>)}</ul>
        {preview.problems.length > CSV_IMPORT_PREVIEW_LIMIT && <p class="section-footer">Всего ошибок: {preview.problems.length}. Показаны первые {CSV_IMPORT_PREVIEW_LIMIT}.</p>}
      </div>}
    </>}
    {note && <p class="section-footer" role="status">{note}</p>}
    <p class="section-footer">CSV не содержит удалений и всех связей между операциями. Импорт добавляет операции, но не восстанавливает полную копию приложения. Выгрузку друга нужно импортировать под его входом.</p>
  </section>
}
