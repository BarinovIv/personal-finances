import { formatMoney } from "@fin/domain"
import { dayMonth, type Dashboard, type DashboardCategory, type Ledger, type PeriodMode } from "@fin/ledger"
import { memo } from "preact/compat"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks"
import { allowanceItems } from "../allowance"
import { useAnimatedNumber } from "../animatedNumber"
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
    change === 0
      ? `столько же, сколько ${comparison.label}`
      : change === null
        ? ""
        : `${change < 0 ? "↓" : "↑"} на ${Math.abs(change)}% ${change < 0 ? "меньше" : "больше"}, чем ${comparison.label}`
  return (
    <section class="summary">
      <div class="summary-main">
        <span class="summary-caption">Расходы</span>
        <span class="summary-total num">{formatMoney(expenses)}</span>
        {change !== null && <span class={`compare-badge ${change > 0 ? "up" : "down"}`}>{compareText}</span>}
      </div>
      <div class="summary-grid">
        <div class="summary-cell">
          <span class="summary-caption">Доходы</span>
          <span class="summary-income num">{formatMoney(d.income, { sign: "+" })}</span>
        </div>
        <div class="summary-cell">
          <span class="summary-caption">Остаток</span>
          <span class="summary-value num">{formatMoney(d.balance)}</span>
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

const Donut = ({ d, selected, onSelect }: { d: Dashboard; selected: string | null; onSelect: (id: string) => void }) => {
  const positive = d.categories.filter((c) => c.amount > 0)
  const total = positive.reduce((s, c) => s + c.amount, 0)
  const progress = useGrowProgress(`${d.period.start}:${d.period.end}`)
  const emphasis = useSectorEmphasis(positive.map((c) => c.id), selected)
  const sel = d.categories.find((c) => c.id === selected)
  const value = useAnimatedNumber(sel ? sel.amount : d.expenses)
  let acc = 0
  const sectors = positive.map((c) => {
    const from = (acc / total) * 100
    const length = (c.amount / total) * 100
    acc += c.amount
    return { category: c, from, length }
  })
  if (d.categories.length === 0) return null
  return (
    <section class="donut-card" aria-label="Доли категорий">
      <div class="donut">
        <svg class="donut-graphic" viewBox="0 0 100 100" role="group" aria-label="Расходы по категориям">
          <circle class="donut-track" cx="50" cy="50" r="44" pathLength="100" />
          {sectors.map(({ category: c, from, length }) => (
            <circle
              class="donut-sector"
              key={c.id}
              cx="50"
              cy="50"
              r="44"
              pathLength="100"
              role="button"
              tabIndex={0}
              aria-label={`${c.name}: ${formatMoney(c.amount)}, ${Math.round((c.share ?? 0) * 100)}%`}
              aria-pressed={selected === c.id}
              style={{
                stroke: sectorColor(c.color, emphasis(c.id)),
                strokeDasharray: `${(length * progress).toFixed(2)} ${(100 - length * progress).toFixed(2)}`,
                strokeDashoffset: `${(-from).toFixed(2)}`
              }}
              onClick={() => onSelect(c.id)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                onSelect(c.id)
              }}
            />
          ))}
        </svg>
        <div class="donut-hole">
          <span class="donut-caption">{sel ? sel.name : "Всего"}</span>
          <span class="donut-value num">{formatMoney(value)}</span>
        </div>
      </div>
    </section>
  )
}

/**
 * Полоска категории. Без лимита — доля от самой большой категории периода; с лимитом — процент,
 * сумма лимита и его заполнение. Сверх лимита — красным.
 */
const CategoryBar = ({ c, max, amount }: { c: DashboardCategory; max: number; amount: number }) => {
  if (c.limit === null) {
    return (
      <span class="bar-track">
        <span
          class="bar-fill"
          style={{ width: `${Math.max(0, (amount / max) * 100).toFixed(1)}%`, background: paletteVar(c.color) }}
        />
      </span>
    )
  }
  const over = c.amount > c.limit
  const filled = Math.min(1, Math.max(0, amount / c.limit))
  const percent = Math.max(0, Math.round((amount / c.limit) * 100))
  return (
    <span class={`cat-limit-block${over ? " over" : ""}`}>
      <span class="cat-limit-copy num">
        <span class="cat-limit-percent" style={{ color: over ? "var(--danger)" : paletteVar(c.color) }}>
          {percent}%
        </span>
        <span class="cat-limit-total">из {formatMoney(c.limit)}</span>
      </span>
      <span class="bar-track">
        <span
          class="bar-fill"
          style={{ width: `${(filled * 100).toFixed(1)}%`, background: over ? "var(--danger)" : paletteVar(c.color) }}
        />
      </span>
    </span>
  )
}

