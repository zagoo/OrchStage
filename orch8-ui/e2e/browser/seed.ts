import type { Page } from '@playwright/test'

/**
 * Pre-seed the persisted connection (insecure dev mode, tenant `acme`, blank
 * baseUrl = same origin) so a spec skips the Connect screen. Runs before every
 * navigation in the page's context.
 */
export async function seedConnection(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'orch8.connection.v1',
      JSON.stringify({ baseUrl: '', apiKey: '', tenantId: 'acme', insecure: true }),
    )
  })
}
