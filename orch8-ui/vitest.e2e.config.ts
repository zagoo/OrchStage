import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Live integration suite — runs against a real orch8-server (default
// http://localhost:8080, override with ORCH8_E2E_URL). Kept separate from the
// jsdom unit config (vitest.config.ts): node environment, no Vue plugin, and a
// serial run so created server-side data stays deterministic.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['e2e/**/*.live.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
})
