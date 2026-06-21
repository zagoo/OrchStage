/**
 * Block-adjacency + entry-point policy tests.
 *
 * Policy: the root-level first block must be a `step`; a fan-out (parallel | race |
 * router | a_b_split) may not be immediately followed by another fan-out, EXCEPT
 * router→parallel and router→router; `try_catch` is never a fan-out; and a
 * `sub_sequence` may follow anything.
 */
import { describe, it, expect } from 'vitest'
import {
  canFollow,
  isFanout,
  isValidFirstBlock,
  validateAdjacency,
  validateWorkflow,
  FANOUT_TYPES,
} from './blockRules'
import type { BlockDefinition, BlockType } from '@/api/types/sequences'

const step = (id: string): BlockDefinition => ({ type: 'step', id, handler: 'log', params: {}, cancellable: false })
const router = (id: string, blocks: BlockDefinition[] = []): BlockDefinition => ({
  type: 'router',
  id,
  routes: [{ condition: 'c', blocks }],
})
const parallel = (id: string): BlockDefinition => ({ type: 'parallel', id, branches: [[]] })
const race = (id: string): BlockDefinition => ({ type: 'race', id, branches: [[]], semantics: 'first_to_resolve' })
const abSplit = (id: string): BlockDefinition => ({
  type: 'a_b_split',
  id,
  variants: [
    { name: 'A', weight: 50, blocks: [] },
    { name: 'B', weight: 50, blocks: [] },
  ],
})
const tryCatch = (id: string): BlockDefinition => ({ type: 'try_catch', id, try_block: [], catch_block: [] })
const subSeq = (id: string): BlockDefinition => ({ type: 'sub_sequence', id, sequence_name: 's' })

describe('canFollow — fan-out base rule', () => {
  it('allows linear ↔ anything', () => {
    expect(canFollow('step', 'router')).toBe(true)
    expect(canFollow('router', 'step')).toBe(true)
    expect(canFollow('loop', 'parallel')).toBe(true)
    expect(canFollow('step', 'step')).toBe(true)
  })

  it('still blocks non-relaxed fan-out → fan-out pairs', () => {
    expect(canFollow('parallel', 'parallel')).toBe(false)
    expect(canFollow('parallel', 'router')).toBe(false)
    expect(canFollow('race', 'router')).toBe(false)
    expect(canFollow('a_b_split', 'a_b_split')).toBe(false)
    expect(canFollow('router', 'race')).toBe(false) // router relaxations don't cover race
    expect(canFollow('router', 'a_b_split')).toBe(false) // ...nor a_b_split
  })
})

describe('canFollow — relaxations', () => {
  it('allows router → parallel (branch, then run concurrently)', () => {
    expect(canFollow('router', 'parallel')).toBe(true)
  })

  it('allows router → router (chained multi-tier routing)', () => {
    expect(canFollow('router', 'router')).toBe(true)
  })

  it('excludes try_catch from the fan-out restriction (boundary, not a branch)', () => {
    expect(isFanout('try_catch')).toBe(false)
    expect(canFollow('try_catch', 'parallel')).toBe(true)
    expect(canFollow('try_catch', 'router')).toBe(true)
    expect(canFollow('parallel', 'try_catch')).toBe(true)
    expect(canFollow('router', 'try_catch')).toBe(true)
  })

  it('allows ANY block to be immediately followed by a sub_sequence', () => {
    const upstreams: BlockType[] = [...FANOUT_TYPES, 'step', 'loop', 'try_catch']
    for (const t of upstreams) {
      expect(canFollow(t, 'sub_sequence'), `${t} → sub_sequence`).toBe(true)
    }
  })

  it('FANOUT_TYPES is exactly the four branch types', () => {
    expect([...FANOUT_TYPES].sort()).toEqual(['a_b_split', 'parallel', 'race', 'router'])
  })
})

describe('isValidFirstBlock', () => {
  it('requires the first block to be a step', () => {
    expect(isValidFirstBlock([step('a'), router('r')])).toBe(true)
    expect(isValidFirstBlock([router('r'), step('a')])).toBe(false)
    expect(isValidFirstBlock([parallel('p')])).toBe(false)
    expect(isValidFirstBlock([])).toBe(true) // empty handled by structural validation
  })
})

describe('validateAdjacency', () => {
  it('returns no violations for a compatible sequence (incl. relaxations)', () => {
    expect(validateAdjacency([step('a'), router('r'), parallel('p')])).toEqual([]) // router→parallel ok
    expect(validateAdjacency([step('a'), router('r1'), router('r2')])).toEqual([]) // router→router ok
  })

  it('flags non-relaxed adjacent fan-outs at the root', () => {
    const v = validateAdjacency([parallel('p'), abSplit('ab')])
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ upstreamId: 'p', downstreamId: 'ab' })
  })

  it('flags non-relaxed adjacent fan-outs nested inside a container', () => {
    const v = validateAdjacency([router('outer', [race('r1'), router('r2')])]) // race→router blocked
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ upstreamId: 'r1', downstreamId: 'r2' })
  })

  it('does not flag a try_catch sitting between two fan-outs (boundary exclusion)', () => {
    // parallel → try_catch → router: try_catch is not a fan-out, so neither pair trips
    expect(validateAdjacency([parallel('p'), tryCatch('t'), router('r')])).toEqual([])
  })
})

describe('validateWorkflow (Save gate — entry-point + adjacency)', () => {
  it('passes a valid workflow', () => {
    expect(validateWorkflow([step('a'), router('r'), parallel('p'), subSeq('s')])).toEqual([])
  })

  it('flags a non-step first block', () => {
    const v = validateWorkflow([router('r'), step('a')])
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ kind: 'first-block', blockId: 'r', blockType: 'router' })
  })

  it('reports the entry-point violation first, then adjacency violations', () => {
    const v = validateWorkflow([router('r'), parallel('p'), race('rc')]) // first=router, parallel→race blocked
    expect(v).toHaveLength(2)
    expect(v[0].kind).toBe('first-block')
    expect(v[1]).toMatchObject({ kind: 'adjacency', upstreamId: 'p', downstreamId: 'rc' })
  })

  it('a convergence step between two fan-outs clears the adjacency violation', () => {
    expect(validateWorkflow([step('a'), parallel('p'), step('mid'), abSplit('ab')])).toEqual([])
  })
})
