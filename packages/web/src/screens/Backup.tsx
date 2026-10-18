import type { BackupPreview } from "@fin/ledger"
import { BACKUP_COLLECTION_LABELS } from "../constants"

export const BackupDetails = ({ preview, busy, onConfirm }: { preview: BackupPreview; busy: boolean; onConfirm: () => void }) => <>
  {preview.ok ? <>
    <div class="card-list">
      {BACKUP_COLLECTION_LABELS.map(([collection, label]) => <div class="row" key={collection}>
        <span class="row-main">{label}</span>
        <span class="num">{preview.counts[collection]}</span>
      </div>)}
    </div>
    <p class="section-footer" role="status">Всего записей, включая удалённые: {preview.total}. Новых: {preview.added}. Обновлений: {preview.updated}. Совпадают: {preview.unchanged}. Более новых на устройстве: {preview.skipped}. Локальных настроек к восстановлению: {preview.localChanges}.</p>
    <p class="section-footer">Копия объединится с текущими данными по идентификаторам. Более новые правки сохранятся; удаления из копии тоже учитываются. Перед импортом скачается копия текущего состояния.</p>
    <button type="button" class="accent-button large" disabled={busy} onClick={onConfirm}>Сохранить текущую копию и импортировать</button>
  </> : <div role="alert">
    <p class="section-footer">Копия не импортирована.</p>
    <ul>{preview.problems.map((problem, index) => <li key={index}>{problem}</li>)}</ul>
  </div>}
  <p class="section-footer">Полная копия предназначена для того же пользователя. Вход, пароль и приглашения в файл не входят.</p>
</>
