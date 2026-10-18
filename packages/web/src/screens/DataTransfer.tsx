import type { Ledger } from "@fin/ledger"
import type { Sync } from "@fin/sync"
import { useEffect, useRef, useState } from "preact/hooks"
import { Sheet } from "../components/Sheet"
import { BACKUP_IMPORT_MAX_BYTES, CSV_IMPORT_MAX_BYTES } from "../constants"
import { downloadText } from "../helpers"
import { DownloadIcon, ForwardIcon } from "../icons"
import { setNavigationGuard } from "../state"
import { BackupDetails } from "./Backup"
import { CsvImportDetails } from "./CsvImport"
import { importFormat } from "./helpers"
import type { ImportSelection } from "./types"

export const DataTransfer = ({ ledger, sync }: { ledger: Ledger; sync: Sync }) => {
  const [busy, setBusy] = useState(false)
  const working = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [selection, setSelection] = useState<ImportSelection | null>(null)
  const [filename, setFilename] = useState("")
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => setNavigationGuard(() => !working.current), [])

  const reset = () => {
    setSelection(null)
    setFilename("")
    setNote(null)
  }

  const exportFile = async (format: "json" | "csv") => {
    if (working.current) return
    working.current = true
    setBusy(true)
    setExportOpen(false)
    setNote(null)
    try {
      if (format === "json") downloadText(await ledger.exportBackup(), `finances-backup-${ledger.today()}.json`, "application/json;charset=utf-8")
      else downloadText(ledger.exportCsv(), `finances-${ledger.today()}.csv`, "text/csv;charset=utf-8")
    } catch {
      setNote("Не получилось подготовить файл. Дождитесь сохранения изменений и попробуйте снова.")
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  const chooseFile = async (file: File) => {
    if (working.current) return
    working.current = true
    setBusy(true)
    reset()
    setFilename(file.name)
    try {
      if (file.size > BACKUP_IMPORT_MAX_BYTES) {
        setNote("Файл слишком большой. Максимум — 50 МБ для JSON и 10 МБ для CSV.")
        return
      }
      const text = await file.text()
      if (importFormat(text) === "json") {
        setSelection({ format: "json", text, preview: ledger.previewBackup(text) })
      } else {
        if (file.size > CSV_IMPORT_MAX_BYTES) {
          setNote("Файл CSV слишком большой. Максимум — 10 МБ.")
          return
        }
        if (await sync.syncNow() !== "ok") {
          setNote("Для проверки дублей CSV нужна связь с сервером. Проверьте интернет и вход, затем выберите файл ещё раз.")
          return
        }
        setSelection({ format: "csv", text, preview: ledger.previewCsv(text) })
      }
    } catch {
      setSelection(null)
      setNote("Не получилось прочитать или проверить файл. Данные не импортированы. Выберите файл снова.")
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  const confirmImport = async () => {
    if (working.current || !selection?.preview.ok) return
    working.current = true
    setBusy(true)
    setNote(null)
    let paused = false
    try {
      if (selection.format === "json") {
        await sync.stop()
        paused = true
        const current = ledger.previewBackup(selection.text)
        if (JSON.stringify(current) !== JSON.stringify(selection.preview)) {
          setSelection({ ...selection, preview: current })
          setNote("Данные изменились. Проверьте обновлённый результат перед импортом.")
          return
        }
        downloadText(await ledger.exportBackup(), `finances-before-import-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, "application/json;charset=utf-8")
        const result = await ledger.importBackup(selection.text)
        if (!result.ok) {
          setSelection({ ...selection, preview: result })
          return
        }
        setSelection(null)
        sync.start()
        paused = false
        const outcome = await sync.syncNow()
        setNote(`Копия импортирована. Добавлено: ${result.added}, обновлено: ${result.updated}. ${outcome === "ok" ? "Данные синхронизированы." : "Данные сохранены на устройстве и ждут связи с сервером."}`)
      } else {
        if (await sync.syncNow() !== "ok") {
          setSelection(null)
          setNote("Не удалось свериться с сервером. Импорт не выполнен. Проверьте связь и выберите файл снова.")
          return
        }
        const current = ledger.previewCsv(selection.text)
        if (JSON.stringify(current) !== JSON.stringify(selection.preview)) {
          setSelection({ ...selection, preview: current })
          setNote("Данные изменились после проверки. Посмотрите обновлённый список перед импортом.")
          return
        }
        downloadText(await ledger.exportBackup(), `finances-before-import-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, "application/json;charset=utf-8")
        const result = await ledger.importCsv(selection.text)
        if (!result.ok) {
          setSelection({ ...selection, preview: result })
          return
        }
        setSelection(null)
        const outcome = await sync.syncNow()
        setNote(`Добавлено: ${result.added}. Пропущено дублей: ${result.duplicates}. ${outcome === "ok" ? "Изменения синхронизированы." : "Операции сохранены на устройстве и ждут синхронизации. Не выходите из приложения."}`)
      }
    } catch {
      setSelection(null)
      setNote("Не получилось завершить импорт. Текущая копия, если её скачивание началось, сохранена отдельно. Выберите исходный файл снова для проверки.")
    } finally {
      if (paused) sync.start()
      working.current = false
      setBusy(false)
    }
  }

  return <section class="section">
    <div class="card-list">
      <button type="button" class="row row-button action-row" disabled={busy} onClick={() => setExportOpen(true)}>
        <DownloadIcon /><span class="row-main">Экспорт</span><ForwardIcon size={16} />
      </button>
      <button type="button" class="row row-button action-row" disabled={busy} onClick={() => input.current?.click()}>
        <DownloadIcon /><span class="row-main">Импорт</span><ForwardIcon size={16} />
      </button>
    </div>
    <input ref={input} hidden type="file" accept=".json,application/json,.csv,text/csv" aria-label="Файл для импорта JSON или CSV" disabled={busy} onChange={(event) => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ""
      if (file) void chooseFile(file)
    }} />
    <p class="section-footer">Полная копия JSON или CSV для Excel. При импорте формат определится автоматически.</p>
    {filename && <>
      <p class="section-footer">{filename}{selection ? ` · ${selection.format === "json" ? "Полная копия JSON" : "CSV"}` : ""}</p>
      {selection?.format === "json" && <BackupDetails preview={selection.preview} busy={busy} onConfirm={() => void confirmImport()} />}
      {selection?.format === "csv" && <CsvImportDetails preview={selection.preview} busy={busy} onConfirm={() => void confirmImport()} />}
    </>}
    {busy && <p class="section-footer" role="status">Подготавливаю данные…</p>}
    {note && <p class="section-footer" role="status">{note}</p>}
    {filename && <button type="button" class="text-button" disabled={busy} onClick={reset}>{selection ? "Отмена" : "Закрыть"}</button>}
    {exportOpen && <Sheet label="Экспорт" onClose={() => setExportOpen(false)}>
      {(close) => <div class="sheet-form">
        <div class="sheet-title">Экспорт</div>
        <div class="card-list">
          <button type="button" class="row row-button" disabled={busy} onClick={() => void exportFile("json")}>
            <span class="row-main"><span class="row-title">Полная копия JSON</span><span class="row-sub">Все данные, без интернета</span></span>
          </button>
          <button type="button" class="row row-button" disabled={busy} onClick={() => void exportFile("csv")}>
            <span class="row-main"><span class="row-title">CSV для Excel</span><span class="row-sub">Таблица операций</span></span>
          </button>
        </div>
        <p class="section-footer">JSON сохраняет все данные и настройки, включая неотправленные изменения. CSV не заменяет полную копию.</p>
        <button type="button" class="secondary-button" onClick={close}>Отмена</button>
      </div>}
    </Sheet>}
  </section>
}
