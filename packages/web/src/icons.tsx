import { SYMBOLS, type SymbolName } from "./symbols"

/** Символ из набора `SYMBOLS` (сетка 56×56), закрашен текущим цветом текста. */
export const SfSymbol = (props: { name: SymbolName; size?: number; label?: string; color?: string }) => {
  const shape: { d: string; evenodd?: boolean; transform?: string } = SYMBOLS[props.name]
  return (
    <svg
      width={props.size ?? 22}
      height={props.size ?? 22}
      viewBox="0 0 56 56"
      fill={props.color ?? "currentColor"}
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

export const DownloadIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="square_arrow_down" size={size} />

export const DebtIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="money_rubl" size={size} />

export const NewsIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="book_fill" size={size} />

export const PhoneIcon = ({ size = 18 }: { size?: number }) => <SfSymbol name="device_phone_portrait" size={size} />

export const CloudIcon = ({ size = 16 }: { size?: number }) => <SfSymbol name="cloud" size={size} />
