import { expect, test } from '@playwright/test'

// The real connect journey — and a live proof of the same-origin proxy wiring:
// the browser only ever talks to :5173, which proxies /health + /api to the
// orch8-server, so there is no CORS and the server port is never exposed.
test('connects to the live server through the same-origin proxy', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Connect to Orch8' })).toBeVisible()

  await page.getByRole('checkbox').check() // insecure dev mode — no API key needed
  await page.getByPlaceholder('acme').fill('acme')
  await page.getByRole('button', { name: 'Test & Connect' }).click()

  // Topbar connection chip (distinct from the transient success toast).
  await expect(page.getByRole('link', { name: /Connected/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dashboard' }).first()).toBeVisible()
})
