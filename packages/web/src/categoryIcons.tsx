import type { ComponentChildren } from "preact"

/** Пиктограммы категорий в стиле SF Symbols: белая линия на цветном круге (см. `CategoryBadge`). */
const GLYPHS: Record<string, ComponentChildren> = {
  cart: (
    <>
      <path d="M3 4h2l2.3 12h10l1.7-8H6.2" />
      <circle cx="9.5" cy="19.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="19.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  cup: (
    <>
      <path d="M5 8h11v6a5 5 0 0 1-5 5H9a4 4 0 0 1-4-4z" />
      <path d="M16 9h1.5a2.3 2.3 0 0 1 0 4.6H16" />
    </>
  ),
  car: (
    <>
      <path d="M4 16v-4.5L6 8h12l2 3.5V16" />
      <path d="M3 16h18" />
      <circle cx="7.5" cy="16.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="16.5" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  shirt: <path d="M8.5 4L4 7.5l2 3 2-1.3V20h8V9.2l2 1.3 2-3L15.5 4l-2 2h-3z" />,
  home: (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9h12v-9" />
    </>
  ),
  heart: (
    <path d="M12 20s-7.2-4.5-9.4-8.7C1.3 8.4 2.7 5 6 5c1.9 0 3.3 1 4 2.2.7-1.2 2.1-2.2 4-2.2 3.3 0 4.7 3.4 3.4 6.3C19.2 15.5 12 20 12 20z" />
  ),
  star: <path d="M12 3.5l2.5 5.6 6 .6-4.5 4 1.3 5.9L12 16.8l-5.3 2.8 1.3-5.9-4.5-4 6-.6z" />,
  card: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 14h4" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="9" width="16" height="11" rx="1.5" />
      <path d="M4 9h16M12 9v11" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="6" r="2" />
    </>
  ),
  dots: (
    <>
      <circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  banknote: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="1.5" />
      <circle cx="12" cy="12" r="2.3" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="8" width="18" height="11" rx="1.5" />
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16" cy="14" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z" />
      <path d="M4 19V5.5" />
    </>
  ),
  plane: <path d="M10.5 3l1.5 5 6-3-2 5.5 4 2-6 1-1 6-2.2-5.3-5.4 1.8 1.6-3.4L3 10l6-1.4z" />,
  plus: <path d="M12 5v14M5 12h14" />
}

const DEFAULT_CATEGORY_ICON = "dots"

export const CategoryGlyph = ({ icon, size = 13 }: { icon: string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={1.8}
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {GLYPHS[icon] ?? GLYPHS[DEFAULT_CATEGORY_ICON]}
  </svg>
)
