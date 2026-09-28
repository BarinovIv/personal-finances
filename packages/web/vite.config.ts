import preact from "@preact/preset-vite"
import { defineConfig } from "vite"

export default defineConfig({
  root: __dirname,
  plugins: [preact()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    proxy: { "/api": "http://localhost:8080" }
  }
})
