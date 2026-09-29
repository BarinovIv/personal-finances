/** Фиксированная палитра цветов категорий (ADR-0004): хранится название, оттенок задаёт styles.css по теме. */
export const PALETTE_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
  "brown",
  "gray"
] as const

export type PaletteColor = (typeof PALETTE_COLORS)[number]

/** RGB светлой темы — только для сопоставления старых hex-значений с ближайшим названием. */
const PALETTE_RGB: Record<PaletteColor, readonly [number, number, number]> = {
  red: [217, 59, 59],
  orange: [224, 123, 57],
  yellow: [185, 147, 43],
  green: [47, 158, 88],
  teal: [30, 143, 130],
  blue: [47, 111, 176],
  indigo: [88, 101, 196],
  purple: [132, 73, 168],
  pink: [193, 63, 121],
  brown: [138, 106, 61],
  gray: [107, 104, 98]
}

const isPaletteColor = (raw: string): raw is PaletteColor => (PALETTE_COLORS as ReadonlyArray<string>).includes(raw)

const parseHex = (raw: string): readonly [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(raw.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Раньше категория хранила произвольный hex. При чтении такое значение сопоставляется
 * с ближайшим (по расстоянию в RGB) названием текущей палитры (ADR-0004).
 */
export const normalizePaletteColor = (raw: string): PaletteColor => {
  if (isPaletteColor(raw)) return raw
  const rgb = parseHex(raw)
  if (!rgb) return "gray"
  let best: PaletteColor = "gray"
  let bestDistance = Infinity
  for (const name of PALETTE_COLORS) {
    const [r, g, b] = PALETTE_RGB[name]
    const distance = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = name
    }
  }
  return best
}
