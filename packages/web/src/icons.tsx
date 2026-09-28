const Svg = (props: { size?: number; children: preact.ComponentChildren; label?: string; stroke?: string; width?: number }) => (
  <svg
    width={props.size ?? 22}
    height={props.size ?? 22}
    viewBox="0 0 24 24"
    fill="none"
    stroke={props.stroke ?? "currentColor"}
    stroke-width={props.width ?? 1.8}
    stroke-linecap="round"
    stroke-linejoin="round"
    {...(props.label ? { role: "img", "aria-label": props.label } : { "aria-hidden": "true" })}
  >
    {props.children}
  </svg>
)

export const PenIcon = () => (
  <Svg>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
)

export const ChartIcon = () => (
  <Svg>
    <path d="M5 20V11" />
    <path d="M12 20V4" />
    <path d="M19 20v-6" />
  </Svg>
)

export const SlidersIcon = () => (
  <Svg>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Svg>
)

export const CheckIcon = () => (
  <Svg width={2.2}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)

export const BackIcon = ({ size = 20 }: { size?: number }) => (
  <Svg size={size} width={2}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
)

export const ForwardIcon = ({ size = 20 }: { size?: number }) => (
  <Svg size={size} width={2}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
)

export const RefundIcon = ({ size = 15, label }: { size?: number; label?: string }) => (
  <Svg size={size} width={2} stroke="var(--accent)" {...(label ? { label } : {})}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </Svg>
)

export const RepeatIcon = ({ size = 14, label }: { size?: number; label?: string }) => (
  <Svg size={size} width={2} stroke="var(--muted)" {...(label ? { label } : {})}>
    <path d="M17 2l3 3-3 3" />
    <path d="M4 11V9a4 4 0 0 1 4-4h16" />
    <path d="M7 22l-3-3 3-3" />
    <path d="M20 13v2a4 4 0 0 1-4 4H4" />
  </Svg>
)

export const CloudIcon = ({ size = 16 }: { size?: number }) => (
  <Svg size={size} width={2}>
    <path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.1 4.5 4.5 0 0 0 7 18z" />
  </Svg>
)
