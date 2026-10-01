import type { Ledger } from "@fin/ledger"
import { useMemo, useState } from "preact/hooks"

const timeZones = () => [...new Set(["Europe/Moscow", "Asia/Novosibirsk", "UTC", ...Intl.supportedValuesOf("timeZone")])].sort()

export const TimeZoneSection = ({ ledger }: { ledger: Ledger }) => {
  const [query, setQuery] = useState("")
  const [note, setNote] = useState<string | null>(null)
  const zones = useMemo(timeZones, [])
  const selected = ledger.settings().timeZone
  const matching = zones.filter((zone) => zone.toLowerCase().replaceAll("_", " ").includes(query.trim().toLowerCase().replaceAll("_", " ")))
  return <section class="section">
    <div class="card-list">
      <label class="row input-row"><span class="row-label">Поиск</span>
        <input class="row-input" type="search" aria-label="Поиск часового пояса" placeholder="Asia/Novosibirsk"
          value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
      </label>
    </div>
    <p class="section-footer" role="status">{note ?? `Выбран ${selected}. По нему определяются сегодняшняя дата, периоды и регулярные операции на всех ваших устройствах.`}</p>
    <div class="card-list">
      {matching.map((zone) => <button type="button" class="row row-button" key={zone} aria-pressed={selected === zone} onClick={async () => {
        const result = await ledger.setTimeZone(zone)
        setNote(result.ok ? `Сохранено: ${zone}` : "Не получилось сохранить часовой пояс.")
      }}><span class="row-main"><span class="row-title">{zone.replaceAll("_", " ")}</span></span>
        {selected === zone && <span aria-label="Выбран">✓</span>}
      </button>)}
    </div>
    {matching.length === 0 && <p class="section-footer">Ничего не нашлось. Попробуйте название города латиницей.</p>}
  </section>
}
