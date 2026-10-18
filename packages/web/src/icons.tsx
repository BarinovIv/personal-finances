import { SYMBOLS, type SymbolName } from "./symbols"

/** Символ из набора `SYMBOLS` (сетка 56×56), закрашен текущим цветом текста. */
export const SfSymbol = (props: { name: SymbolName; size?: number; label?: string; color?: string; rotate?: number }) => {
  const shape: { d: string; evenodd?: boolean; transform?: string } = SYMBOLS[props.name]
  return (
    <svg
      width={props.size ?? 22}
      height={props.size ?? 22}
      viewBox="0 0 56 56"
      fill={props.color ?? "currentColor"}
      style={props.rotate ? { transform: `rotate(${props.rotate}deg)` } : undefined}
      {...(props.label ? { role: "img", "aria-label": props.label } : { "aria-hidden": "true" })}
    >
      <path d={shape.d} fill-rule={shape.evenodd ? "evenodd" : undefined} transform={shape.transform} />
    </svg>
  )
}

/* Таббар, как в iOS, — заливные варианты: «square.and.pencil», «chart.pie», «gearshape». */
export const PenIcon = () => <SfSymbol name="square_pencil_fill" size={25} />

export const ChartIcon = () => <SfSymbol name="chart_pie_fill" size={25} />

export const SlidersIcon = () => <SfSymbol name="gear_alt_fill" size={25} />

export const CheckIcon = ({ size = 22 }: { size?: number }) => <SfSymbol name="checkmark" size={size} />

export const EditIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="m2.1 13.9.7-3L10.7 3a1.85 1.85 0 0 1 2.6 2.6l-7.9 7.9-3.3.4Zm7.5-9.2 2.6 2.6" />
  </svg>
)

export const ArrowUpIcon = ({ size = 20 }: { size?: number }) => <SfSymbol name="arrow_up" size={size} />

export const ChevronDownIcon = ({ size = 14 }: { size?: number }) => <SfSymbol name="chevron_down" size={size} />

export const CloseIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="xmark" size={size} />

export const SearchIcon = ({ size = 20 }: { size?: number }) => <SfSymbol name="search" size={size} />

export const TrashIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="trash" size={size} />

/** «Ручка» для перетаскивания строки, как `line.3.horizontal` в списках iOS. */
export const GripIcon = ({ size = 20 }: { size?: number }) => <SfSymbol name="line_3_horizontal" size={size} />

export const PlusIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="plus" size={size} />

export const LogoutIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="square_arrow_left" size={size} />

export const BackIcon = ({ size = 20 }: { size?: number }) => <SfSymbol name="chevron_left" size={size} />

export const ForwardIcon = ({ size = 20 }: { size?: number }) => <SfSymbol name="chevron_right" size={size} />

export const RefundIcon = ({ size = 15, label }: { size?: number; label?: string }) => (
  <SfSymbol name="arrow_uturn_left" size={size} color="var(--accent)" {...(label ? { label } : {})} />
)

export const RepeatIcon = ({ size = 14, label }: { size?: number; label?: string }) => (
  <SfSymbol name="repeat" size={size} color="var(--muted)" {...(label ? { label } : {})} />
)

export const CalendarIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="calendar" size={size} />

export const LoopIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="repeat" size={size} />

export const GridIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="square_grid_2x2_fill" size={size} />

export const StarIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="star_fill" size={size} />

export const DownloadIcon = ({ size = 18, rotate }: { size?: number; rotate?: number }) => <SfSymbol name="square_arrow_down" size={size} rotate={rotate} />

export const DebtIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="money_rubl" size={size} />

export const NewsIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="book_fill" size={size} />

export const PhoneIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="device_phone_portrait" size={size} />

export const CloudIcon = ({ size = 16, warning = false }: { size?: number; warning?: boolean }) => warning ? (
  <svg width={size} height={size} viewBox="0 0 56 56" fill="currentColor" aria-hidden="true">
    <path d={SYMBOLS.cloud.d} />
    <path d="M26 22h4v11h-4z" />
    <circle cx="28" cy="37" r="2" />
  </svg>
) : <SfSymbol name="cloud" size={size} />

export const WarningIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
  </svg>
)
