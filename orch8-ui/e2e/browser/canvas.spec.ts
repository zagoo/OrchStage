import { expect, test } from '@playwright/test'
import { seedConnection } from './seed'

test.beforeEach(async ({ page }) => {
  await seedConnection(page)
})

// The structure-first editor: load a live sequence, confirm the derived graph
// renders, and that a structural mutation flips the dirty flag (Save gate).
test('loads a sequence and add-step mutates the derived graph', async ({ page }) => {
  await page.goto('/canvas')
  await page.locator('select').selectOption({ label: 'default/welcome-campaign (v1)' })

  const nodes = page.locator('.vue-flow__node')
  await expect(nodes).toHaveCount(5)

  // Regression guard: the canvas container must have real height. A 0-height
  // flex-collapse keeps the nodes in the DOM but clips them to invisibility —
  // "nothing renders" — so assert the box has height AND a node is visible.
  const box = await page.locator('.vue-flow').boundingBox()
  expect(box?.height ?? 0).toBeGreaterThan(200)
  await expect(nodes.first()).toBeVisible()

  // Clean tree → Save disabled.
  await expect(page.getByRole('button', { name: 'Save version' })).toBeDisabled()

  await page.getByRole('button', { name: 'Add step' }).click()
  await expect(nodes).toHaveCount(6)

  // Dirty tree → Save enabled.
  await expect(page.getByRole('button', { name: 'Save version' })).toBeEnabled()
})
