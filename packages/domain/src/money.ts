/** Сумма в копейках → «1 500 ₽», «99,90 ₽». Копейки показываются, только если они есть. */
export const formatMoney = (kopecks: number, options: { sign?: "−" | "+" | "" } = {}): string => {
  const abs = Math.abs(Math.round(kopecks))
  const rubles = Math.floor(abs / 100)
  const cents = abs % 100
  const whole = rubles.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  const text = cents === 0 ? whole : `${whole},${String(cents).padStart(2, "0")}`
  const sign = options.sign ?? (kopecks < 0 ? "−" : "")
  return `${sign}${text} ₽`
}

/** Сумма в копейках → «1500,00» — для CSV и полей ввода. */
export const formatDecimal = (kopecks: number, separator = ","): string => {
  const sign = kopecks < 0 ? "-" : ""
  const abs = Math.abs(Math.round(kopecks))
  return `${sign}${Math.floor(abs / 100)}${separator}${String(abs % 100).padStart(2, "0")}`
}

/** «1 500», «99,9», «99.90» → копейки; иначе null. */
export const parseMoney = (text: string): number | null => {
  const clean = text.replace(/[\s ₽]/g, "").replace(",", ".")
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  const value = Math.round(Number(clean) * 100)
  return value > 0 ? value : null
}
