/**
 * Exhaustive unit tests for the structure-first tree mutators.
 * Covers every composite block type, nesting, and the tree→edge consistency
 * invariant (derived edges never reference a missing block after any mutation).
 */
import { describe, it, expect } from 'vitest'
import type {
  BlockDefinition,
  StepBlock,
  ParallelBlock,
  RaceBlock,
  LoopBlock,
  ForEachBlock,
  RouterBlock,
  TryCatchBlock,
  ABSplitBlock,
  CancellationScopeBlock,
  SubSequenceBlock,
} from '@/api/types/sequences'
import {
  getContainers,
  mapContainers,
  findBlock,
  findParent,
  collectIds,
  descendantIds,
  listContainers,
  genBlockId,
  insertAfter,
  insertStep,
  deleteBlock,
  updateBlockConfig,
  reorderSibling,
  moveBlock,
  validateSequence,
} from './treeOps'
import { buildEdges } from './dagLayout'

// --- fixture factories -------------------------------------------------------
const step = (id: string, handler = 'log'): StepBlock => ({ type: 'step', id, handler, params: {}, cancellable: false })
const parallel = (id: string, ...branches: BlockDefinition[][]): ParallelBlock => ({ type: 'parallel', id, branches })
const race = (id: string, ...branches: BlockDefinition[][]): RaceBlock => ({ type: 'race', id, branches, semantics: 'first_to_succeed' })
const loop = (id: string, body: BlockDefinition[]): LoopBlock => ({ type: 'loop', id, condition: 'x < 3', body, max_iterations: 5, continue_on_error: false })
const forEach = (id: string, body: BlockDefinition[]): ForEachBlock => ({ type: 'for_each', id, collection: 'items', item_var: 'it', body, max_iterations: 100 })
const router = (id: string, routes: { condition: string; blocks: BlockDefinition[] }[], def?: BlockDefinition[]): RouterBlock => ({ type: 'router', id, routes, ...(def ? { default: def } : {}) })
const tryCatch = (id: string, t: BlockDefinition[], c: BlockDefinition[], f?: BlockDefinition[]): TryCatchBlock => ({ type: 'try_catch', id, try_block: t, catch_block: c, ...(f ? { finally_block: f } : {}) })
const abSplit = (id: string, variants: { name: string; weight: number; blocks: BlockDefinition[] }[]): ABSplitBlock => ({ type: 'ab_split', id, variants })
const cancelScope = (id: string, blocks: BlockDefinition[]): CancellationScopeBlock => ({ type: 'cancellation_scope', id, blocks })
const subSeq = (id: string, name = 'sub'): SubSequenceBlock => ({ type: 'sub_sequence', id, sequence_name: name })

/** A tree exercising every composite type, each holding leaf steps. */
function fullTree(): BlockDefinition[] {
  return [
    step('a'),
    parallel('par', [step('p0a'), step('p0b')], [step('p1a')]),
    race('rc', [step('r0')], [step('r1')]),
    loop('lp', [step('l0')]),
    forEach('fe', [step('f0')]),
    router('rt', [{ condition: 'c1', blocks: [step('rt0')] }], [step('rtd')]),
    tryCatch('tc', [step('t0')], [step('c0')], [step('fin0')]),
    abSplit('ab', [{ name: 'A', weight: 50, blocks: [step('ab0')] }, { name: 'B', weight: 50, blocks: [step('ab1')] }]),
    cancelScope('cs', [step('cs0')]),
    subSeq('sub'),
  ]
}

/** Invariant: every derived edge references only ids present in the tree. */
function edgesAreConsistent(blocks: BlockDefinition[]): boolean {
  const ids = new Set(collectIds(blocks))
  return buildEdges(blocks).every((e) => ids.has(e.source) && ids.has(e.target))
}

// --- container model ---------------------------------------------------------
describe('getContainers', () => {
  it('returns no containers for leaves', () => {
    expect(getContainers(step('s'))).toEqual([])
    expect(getContainers(subSeq('s'))).toEqual([])
  })
  it('maps each composite to its child lists', () => {
    expect(getContainers(parallel('p', [step('x')], [step('y')])).map((c) => c.key)).toEqual(['branch:0', 'branch:1'])
    expect(getContainers(loop('l', [step('x')])).map((c) => c.key)).toEqual(['body'])
    expect(getContainers(router('r', [{ condition: 'c', blocks: [] }], [step('d')])).map((c) => c.key)).toEqual(['route:0', 'default'])
    expect(getContainers(tryCatch('t', [], [], [step('f')])).map((c) => c.key)).toEqual(['try', 'catch', 'finally'])
    expect(getContainers(abSplit('a', [{ name: 'A', weight: 1, blocks: [] }])).map((c) => c.key)).toEqual(['variant:0'])
    expect(getContainers(cancelScope('c', [step('x')])).map((c) => c.key)).toEqual(['scope'])
  })
})

