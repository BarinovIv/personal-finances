import { execFile } from "node:child_process"
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { expect, it } from "vitest"

const exec = promisify(execFile)
const web = fileURLToPath(new URL("../", import.meta.url))
const modules = fileURLToPath(new URL("../../../node_modules/", import.meta.url))

it("замена manifest под прежним именем обновляет оболочку, одинаковая сборка — нет", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "fin-pwa-build-"))
  try {
    await Promise.all([
      ...["vite.config.ts", "package.json", "index.html", "src", "public"].map((name) =>
        cp(join(web, name), join(fixture, name), { recursive: true })
      ),
      symlink(modules, join(fixture, "node_modules"), "dir")
    ])

    const buildWorker = async () => {
      await exec(process.execPath, [join(modules, "vite/bin/vite.js"), "build", "--logLevel", "error"], {
        cwd: fixture
      })
      return readFile(join(fixture, "dist/sw.js"), "utf8")
    }

    const original = await buildWorker()
    expect(await buildWorker()).toBe(original)

    const manifestPath = join(fixture, "public/manifest.webmanifest")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    const replacement = JSON.stringify({ ...manifest, name: `${manifest.name} новая версия` })
    await writeFile(manifestPath, replacement)

    expect(await buildWorker()).not.toBe(original)
    expect(await readFile(join(fixture, "dist/manifest.webmanifest"), "utf8")).toBe(replacement)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
}, 30_000)
