// Рисует иконки приложения в public/icons: node packages/web/scripts/icons.mjs
// Зелёный фон, три светлых столбика — как вкладка «Дашборд».
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons")
mkdirSync(out, { recursive: true })

const BG = [0x0e, 0xa9, 0x68]
const FG = [0xff, 0xff, 0xff]

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** size — сторона; safe — доля стороны, внутри которой рисунок (для maskable меньше). */
const icon = (size, safe) => {
  const pixels = Buffer.alloc(size * size * 4)
  const inner = size * safe
  const offset = (size - inner) / 2
  const barW = inner * 0.16
  const gap = inner * 0.12
  const left = offset + (inner - (barW * 3 + gap * 2)) / 2
  const bottom = offset + inner * 0.8
  const heights = [0.34, 0.6, 0.46].map((h) => h * inner)
  const radius = barW / 2
  const inBar = (x, y) =>
    heights.some((h, i) => {
      const x0 = left + i * (barW + gap)
      const top = bottom - h
      if (x < x0 || x > x0 + barW || y > bottom || y < top) return false
      // скруглённый верх
      if (y < top + radius) {
        const cx = x0 + radius
        return (x - cx) ** 2 + (y - (top + radius)) ** 2 <= radius ** 2
      }
      return true
    })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // сглаживание 2×2
      let hits = 0
      for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) if (inBar(x + dx, y + dy)) hits++
      const t = hits / 4
      const i = (y * size + x) * 4
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(BG[c] * (1 - t) + FG[c] * t)
      pixels[i + 3] = 255
    }
  }
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ])
}

writeFileSync(join(out, "icon-192.png"), icon(192, 0.8))
writeFileSync(join(out, "icon-512.png"), icon(512, 0.8))
writeFileSync(join(out, "maskable-512.png"), icon(512, 0.6))
writeFileSync(join(out, "apple-touch-icon.png"), icon(180, 0.8))
writeFileSync(join(out, "favicon-32.png"), icon(32, 0.9))
console.log("иконки в", out)
