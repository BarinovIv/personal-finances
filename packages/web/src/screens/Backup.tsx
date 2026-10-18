import type { BackupPreview, Ledger } from "@fin/ledger"
import type { Sync } from "@fin/sync"
import { useState } from "preact/hooks"
import { BACKUP_COLLECTION_LABELS, BACKUP_IMPORT_MAX_BYTES } from "../constants"
import { downloadText } from "../helpers"
import { DownloadIcon } from "../icons"
import type { DataTransferState } from "../types"

export const BackupSection = ({ ledger, sync, transfer }: { ledger: Ledger; sync: Sync; transfer: DataTransferState }) => {
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [filename, setFilename] = useState("")
  const [note, setNote] = useState<string | null>(null)
  const { busy, setBusy, working } = transfer

  return <section class="section">
    <h2>Полная резервная копия</h2>
    <p class="section-footer">Все данные текущего пользователя: операции и их связи, категории, цели, регулярные шаблоны, настройки и удаления. Копия включает изменения, ещё не отправленные на сервер. Скачать её можно без интернета.</p>
    <div class="card-list">
      <button type="button" class="row row-button action-row" disabled={busy} onClick={async () => {
        if (working.current) return
        working.current = true
        setBusy(true)
        setNote(null)
        try {
          downloadText(await ledger.exportBackup(), `finances-backup-${ledger.today()}.json`, "application/json;charset=utf-8")
          setNote("Полная копия подготовлена. Сохраните скачанный JSON-файл.")
        } catch {
          setNote("Не получилось подготовить копию. Дождитесь сохранения изменений и попробуйте снова.")
        } finally {
          working.current = false
          setBusy(false)
        }
      }}><DownloadIcon /><span>Скачать полную копию JSON</span></button>
      <label class="row row-button action-row">
        <DownloadIcon /><span>Выбрать копию для импорта</span>
        <input class="visually-hidden" type="file" accept=".json,application/json" aria-label="Полная копия JSON" disabled={busy} onChange={async (event) => {
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
            if (file.size > BACKUP_IMPORT_MAX_BYTES) {
              setNote("Файл слишком большой. Максимум — 50 МБ.")
              return
            }
            const content = await file.text()
            setText(content)
            setPreview(ledger.previewBackup(content))
          } catch {
            setNote("Не получилось прочитать копию. Данные не изменены.")
          } finally {
            working.current = false
            setBusy(false)
          }
        }} />
      </label>
    </div>
    {preview && <>
      <p class="section-footer">{filename}</p>
      {preview.ok ? <>
        <div class="card-list">
          {BACKUP_COLLECTION_LABELS.map(([collection, label]) => <div class="row" key={collection}>
            <span class="row-main">{label}</span>
            <span class="num">{preview.counts[collection]}</span>
          </div>)}
        </div>
        <p class="section-footer" role="status">Всего записей, включая удалённые: {preview.total}. Новых: {preview.added}. Обновлений: {preview.updated}. Совпадают: {preview.unchanged}. Более новых на устройстве: {preview.skipped}. Локальных настроек к восстановлению: {preview.localChanges}.</p>
        <p class="section-footer">Копия объединится с текущими данными по идентификаторам. Более новые правки сохранятся; удаления из копии тоже учитываются. Перед импортом скачается копия текущего состояния.</p>
        <button type="button" class="accent-button large" disabled={busy} onClick={async () => {
          if (working.current || text === null) return
          working.current = true
          setBusy(true)
          setNote(null)
          let paused = false
          try {
            await sync.stop()
            paused = true
            const current = ledger.previewBackup(text)
            if (JSON.stringify(current) !== JSON.stringify(preview)) {
              setPreview(current)
              setNote("Данные изменились. Проверьте обновлённый результат перед импортом.")
              return
            }
            downloadText(await ledger.exportBackup(), `finances-before-import-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, "application/json;charset=utf-8")
            const result = await ledger.importBackup(text)
            if (!result.ok) {
              setPreview(result)
              return
            }
            setPreview(null)
            setText(null)
            sync.start()
            paused = false
            const outcome = await sync.syncNow()
            setNote(`Копия импортирована. Добавлено: ${result.added}, обновлено: ${result.updated}. ${outcome === "ok" ? "Данные синхронизированы." : "Данные сохранены на устройстве и ждут связи с сервером."}`)
          } catch {
            setPreview(null)
            setText(null)
            setNote("Не удалось завершить импорт. Текущая копия, если её скачивание началось, сохранена отдельно. Выберите исходный файл снова для проверки.")
          } finally {
            if (paused) sync.start()
            working.current = false
            setBusy(false)
          }
        }}>Сохранить текущую копию и импортировать</button>
      </> : <div role="alert">
        <p class="section-footer">Копия не импортирована.</p>
        <ul>{preview.problems.map((problem, index) => <li key={index}>{problem}</li>)}</ul>
      </div>}
    </>}
    {busy && <p class="section-footer" role="status">Подготавливаю данные…</p>}
    {note && <p class="section-footer" role="status">{note}</p>}
    <p class="section-footer">Копия предназначена для того же пользователя. Вход, пароль и приглашения управляются на сервере и в этот файл не входят.</p>
  </section>
}
