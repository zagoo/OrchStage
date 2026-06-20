import { expect, test } from '@playwright/test'
import { seedConnection } from './seed'

test.beforeEach(async ({ page }) => {
  await seedConnection(page)
})

test('renders live sequences fetched from the server', async ({ page }) => {
  await page.goto('/sequences')
  // The seed sequence served by the live backend must appear in the list.
  await expect(page.getByText('welcome-campaign').first()).toBeVisible({ timeout: 10_000 })
})
