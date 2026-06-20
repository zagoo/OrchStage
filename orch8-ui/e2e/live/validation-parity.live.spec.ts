import { afterAll, describe, expect, it } from 'vitest'
import { validateSequence } from '@/components/canvas/treeOps'
import { SERVER_UP, rawPost, tracker } from './server'
import * as fx from './fixtures'
import type { BlockDefinition } from '@/api/types/sequences'

const t = tracker()
afterAll(() => t.cleanup())

// Trees the UI must reject locally (Save button disabled, blockErrors surfaced).
const uiInvalid: Array<{ name: string; blocks: BlockDefinition[] }> = [
  { name: 'duplicate block ids', blocks: fx.dupIds() },
  { name: 'empty step handler', blocks: fx.emptyHandler() },
  { name: 'empty sequence (no blocks)', blocks: fx.emptyTree() },
  { name: 'a_b_split with zero variants', blocks: fx.emptyVariants() },
  { name: 'a_b_split with one variant', blocks: fx.oneVariant() },
  { name: 'loop with empty body', blocks: fx.loopEmptyBody() },
  { name: 'for_each with empty body', blocks: fx.forEachEmptyBody() },
  { name: 'try_catch with empty try', blocks: fx.tryEmpty() },
  { name: 'cancellation_scope with no blocks', blocks: fx.cancelScopeEmpty() },
]

// Subset whose violation the SERVER also rejects with HTTP 400 — bidirectional
// parity: the local gate and the backend agree on what is illegal.
const serverRejects: Array<{ name: string; blocks: BlockDefinition[] }> = [
  { name: 'duplicate block ids', blocks: fx.dupIds() },
  { name: 'a_b_split with one variant', blocks: fx.oneVariant() },
  { name: 'loop with empty body', blocks: fx.loopEmptyBody() },
  { name: 'for_each with empty body', blocks: fx.forEachEmptyBody() },
  { name: 'try_catch with empty try', blocks: fx.tryEmpty() },
  { name: 'cancellation_scope with no blocks', blocks: fx.cancelScopeEmpty() },
]

describe.skipIf(!SERVER_UP)('live · validation gate mirrors the backend', () => {
  for (const c of uiInvalid) {
    it(`Save gate blocks: ${c.name}`, () => {
      expect(validateSequence(c.blocks).valid).toBe(false)
    })
  }

  for (const c of serverRejects) {
    it(`server also rejects (parity): ${c.name}`, async () => {
      // Local gate says invalid …
      expect(validateSequence(c.blocks).valid).toBe(false)
      // … and so does the server (HTTP 400 invalid argument).
      const body = fx.seq(fx.uniqueName('inv'), c.blocks)
      await expect(rawPost('/api/v1/sequences', body)).rejects.toMatchObject({ status: 400 })
    })
  }

  it('discriminator regression: server rejects `ab_split`, accepts `a_b_split`', async () => {
    const variants = [
      { name: 'A', weight: 50, blocks: [{ type: 'step', id: 'va', handler: 'noop' }] },
      { name: 'B', weight: 50, blocks: [{ type: 'step', id: 'vb', handler: 'noop' }] },
    ]
    const mk = (type: string): unknown => ({
      id: crypto.randomUUID(),
      tenant_id: 'acme',
      namespace: 'default',
      name: fx.uniqueName(`disc-${type}`),
      version: 1,
      deprecated: false,
      status: 'draft',
      created_at: new Date().toISOString(),
      blocks: [{ type, id: 'split', variants }],
    })

    // The pre-fix UI value: server has no such variant.
    await expect(rawPost('/api/v1/sequences', mk('ab_split'))).rejects.toMatchObject({ status: 422 })
    // The corrected value: accepted.
    const ok = (await rawPost('/api/v1/sequences', mk('a_b_split'))) as { id: string }
    expect(ok.id).toBeTruthy()
    t.addId(ok.id)
  })
})
