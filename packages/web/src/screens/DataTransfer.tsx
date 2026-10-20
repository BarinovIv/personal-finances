import { periodAt, type Period } from "@fin/domain"
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
import { CSV_EXPORT_PRESETS } from "./constants"
import { csvExportPeriod, importFormat } from "./helpers"
import type { CsvExportPreset, ImportSelection } from "./types"

export const DataTransfer = ({ ledger, sync }: { ledger: Ledger; sync: Sync }) => {
  const [busy, setBusy] = useState(false)
  const working = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [csvOptionsOpen, setCsvOptionsOpen] = useState(false)
  const [csvPreset, setCsvPreset] = useState<CsvExportPreset>("current-month")
  const [csvCustom, setCsvCustom] = useState<Period>(() => periodAt("month", ledger.today(), []))
  const [csvError, setCsvError] = useState<string | null>(null)
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
    let period: Period | undefined
    if (format === "csv") {
      const result = csvExportPeriod(csvPreset, ledger.today(), csvCustom)
      if (!result.ok) {
        setCsvError(result.problem)
        return
      }
      period = result.period
    }
    working.current = true
    setBusy(true)
    setExportOpen(false)
    setNote(null)
    try {
      if (format === "json") downloadText(await ledger.exportBackup(), `finances-backup-${ledger.today()}.json`, "application/json;charset=utf-8")
      else downloadText(ledger.exportCsv(period), period ? `finances-${period.start}_${period.end}.csv` : "finances-all-time.csv", "text/csv;charset=utf-8")
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
        setSelection({ format: "csv", text, preview: ledger.previewCsv(text), ignoredRows: [] })
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
        const options = { ignoredRows: selection.ignoredRows }
        const current = ledger.previewCsv(selection.text, options)
        if (JSON.stringify(current) !== JSON.stringify(selection.preview)) {
          setSelection({ ...selection, preview: current })
          setNote("Данные изменились после проверки. Посмотрите обновлённый список перед импортом.")
          return
        }
        downloadText(await ledger.exportBackup(), `finances-before-import-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, "application/json;charset=utf-8")
        const result = await ledger.importCsv(selection.text, options)
        if (!result.ok) {
          setSelection({ ...selection, preview: result })
          return
        }
        setSelection(null)
        const outcome = await sync.syncNow()
        setNote(`Добавлено: ${result.added}. Пропущено дублей: ${result.duplicates}. Игнорировано строк: ${result.ignored.length}. ${outcome === "ok" ? "Изменения синхронизированы." : "Операции сохранены на устройстве и ждут синхронизации. Не выходите из приложения."}`)
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
      <button type="button" class="row row-button action-row" disabled={busy} onClick={() => {
        setCsvOptionsOpen(false)
        setExportOpen(true)
      }}>
        <DownloadIcon rotate={180} /><span class="row-main">Экспорт</span><ForwardIcon size={16} />
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
    <p class="section-footer">Сохраните данные в файл или загрузите ранее сохранённый файл.</p>
    {filename && <>
      <p class="section-footer">{filename}{selection ? ` · ${selection.format === "json" ? "Резервная копия" : "Таблица операций"}` : ""}</p>
      {selection?.format === "json" && <BackupDetails preview={selection.preview} busy={busy} onConfirm={() => void confirmImport()} />}
      {selection?.format === "csv" && <CsvImportDetails preview={selection.preview} busy={busy} ignoredRows={selection.ignoredRows} onConfirm={() => void confirmImport()} onIgnore={() => {
        if (working.current || selection.preview.ok) return
        const ignoredRows = [...new Set([...selection.ignoredRows, ...selection.preview.problems.filter((problem) => problem.ignorable).map((problem) => problem.row)])]
        const preview = ledger.previewCsv(selection.text, { ignoredRows })
        setSelection({ ...selection, ignoredRows, preview })
        setNote(null)
      }} />}
    </>}
    {busy && <p class="section-footer" role="status">Подготавливаю данные…</p>}
    {note && <p class="section-footer" role="status">{note}</p>}
    {filename && <button type="button" class="text-button" disabled={busy} onClick={reset}>{selection ? "Отмена" : "Закрыть"}</button>}
    {exportOpen && <Sheet label={csvOptionsOpen ? "Таблица для Excel" : "Экспорт"} onClose={() => setExportOpen(false)}>
      {(close) => csvOptionsOpen ? <form class="sheet-form" onSubmit={(event) => {
        event.preventDefault()
        void exportFile("csv")
      }}>
        <div class="sheet-title">Таблица для Excel</div>
        <div class="card-list">
          {CSV_EXPORT_PRESETS.map((preset) => <button type="button" class="row row-button" key={preset.value}
            aria-pressed={csvPreset === preset.value} onClick={() => {
              setCsvPreset(preset.value)
              setCsvError(null)
            }}>
            <span class="row-main">{preset.label}</span>
            {csvPreset === preset.value && <span aria-label="Выбран">✓</span>}
          </button>)}
        </div>
        {csvPreset === "custom" && <div class="card-list">
          <label class="row input-row">
            <span class="row-label">С</span>
            <input class="row-input" type="date" aria-label="Начало периода" value={csvCustom.start} onChange={(event) => {
              setCsvCustom({ ...csvCustom, start: event.currentTarget.value })
              setCsvError(null)
            }} />
          </label>
          <label class="row input-row">
            <span class="row-label">По</span>
            <input class="row-input" type="date" aria-label="Окончание периода" value={csvCustom.end} onChange={(event) => {
              setCsvCustom({ ...csvCustom, end: event.currentTarget.value })
              setCsvError(null)
            }} />
          </label>
        </div>}
        <p class="section-footer">В таблицу попадут подтверждённые операции за выбранный период. Обе даты включены.</p>
        {csvError && <span class="hint error" role="alert">{csvError}</span>}
        <div class="actions-row">
          <button type="button" class="secondary-button grow" onClick={close}>Отмена</button>
          <button type="submit" class="accent-button grow" disabled={busy}>Скачать CSV</button>
        </div>
      </form> : <div class="sheet-form">
        <div class="sheet-title">Экспорт</div>
        <div class="card-list">
          <button type="button" class="row row-button" disabled={busy} onClick={() => void exportFile("json")}>
            <span class="row-main"><span class="row-title">Резервная копия</span><span class="row-sub">Для восстановления в приложении</span></span>
          </button>
          <button type="button" class="row row-button" disabled={busy} onClick={() => {
            setCsvPreset("current-month")
            setCsvCustom(periodAt("month", ledger.today(), []))
            setCsvError(null)
            setCsvOptionsOpen(true)
          }}>
            <span class="row-main"><span class="row-title">Таблица для Excel</span><span class="row-sub">Для просмотра и своих расчётов</span></span>
          </button>
        </div>
        <p class="section-footer">Резервная копия (JSON) сохраняет все ваши данные, включая категории, цели и настройки. Её можно загрузить обратно в приложение или перенести на другое устройство.</p>
        <p class="section-footer">Таблица (CSV) содержит список операций для Excel. Она нужна для своих расчётов и не подходит для полного восстановления данных.</p>
        <button type="button" class="secondary-button" onClick={close}>Отмена</button>
      </div>}
    </Sheet>}
  </section>
}