describe('mapContainers', () => {
  it('rebuilds composites immutably (does not mutate input)', () => {
    const p = parallel('p', [step('x')], [step('y')])
    const out = mapContainers(p, (_k, list) => [...list, step('added')])
    expect(out).not.toBe(p)
    expect(p.branches[0]).toHaveLength(1) // original untouched
    expect((out as ParallelBlock).branches[0]).toHaveLength(2)
    expect((out as ParallelBlock).branches[1]).toHaveLength(2)
  })
  it('is identity for leaves', () => {
    const s = step('s')
    expect(mapContainers(s, (_k, l) => l)).toBe(s)
  })
})

// --- traversal ---------------------------------------------------------------
describe('findBlock / findParent / collectIds', () => {
  const tree = fullTree()
  it('finds blocks at root and nested in every container', () => {
    expect(findBlock(tree, 'a')?.id).toBe('a')
    expect(findBlock(tree, 'p1a')?.id).toBe('p1a') // parallel branch 1
    expect(findBlock(tree, 'fin0')?.id).toBe('fin0') // finally block
    expect(findBlock(tree, 'ab1')?.id).toBe('ab1') // ab variant 1
    expect(findBlock(tree, 'nope')).toBeNull()
  })
  it('reports the parent container + index', () => {
    expect(findParent(tree, 'a')).toMatchObject({ parentId: null, key: null, index: 0 })
    expect(findParent(tree, 'p1a')).toMatchObject({ parentId: 'par', key: 'branch:1', index: 0 })
    expect(findParent(tree, 'rtd')).toMatchObject({ parentId: 'rt', key: 'default', index: 0 })
    expect(findParent(tree, 'missing')).toBeNull()
  })
  it('collects all ids and descendants', () => {
    expect(collectIds(tree)).toContain('cs0')
    expect(collectIds(tree)).toHaveLength(25)
    expect(descendantIds(findBlock(tree, 'par')!)).toEqual(['p0a', 'p0b', 'p1a'])
    expect(descendantIds(step('leaf'))).toEqual([])
  })
  it('lists every container as a move target plus root', () => {
    const refs = listContainers(tree)
    expect(refs[0]).toEqual({ parentId: null, key: null, label: 'Root' })
    expect(refs.some((r) => r.parentId === 'tc' && r.key === 'catch')).toBe(true)
  })
})

// --- genBlockId / makeStep ---------------------------------------------------
describe('genBlockId', () => {
  it('produces a tree-unique id', () => {
    const tree = [step('step_1'), step('step_2')]
    expect(genBlockId(tree, 'step')).toBe('step_3')
    expect(genBlockId([], 'node')).toBe('node_1')
  })
})

// --- insertAfter / insertStep ------------------------------------------------
describe('insertAfter / insertStep', () => {
  it('appends to root when afterId is null', () => {
    const out = insertAfter([step('a')], null, step('b'))
    expect(out.map((b) => b.id)).toEqual(['a', 'b'])
  })
  it('inserts after a root sibling', () => {
    const out = insertAfter([step('a'), step('c')], 'a', step('b'))
    expect(out.map((b) => b.id)).toEqual(['a', 'b', 'c'])
  })
  it('inserts after a deeply nested block in its own container', () => {
    const tree = fullTree()
    const out = insertStep(tree, 't0') // inside try_catch.try_block
    const tc = findBlock(out, 'tc') as TryCatchBlock
    expect(tc.try_block.map((b) => b.id)).toEqual(['t0', 'step_1'])
    expect(edgesAreConsistent(out)).toBe(true)
  })
  it('is a no-op for an unknown afterId', () => {
    const tree = [step('a')]
    expect(insertAfter(tree, 'zzz', step('b')).map((b) => b.id)).toEqual(['a'])
  })
})