const CategoryBlock = (props: {
  c: DashboardCategory
  max: number
  initialAmount: number
  open: boolean
  dimmed: boolean
  onSelect: (id: string) => void
  today: string
}) => {
  const { c } = props
  const amount = useAnimatedNumber(c.amount, 450, props.initialAmount)
  const tone = c.amount < 0 ? "negative" : c.limit !== null && c.amount > c.limit ? "over" : ""
  return (
    <div
      class={`cat-block${props.open ? " selected" : props.dimmed ? " dimmed" : ""}`}
      style={`--cat-highlight: ${paletteVar(c.color)}`}
    >
      <button type="button" class="cat-row" aria-expanded={props.open} onClick={() => props.onSelect(c.id)}>
        <span class="cat-row-line">
          <CategoryBadge category={c} />
          <span class="cat-name">{c.name}</span>
          <span class="cat-share num">{c.share === null ? "" : `${Math.round(c.share * 100)}%`}</span>
          <span class={`cat-amount num ${tone}`}>{formatMoney(amount)}</span>
          <span class="chevron" style={{ transform: props.open ? "rotate(90deg)" : "none" }}>
            <ForwardIcon size={16} />
          </span>
        </span>
        <CategoryBar c={c} max={props.max} amount={amount} />
      </button>
      {props.open && (
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
}

const CategoryList = (props: { d: Dashboard; selected: string | null; onSelect: (id: string) => void; today: string }) => {
  const max = Math.max(1, ...props.d.categories.map((c) => c.amount))
  const previousAmounts = useRef<ReadonlyMap<string, number> | null>(null)
  const initialAmounts = previousAmounts.current
  useLayoutEffect(() => {
    previousAmounts.current = new Map(props.d.categories.map((c) => [c.id, c.amount]))
  })
  if (props.d.categories.length === 0) return <div class="empty">За этот период расходов нет</div>
  return (
    <section class="section">
      <h2>По категориям</h2>
      <div class="card-list">
        {props.d.categories.map((c: DashboardCategory) => {
          const open = props.selected === c.id
          return (
            <CategoryBlock
              key={c.id}
              c={c}
              max={max}
              initialAmount={initialAmounts === null ? c.amount : (initialAmounts.get(c.id) ?? 0)}
              open={open}
              dimmed={props.selected !== null && !open}
              onSelect={props.onSelect}
              today={props.today}
            />
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

const Trend = memo(
  ({ d, onSelect, anchorRef }: { d: Dashboard; onSelect: (offset: number) => void; anchorRef: { current: HTMLElement | null } }) => {
    const max = Math.max(1, ...d.trend.map((t) => t.amount))
    return (
      <section class="trend-card" ref={anchorRef}>
        <h2>{d.mode === "month" ? "Расходы по месяцам" : "Расходы по зарплатным периодам"}</h2>
        <div class="trend">
          {d.trend.map((t) => (
            <button
              type="button"
              class="trend-col"
              key={t.start}
              aria-label={`${t.label}: ${formatMoney(t.amount)}`}
              aria-pressed={t.current}
              onClick={() => onSelect(t.offset)}
            >
              <span class="trend-value num">{shortMoney(t.amount)}</span>
              <span
                class="trend-bar"
                style={{
                  height: `${Math.max(4, Math.round((Math.max(0, t.amount) / max) * 96))}px`,
                  background: t.current ? "var(--accent)" : MUTED_SECTOR
                }}
              />
              <span class="trend-label">{t.label}</span>
            </button>
          ))}
        </div>
      </section>
    )
  }
)

export const DashboardScreen = ({ ledger }: { ledger: Ledger }) => {
  const version = useLedgerVersion(ledger)
  const [mode, setMode] = useState<PeriodMode>(ledger.dashboardMode())
  // офсет и выбранная категория живут в dashboardMemory на время сессии: открыв операцию и вернувшись
  // назад, пользователь должен увидеть тот же период и ту же раскрытую категорию, а не сброс на дефолт.
  const [offset, setOffsetState] = useState(dashboardMemory.offset)
  const [selected, setSelectedState] = useState<string | null>(dashboardMemory.selected)
  const trendRef = useRef<HTMLElement>(null)
  const trendTopBeforeNavigation = useRef<number | null>(null)
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
  const goToTrend = (nextOffset: number) => {
    if (nextOffset === offset) return
    trendTopBeforeNavigation.current = trendRef.current?.getBoundingClientRect().top ?? null
    setOffset(nextOffset)
    setSelected(null)
  }
  useLayoutEffect(() => {
    const before = trendTopBeforeNavigation.current
    const trend = trendRef.current
    trendTopBeforeNavigation.current = null
    if (before === null || !trend) return
    const scroller = trend.closest<HTMLElement>(".screen")
    if (scroller) scroller.scrollTop += trend.getBoundingClientRect().top - before
  }, [offset])

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
      <Donut d={d} selected={selected} onSelect={select} />
      <UpcomingBlock d={d} today={today} />
      <CategoryList d={d} selected={selected} onSelect={select} today={today} />
      <GoalsBlock ledger={ledger} />
      <Trend d={d} onSelect={goToTrend} anchorRef={trendRef} />
    </LargeTitle>
  )
}
