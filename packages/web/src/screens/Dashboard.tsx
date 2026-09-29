import { formatMoney } from "@fin/domain"
import { dayMonth, type Dashboard, type DashboardCategory, type Ledger, type PeriodMode } from "@fin/ledger"
import { memo } from "preact/compat"
import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import { allowanceItems } from "../allowance"
import { CategoryBadge } from "../components/CategoryBadge"
import { LargeTitle } from "../components/LargeTitle"
import { signedAmount } from "../components/OperationRow"
import { BackIcon, ForwardIcon, RepeatIcon } from "../icons"
import { GoalsBlock } from "./Goals"
import { dashboardMemory, useLedgerVersion } from "../state"

const MUTED_SECTOR = "var(--chart-muted)"
const paletteVar = (color: string) => `var(--palette-${color})`

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

/** Число «перетекает» к новому значению; без анимации, если пользователь просит её уменьшить. */
const useAnimatedNumber = (target: number, duration = 450) => {
  const [value, setValue] = useState(target)
  const valueRef = useRef(target)
  useEffect(() => {
    valueRef.current = value
  })
  useEffect(() => {
    if (reducedMotion()) return setValue(target)
    const from = valueRef.current
    if (from === target) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setValue(Math.round(from + (target - from) * easeOutCubic(t)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return value
}

/** 0→1 при каждой смене `key` — сектора кольца «дорастают» на новый период. */
const useGrowProgress = (key: string, duration = 450) => {
  const [progress, setProgress] = useState(1)
  useEffect(() => {
    if (reducedMotion()) return setProgress(1)
    setProgress(0)
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setProgress(easeOutCubic(t))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [key])
  return progress
}

/**
 * Насколько каждый сектор «в фокусе»: 1 — свой цвет, 0 — серый. При выборе категории
 * веса плавно перетекают, и сектора гаснут и загораются, а не перекрашиваются рывком.
 */
const useSectorEmphasis = (ids: ReadonlyArray<string>, selected: string | null, duration = 320) => {
  const target = (id: string) => (!selected || selected === id ? 1 : 0)
  const [weights, setWeights] = useState<Record<string, number>>(() => Object.fromEntries(ids.map((id) => [id, target(id)])))
  const weightsRef = useRef(weights)
  useEffect(() => {
    weightsRef.current = weights
  })
  useEffect(() => {
    const to = Object.fromEntries(ids.map((id) => [id, target(id)]))
    if (reducedMotion()) return setWeights(to)
    const from = weightsRef.current
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = easeOutCubic(Math.min(1, (now - start) / duration))
      setWeights(Object.fromEntries(ids.map((id) => [id, (from[id] ?? to[id]!) + (to[id]! - (from[id] ?? to[id]!)) * t])))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [selected, ids.join(",")])
  return (id: string) => weights[id] ?? target(id)
}

/** Цвет сектора между серым и своим — по весу из `useSectorEmphasis`. */
const sectorColor = (color: string, weight: number) =>
  weight >= 1
    ? paletteVar(color)
    : weight <= 0
      ? MUTED_SECTOR
      : `color-mix(in srgb, ${paletteVar(color)} ${(weight * 100).toFixed(1)}%, ${MUTED_SECTOR})`

const shortMoney = (kopecks: number) => {
  const rub = kopecks / 100
  if (Math.abs(rub) < 1000) return `${Math.round(rub)}`
  return `${(Math.round(rub / 100) / 10).toLocaleString("ru-RU")}к`
}

const Summary = memo(({ d }: { d: Dashboard }) => {
  const { comparison } = d
  const change = comparison.change
  const expenses = useAnimatedNumber(d.expenses)
  // можно тратить в день — только в текущем периоде
  const allowance = d.allowance ? allowanceItems(d.allowance) : []
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
        <span class="summary-total num">{formatMoney(expenses)}</span>
        <span class={`compare-badge ${change !== null && change > 0 ? "up" : "down"}`}>{compareText}</span>
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
        {allowance.map((item) => (
          <div class={`summary-cell${allowance.length === 1 ? " wide" : ""}`} key={item.label}>
            <span class="summary-caption">{item.label}</span>
            <span class={`summary-value num${item.over ? " over" : ""}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </section>
  )
})

const Donut = ({ d, selected }: { d: Dashboard; selected: string | null }) => {
  const positive = d.categories.filter((c) => c.amount > 0)
  const total = positive.reduce((s, c) => s + c.amount, 0)
  const progress = useGrowProgress(`${d.period.start}:${d.period.end}`)
  const emphasis = useSectorEmphasis(positive.map((c) => c.id), selected)
  const sel = d.categories.find((c) => c.id === selected)
  const value = useAnimatedNumber(sel ? sel.amount : d.expenses)
  let acc = 0
  const stops: Array<string> = []
  for (const c of positive) {
    const from = (acc / total) * 100
    acc += c.amount
    const to = (acc / total) * 100
    const grown = from + (to - from) * progress
    const color = sectorColor(c.color, emphasis(c.id))
    stops.push(`${color} ${from.toFixed(2)}% ${grown.toFixed(2)}%`)
    if (grown < to) stops.push(`${MUTED_SECTOR} ${grown.toFixed(2)}% ${to.toFixed(2)}%`)
  }
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
          <span class="donut-value num">{formatMoney(value)}</span>
        </div>
      </div>
    </section>
  )
}

/**
 * Полоска категории. Без лимита — доля от самой большой категории периода; с лимитом — заполнение лимита
 * и подпись «из 15 000 ₽», сверх лимита — красным.
 */
const CategoryBar = ({ c, max }: { c: DashboardCategory; max: number }) => {
  if (c.limit === null) {
    return (
      <span class="bar-track">
        <span
          class="bar-fill"
          style={{ width: `${Math.max(0, (c.amount / max) * 100).toFixed(1)}%`, background: paletteVar(c.color) }}
        />
      </span>
    )
  }
  const over = c.amount > c.limit
  const filled = Math.min(1, Math.max(0, c.amount / c.limit))
  return (
    <span class={`cat-limit-line${over ? " over" : ""}`}>
      <span class="bar-track">
        <span
          class="bar-fill"
          style={{ width: `${(filled * 100).toFixed(1)}%`, background: over ? "var(--danger)" : paletteVar(c.color) }}
        />
      </span>
      <span class="cat-limit num">из {formatMoney(c.limit)}</span>
    </span>
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
          const tone = c.amount < 0 ? "negative" : c.limit !== null && c.amount > c.limit ? "over" : ""
          return (
            <div class="cat-block" key={c.id}>
              <button type="button" class="cat-row" aria-expanded={open} onClick={() => props.onSelect(c.id)}>
                <span class="cat-row-line">
                  <CategoryBadge category={c} />
                  <span class="cat-name">{c.name}</span>
                  <span class="cat-share num">{c.share === null ? "" : `${Math.round(c.share * 100)}%`}</span>
                  <span class={`cat-amount num ${tone}`}>{formatMoney(c.amount)}</span>
                  <span class="chevron" style={{ transform: open ? "rotate(90deg)" : "none" }}>
                    <ForwardIcon size={16} />
                  </span>
                </span>
                <CategoryBar c={c} max={max} />
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

const UpcomingBlock = memo(({ d, today }: { d: Dashboard; today: string }) => {
  if (!d.isCurrent || d.upcoming.items.length === 0) return null
  return (
    <section class="upcoming">
      <a href="#/settings" class="upcoming-head">
        <h2>Предстоящие списания</h2>
        <span class="num upcoming-total">{formatMoney(d.upcoming.total)}</span>
        <ForwardIcon size={16} />
      </a>
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
})

const Trend = memo(({ d }: { d: Dashboard }) => {
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
                background: t.current ? "var(--accent)" : MUTED_SECTOR
              }}
            />
            <span class="trend-label">{t.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
})

export const DashboardScreen = ({ ledger }: { ledger: Ledger }) => {
  const version = useLedgerVersion(ledger)
  const [mode, setMode] = useState<PeriodMode>(ledger.dashboardMode())
  // офсет и выбранная категория живут в dashboardMemory на время сессии: открыв операцию и вернувшись
  // назад, пользователь должен увидеть тот же период и ту же раскрытую категорию, а не сброс на дефолт.
  const [offset, setOffsetState] = useState(dashboardMemory.offset)
  const [selected, setSelectedState] = useState<string | null>(dashboardMemory.selected)
  const setOffset = (next: number) => {
    dashboardMemory.offset = next
    setOffsetState(next)
  }
  const setSelected = (next: string | null) => {
    dashboardMemory.selected = next
    setSelectedState(next)
  }
  const today = ledger.today()
  // сводка — самый дорогой расчёт экрана; выбор категории и жесты его не меняют
  const d = useMemo(() => ledger.dashboard({ mode, offset }), [ledger, version, today, mode, offset])
  const select = (id: string) => setSelected(selected === id ? null : id)
  const switchMode = (next: PeriodMode) => {
    setMode(next)
    setOffset(0)
    // выбранная категория переживает смену вида периода — сбрасывается только смена самого периода
    void ledger.setDashboardMode(next)
  }
  const go = (delta: number) => {
    if (delta > 0 && d.isCurrent) return
    setOffset(offset + delta)
    setSelected(null)
  }
  const goToCurrent = () => {
    setOffset(0)
    setSelected(null)
  }

  const touchRef = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    touchRef.current = t ? { x: t.clientX, y: t.clientY } : null
  }
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchRef.current
    touchRef.current = null
    const t = e.changedTouches[0]
    if (!start || !t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.3) return
    go(dx < 0 ? 1 : -1)
  }

  return (
    <LargeTitle title="Дашборд" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div class="segmented" role="group" aria-label="Вид периода">
        <button type="button" aria-pressed={mode === "pay"} onClick={() => switchMode("pay")}>
          Зарплатный период
        </button>
        <button type="button" aria-pressed={mode === "month"} onClick={() => switchMode("month")}>
          Месяц
        </button>
      </div>
      <div class="period-nav">
        <button type="button" class="glass-button" aria-label="Предыдущий период" onClick={() => go(-1)}>
          <BackIcon size={20} />
        </button>
        <div class="period-title">
          <span class="period-label">{d.period.label}</span>
          {d.progress && <span class="row-sub">{d.progress}</span>}
        </div>
        <button type="button" class="glass-button" aria-label="Следующий период" disabled={d.isCurrent} onClick={() => go(1)}>
          <ForwardIcon size={20} />
        </button>
      </div>
      {!d.isCurrent && (
        <button type="button" class="current-period-button" onClick={goToCurrent}>
          К текущему периоду
        </button>
      )}
      <Summary d={d} />
      <Donut d={d} selected={selected} />
      <UpcomingBlock d={d} today={today} />
      <CategoryList d={d} selected={selected} onSelect={select} today={today} />
      <GoalsBlock ledger={ledger} />
      <Trend d={d} />
    </LargeTitle>
  )
}