// --- deleteBlock -------------------------------------------------------------
describe('deleteBlock', () => {
  it('removes a root block', () => {
    expect(deleteBlock([step('a'), step('b')], 'a').map((b) => b.id)).toEqual(['b'])
  })
  it('removes a nested block from its container', () => {
    const out = deleteBlock(fullTree(), 'p0a')
    expect((findBlock(out, 'par') as ParallelBlock).branches[0].map((b) => b.id)).toEqual(['p0b'])
    expect(findBlock(out, 'p0a')).toBeNull()
  })
  it('removes a composite and its whole subtree', () => {
    const out = deleteBlock(fullTree(), 'par')
    expect(findBlock(out, 'par')).toBeNull()
    expect(findBlock(out, 'p0a')).toBeNull()
    expect(findBlock(out, 'p1a')).toBeNull()
    expect(edgesAreConsistent(out)).toBe(true)
  })
})

// --- updateBlockConfig -------------------------------------------------------
describe('updateBlockConfig', () => {
  it('merges a patch into a nested block', () => {
    const out = updateBlockConfig(fullTree(), 't0', { handler: 'http', timeout: 5000 })
    expect(findBlock(out, 't0')).toMatchObject({ handler: 'http', timeout: 5000 })
  })
  it('never lets a patch change type or id', () => {
    const out = updateBlockConfig([step('a')], 'a', { type: 'parallel', id: 'hacked', handler: 'x' })
    const b = findBlock(out, 'a')!
    expect(b.type).toBe('step')
    expect(b.id).toBe('a')
    expect((b as StepBlock).handler).toBe('x')
  })
})

// --- reorderSibling ----------------------------------------------------------
describe('reorderSibling', () => {
  it('moves a root block up and down', () => {
    expect(reorderSibling([step('a'), step('b'), step('c')], 'b', 'up').map((b) => b.id)).toEqual(['b', 'a', 'c'])
    expect(reorderSibling([step('a'), step('b'), step('c')], 'b', 'down').map((b) => b.id)).toEqual(['a', 'c', 'b'])
  })
  it('reorders within a nested container', () => {
    const tree = [parallel('p', [step('x'), step('y')])]
    const out = reorderSibling(tree, 'y', 'up')
    expect((out[0] as ParallelBlock).branches[0].map((b) => b.id)).toEqual(['y', 'x'])
  })
  it('is a no-op at the edges', () => {
    expect(reorderSibling([step('a'), step('b')], 'a', 'up').map((b) => b.id)).toEqual(['a', 'b'])
    expect(reorderSibling([step('a'), step('b')], 'b', 'down').map((b) => b.id)).toEqual(['a', 'b'])
  })
})

// --- moveBlock ---------------------------------------------------------------
describe('moveBlock', () => {
  it('moves a root block into a nested container', () => {
    const tree = [step('a'), parallel('p', [step('x')])]
    const out = moveBlock(tree, 'a', { parentId: 'p', key: 'branch:0', index: 1 })
    expect(out.map((b) => b.id)).toEqual(['p'])
    expect((findBlock(out, 'p') as ParallelBlock).branches[0].map((b) => b.id)).toEqual(['x', 'a'])
  })
  it('moves a nested block back to root at an index', () => {
    const tree = [step('a'), parallel('p', [step('x')])]
    const out = moveBlock(tree, 'x', { parentId: null, key: null, index: 0 })
    expect(out.map((b) => b.id)).toEqual(['x', 'a', 'p'])
    expect((findBlock(out, 'p') as ParallelBlock).branches[0]).toEqual([])
  })
  it('refuses to move a block into its own descendant', () => {
    const tree = [parallel('p', [step('x')])]
    const out = moveBlock(tree, 'p', { parentId: 'x', key: 'branch:0', index: 0 })
    expect(out).toBe(tree) // unchanged
  })
  it('refuses to move a block into itself', () => {
    const tree = [cancelScope('cs', [step('x')])]
    expect(moveBlock(tree, 'cs', { parentId: 'cs', key: 'scope', index: 0 })).toBe(tree)
  })
  it('clamps an out-of-range index', () => {
    const tree = [step('a'), step('b')]
    const out = moveBlock(tree, 'a', { parentId: null, key: null, index: 99 })
    expect(out.map((b) => b.id)).toEqual(['b', 'a'])
  })
  it('keeps derived edges consistent after a cross-container move', () => {
    const out = moveBlock(fullTree(), 'a', { parentId: 'tc', key: 'finally', index: 0 })
    expect(edgesAreConsistent(out)).toBe(true)
    expect(findParent(out, 'a')).toMatchObject({ parentId: 'tc', key: 'finally' })
  })
})

