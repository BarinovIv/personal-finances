import preact from "@preact/preset-vite"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { build, defineConfig, type Plugin } from "vite"

const publicFiles = (dir: string): Array<string> =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? publicFiles(full) : [full]
  })

/**
 * Собирает service worker после основной сборки: вписывает в него список файлов оболочки
 * и версию — хэш этого списка и содержимого, так что любая правка даёт новую версию.
 */
const serviceWorker = (): Plugin => {
  let files: Array<string> = []
  let hash = ""
  return {
    name: "fin-service-worker",
    apply: "build",
    generateBundle(_, bundle) {
      const h = createHash("sha256")
      files = Object.keys(bundle).map((f) => `/${f}`)
      for (const [name, item] of Object.entries(bundle)) {
        h.update(name)
        h.update(item.type === "chunk" ? item.code : typeof item.source === "string" ? item.source : Buffer.from(item.source))
      }
      const publicDir = join(__dirname, "public")
      for (const file of publicFiles(publicDir)) {
        const name = `/${relative(publicDir, file).split("\\").join("/")}`
        files.push(name)
        h.update(name)
        h.update(readFileSync(file))
      }
      hash = h.digest("hex").slice(0, 12)
    },
    async closeBundle() {
      const precache = ["/", ...files.filter((f) => f !== "/index.html"), "/index.html"]
      await build({
        configFile: false,
        logLevel: "warn",
        define: { __VERSION__: JSON.stringify(hash), __PRECACHE__: JSON.stringify(precache) },
        build: {
          outDir: join(__dirname, "dist"),
          emptyOutDir: false,
          copyPublicDir: false,
          lib: { entry: join(__dirname, "src/sw.ts"), formats: ["es"], fileName: () => "sw.js" }
        }
      })
    }
  }
}

export default defineConfig({
  root: __dirname,
  plugins: [preact(), serviceWorker()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    proxy: { "/api": "http://localhost:8080" }
  }
})
