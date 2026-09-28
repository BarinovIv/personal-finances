import { formatMoney } from "@fin/domain"
import { dayMonth, type Dashboard, type DashboardCategory, type Ledger, type PeriodMode } from "@fin/ledger"
import { useState } from "preact/hooks"
import { signedAmount } from "../components/OperationRow"
import { BackIcon, ForwardIcon, RepeatIcon } from "../icons"
import { useLedgerVersion } from "../state"

const MUTED_SECTOR = "#E4E0D8"

const shortMoney = (kopecks: number) => {
  const rub = kopecks / 100
  if (Math.abs(rub) < 1000) return `${Math.round(rub)}`
  return `${(Math.round(rub / 100) / 10).toLocaleString("ru-RU")}к`
}

const Summary = ({ d }: { d: Dashboard }) => {
  const { comparison } = d
  const change = comparison.change
  const compareText =
    change === null
      ? `${comparison.label}: расходов не было`
      : change === 0
        ? `столько же, сколько ${comparison.label}`
        : `${change < 0 ? "↓" : "↑"} на ${Math.abs(change)}% ${change < 0 ? "меньше" : "больше"}, чем ${comparison.label}`
  return (
    <section class="summary">
      <div class="summary-main">
        <span class="summary-caption">Расходы</span>
        <span class="summary-total num">{formatMoney(d.expenses)}</span>
        <span class={`summary-compare ${change !== null && change > 0 ? "up" : "down"}`}>{compareText}</span>
      </div>
      <div class="summary-grid">
        <div class="summary-cell">
          <span class="summary-caption">Доходы</span>
          <span class="summary-income num">{formatMoney(d.income, { sign: "+" })}</span>
        </div>
        <div class="summary-cell">
          <span class="summary-caption">Доходы − расходы</span>
          <span class="summary-value num">{formatMoney(d.balance, { sign: d.balance >= 0 ? "+" : "−" })}</span>
        </div>
      </div>
    </section>
  )
}

