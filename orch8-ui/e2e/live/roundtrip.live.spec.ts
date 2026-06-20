import { afterAll, describe, expect, it } from 'vitest'
import { createSequence, getSequence } from '@/api/sequences'
import { validateSequence } from '@/components/canvas/treeOps'
import { SERVER_UP, tracker } from './server'
import * as fx from './fixtures'
import type { BlockDefinition } from '@/api/types/sequences'

/**
 * Canonical projection: sort keys and drop null/undefined so that server-added
 * default nulls (delay:null, retry:null, …) don't defeat a structural compare.
 * Array order is preserved — block ordering is semantically meaningful.
 */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const val = (v as Record<string, unknown>)[k]
      if (val === null || val === undefined) continue
      out[k] = canon(val)
    }
    return out
  }
  return v
}

const t = tracker()
afterAll(() => t.cleanup())

const cases: Array<{ name: string; blocks: BlockDefinition[] }> = [
  { name: 'linear chain', blocks: fx.linear() },
  { name: 'every block type', blocks: fx.everyType() },
  { name: 'deeply nested composites', blocks: fx.deeplyNested() },
  { name: 'a_b_split (regression for ab_split → a_b_split)', blocks: fx.abSplitOnly() },
  { name: 'massive 60-block DAG', blocks: fx.massive(60) },
]

describe.skipIf(!SERVER_UP)('live · save & export round-trip invariant', () => {
  for (const c of cases) {
    it(`create → re-fetch preserves structure: ${c.name}`, async () => {
      // The client-side Save gate must agree the tree is valid before we save it.
      expect(validateSequence(c.blocks).valid).toBe(true)

      const body = fx.seq(fx.uniqueName('rt'), c.blocks)
      const created = await createSequence(body)
      t.addId(created.id)
      expect(created.id).toBe(body.id)

      const fetched = await getSequence(created.id)
      // What the canvas would export must mirror what the server persisted.
      expect(canon(fetched.blocks)).toEqual(canon(c.blocks))
    })
  }
})