// --- tree → edge round-trip invariant ---------------------------------------
describe('tree → edge consistency invariant', () => {
  it('holds for the full tree and after every kind of mutation', () => {
    const base = fullTree()
    expect(edgesAreConsistent(base)).toBe(true)
    expect(edgesAreConsistent(insertStep(base, 'a'))).toBe(true)
    expect(edgesAreConsistent(deleteBlock(base, 'rt'))).toBe(true)
    expect(edgesAreConsistent(reorderSibling(base, 'a', 'down'))).toBe(true)
    expect(edgesAreConsistent(updateBlockConfig(base, 'a', { handler: 'x' }))).toBe(true)
    expect(edgesAreConsistent(moveBlock(base, 'sub', { parentId: 'lp', key: 'body', index: 0 }))).toBe(true)
  })
})

// --- validateSequence --------------------------------------------------------
describe('validateSequence', () => {
  it('passes a well-formed tree', () => {
    const res = validateSequence(fullTree())
    expect(res.valid).toBe(true)
    expect(res.errors).toEqual([])
    expect(Object.keys(res.blockErrors)).toEqual([])
  })
  it('flags an empty sequence', () => {
    const res = validateSequence([])
    expect(res.valid).toBe(false)
    expect(res.errors).toContain('Sequence has no blocks.')
  })
  it('flags duplicate ids', () => {
    const res = validateSequence([step('dup'), step('dup')])
    expect(res.valid).toBe(false)
    expect(res.blockErrors['dup']).toMatch(/Duplicate/)
  })
  it('flags missing required fields per type', () => {
    const noHandler: StepBlock = { type: 'step', id: 's', handler: '', cancellable: false }
    expect(validateSequence([noHandler]).blockErrors['s']).toMatch(/handler/)
    expect(validateSequence([router('r', [])]).blockErrors['r']).toMatch(/route/)
    expect(validateSequence([forEach('fe', [step('x')])]).valid).toBe(true)
    const badForEach: ForEachBlock = { type: 'for_each', id: 'fe', collection: '', item_var: '', body: [step('x')], max_iterations: 1 }
    expect(validateSequence([badForEach]).blockErrors['fe']).toMatch(/collection/)
  })
  it('does not report loop back-edges as cycles', () => {
    const res = validateSequence([loop('lp', [step('l0')])])
    expect(res.errors).toEqual([])
    expect(res.valid).toBe(true)
  })
  it('does not false-positive on deeply nested loops + try/catch', () => {
    // loop → try { step } catch { loop → for_each → step } finally { step }
    const tree: BlockDefinition[] = [
      loop('outer', [
        tryCatch('tc', [step('t0')], [loop('inner', [forEach('fe', [step('f0')])])], [step('fin')]),
      ]),
    ]
    const res = validateSequence(tree)
    expect(res.valid).toBe(true)
    expect(res.errors).toEqual([])
  })
  it('emits exactly one excluded back-edge per loop at every nesting depth', () => {
    const tree: BlockDefinition[] = [loop('l1', [loop('l2', [loop('l3', [step('s')])])])]
    const backEdges = buildEdges(tree).filter((e) => e.edgeType === 'back')
    expect(backEdges).toHaveLength(3)
    expect(validateSequence(tree).valid).toBe(true)
  })
  it('reports only the duplicate-id error (no spurious cycle) on duplicate ids', () => {
    const res = validateSequence([step('dup'), parallel('p', [step('dup')])])
    expect(res.blockErrors['dup']).toMatch(/Duplicate/)
    expect(res.errors).not.toContain('The graph is not acyclic (excluding loop repeat-edges).')
  })
  it('does not false-positive on retry-in-catch-in-loop (mixed nesting around back-edges)', () => {
    // outer loop → try(step,step) + catch(retry loop) + finally(step), plus a
    // for_each(parallel) sibling: two legitimate loops, two excluded back-edges.
    const tree: BlockDefinition[] = [
      loop('outer', [
        tryCatch('tc', [step('try0'), step('try1')], [loop('retry', [step('attempt')])], [step('cleanup')]),
        forEach('fan', [parallel('par', [step('p0')], [step('p1')])]),
      ]),
    ]
    const back = buildEdges(tree).filter((e) => e.edgeType === 'back')
    expect(back).toHaveLength(2) // outer loop + retry loop only
    const res = validateSequence(tree)
    expect(res.valid).toBe(true)
    expect(res.errors).toEqual([])
    expect(edgesAreConsistent(tree)).toBe(true)
  })
})