const Donut = ({ d, selected, onSelect }: { d: Dashboard; selected: string | null; onSelect: (id: string) => void }) => {
  const positive = d.categories.filter((c) => c.amount > 0)
  const total = positive.reduce((s, c) => s + c.amount, 0)
  let acc = 0
  const stops = positive.map((c) => {
    const from = (acc / total) * 100
    acc += c.amount
    const to = (acc / total) * 100
    const color = !selected || selected === c.id ? c.color : MUTED_SECTOR
    return `${color} ${from.toFixed(2)}% ${to.toFixed(2)}%`
  })
  const sel = d.categories.find((c) => c.id === selected)
  if (d.categories.length === 0) return null
  return (
    <section class="donut-card" aria-label="Доли категорий">
      <div
        class="donut"
        style={{ background: total > 0 ? `conic-gradient(${stops.join(", ")})` : MUTED_SECTOR }}
        role="img"
        aria-label={positive.map((c) => `${c.name} ${Math.round((c.share ?? 0) * 100)}%`).join(", ")}
      >
        <div class="donut-hole">
          <span class="donut-caption">{sel ? sel.name : "Всего"}</span>
          <span class="donut-value num">{formatMoney(sel ? sel.amount : d.expenses)}</span>
        </div>
      </div>
      <div class="legend">
        {d.categories.map((c) => (
          <button
            type="button"
            class="legend-item"
            aria-pressed={selected === c.id}
            style={{ color: !selected || selected === c.id ? "var(--ink)" : "var(--faint)" }}
            onClick={() => onSelect(c.id)}
          >
            <span class="dot small" style={{ background: c.color }} />
            <span class="legend-name">{c.name}</span>
            <span class="num">{c.share === null ? "—" : `${Math.round(c.share * 100)}%`}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

const CategoryList = (props: { d: Dashboard; selected: string | null; onSelect: (id: string) => void; today: string }) => {
  const max = Math.max(1, ...props.d.categories.map((c) => c.amount))
  if (props.d.categories.length === 0) return <div class="empty">За этот период расходов нет</div>
  return (
    <section class="section">
      <h2>По категориям</h2>
      <div class="card-list">
        {props.d.categories.map((c: DashboardCategory) => {
          const open = props.selected === c.id
          return (
            <div class="cat-block" key={c.id}>
              <button type="button" class="cat-row" aria-expanded={open} onClick={() => props.onSelect(c.id)}>
                <span class="cat-row-line">
                  <span class="dot" style={{ background: c.color }} />
                  <span class="cat-name">{c.name}</span>
                  <span class="cat-share num">{c.share === null ? "" : `${Math.round(c.share * 100)}%`}</span>
                  <span class={`cat-amount num ${c.amount < 0 ? "negative" : ""}`}>{formatMoney(c.amount)}</span>
                  <span class="chevron" style={{ transform: open ? "rotate(90deg)" : "none" }}>
                    <ForwardIcon size={16} />
                  </span>
                </span>
                <span class="bar-track">
                  <span class="bar-fill" style={{ width: `${Math.max(0, (c.amount / max) * 100).toFixed(1)}%`, background: c.color }} />
                </span>
              </button>
              {open && (
                <div class="cat-ops">
                  {c.operations.map((op) => (
                    <a href={`#/op/${op.id}`} class="cat-op" key={op.id}>
                      <span class="cat-op-desc">{op.kind === "refund" ? `возврат: ${op.description}` : op.description}</span>
                      <span class="row-sub">{dayMonth(op.date, props.today)}</span>
                      <span class={`cat-op-amount num ${op.kind}`}>
                        {op.kind === "refund" ? signedAmount(op) : formatMoney(op.amount)}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

const UpcomingBlock = ({ d, today }: { d: Dashboard; today: string }) => {
  if (!d.isCurrent || d.upcoming.items.length === 0) return null
  return (
    <section class="upcoming">
      <div class="upcoming-head">
        <h2>Предстоящие списания</h2>
        <span class="num upcoming-total">{formatMoney(d.upcoming.total)}</span>
      </div>
      {d.upcoming.items.map((u) => (
        <div class="upcoming-row" key={`${u.templateId}:${u.date}`}>
          <RepeatIcon />
          <span class="grow-text">
            {u.description} · {dayMonth(u.date, today)}
          </span>
          <span class="num">{formatMoney(u.amount)}</span>
        </div>
      ))}
    </section>
  )
}

const Trend = ({ d }: { d: Dashboard }) => {
  const max = Math.max(1, ...d.trend.map((t) => t.amount))
  return (
    <section class="trend-card">
      <h2>{d.mode === "month" ? "Расходы по месяцам" : "Расходы по зарплатным периодам"}</h2>
      <div class="trend">
        {d.trend.map((t) => (
          <div class="trend-col" key={t.start}>
            <span class="trend-value num">{shortMoney(t.amount)}</span>
            <span
              class="trend-bar"
              style={{
                height: `${Math.max(4, Math.round((Math.max(0, t.amount) / max) * 96))}px`,
                background: t.current ? "var(--accent)" : "#CFC9BE"
              }}
            />
            <span class="trend-label">{t.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export const DashboardScreen = ({ ledger }: { ledger: Ledger }) => {
  useLedgerVersion(ledger)
  const [mode, setMode] = useState<PeriodMode>(ledger.dashboardMode())
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const d = ledger.dashboard({ mode, offset })
  const select = (id: string) => setSelected(selected === id ? null : id)
  const switchMode = (next: PeriodMode) => {
    setMode(next)
    setOffset(0)
    setSelected(null)
    void ledger.setDashboardMode(next)
  }
  const go = (delta: number) => {
    setOffset(offset + delta)
    setSelected(null)
  }

  return (
    <div class="screen">
      <div class="page">
        <h1>Дашборд</h1>
        <div class="segmented" role="group" aria-label="Вид периода">
          <button type="button" aria-pressed={mode === "pay"} onClick={() => switchMode("pay")}>
            Зарплатный период
          </button>
          <button type="button" aria-pressed={mode === "month"} onClick={() => switchMode("month")}>
            Месяц
          </button>
        </div>
        <div class="period-nav">
          <button type="button" class="icon-button" aria-label="Предыдущий период" onClick={() => go(-1)}>
            <BackIcon size={22} />
          </button>
          <div class="period-title">
            <span class="period-label">{d.period.label}</span>
            {d.progress && <span class="row-sub">{d.progress}</span>}
          </div>
          <button type="button" class="icon-button" aria-label="Следующий период" onClick={() => go(1)}>
            <ForwardIcon size={22} />
          </button>
        </div>
        <Summary d={d} />
        <Donut d={d} selected={selected} onSelect={select} />
        <UpcomingBlock d={d} today={ledger.today()} />
        <CategoryList d={d} selected={selected} onSelect={select} today={ledger.today()} />
        <Trend d={d} />
      </div>
    </div>
  )
}
