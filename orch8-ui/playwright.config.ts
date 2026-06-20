import { defineConfig, devices } from '@playwright/test'

/**
 * Browser E2E for the Orch8 console.
 *
 * Drives a real Chromium against the Vite dev server, whose proxy forwards
 * /api, /health, /info to the live orch8-server (default 127.0.0.1:8080, set via
 * ORCH8_API_URL) — same-origin, exactly like production behind a reverse proxy.
 *
 * Prerequisite: a running orch8-server. Run with `npm run test:e2e:browser`.
 */
export default defineConfig({
  testDir: './e2e/browser',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
