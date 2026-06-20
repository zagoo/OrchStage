import { expect, test } from '@playwright/test'
import { seedConnection } from './seed'

test.beforeEach(async ({ page }) => {
  await seedConnection(page)
})

// Regression for the Priority casing bug: the server enum is PascalCase
// (Low/Normal/High/Critical); lowercase is rejected with HTTP 422. The modal
// must offer exactly the server-accepted values.
test('Create Instance modal uses server-accepted PascalCase priorities', async ({ page }) => {
  await page.goto('/instances')
  await page.getByRole('button', { name: 'New instance' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const priority = dialog.locator('select')
  await expect(priority).toHaveValue('Normal')

  const values = await priority
    .locator('option')
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value))
  expect(values).toEqual(['Low', 'Normal', 'High', 'Critical'])
})
