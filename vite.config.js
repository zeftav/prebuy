import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build stamp: Cloudflare Pages exposes CF_PAGES_COMMIT_SHA at build time so a
// bug report maps back to a deploy. Falls back to 'dev' locally.
const buildSha = process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ?? 'dev'

// Semantic version comes from package.json so there's one source of truth.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
