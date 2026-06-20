/**
 * Unit tests for the DAG layout and edge-building algorithms.
 * Pure functions; no HTTP calls; no DOM.
 *
 * Business intent:
 * - computeLayout: every block in the tree must have a unique position assigned.
 * - buildEdges: sequential, branch, and back edges must be created correctly.
 * - isAcyclicEdge: must detect cycles and allow safe additions.
 *
 * DESIGN_REFERENCE §dag-sequences.md §4 DAG Edge / Ordering Semantics
 */
import { describe, it, expect } from 'vitest'
import { computeLayout, buildEdges, isAcyclicEdge } from './dagLayout'
import type { BlockDefinition } from '@/api/types/sequences'

// --- helpers -----------------------------------------------------------------

function step(id: string): BlockDefinition {
  return { type: 'step', id, handler: 'log', cancellable: true }
}

// --- computeLayout -----------------------------------------------------------

describe('computeLayout — linear chain', () => {
  const blocks: BlockDefinition[] = [step('a'), step('b'), step('c')]

  it('assigns a position to every block', () => {
    const { positions } = computeLayout(blocks)
    const ids = positions.map((p) => p.id)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).toContain('c')
  })

  it('places sequential leaf blocks at the same depth (same y), different columns (different x)', () => {
    // The layout algorithm places siblings at same depth (y), spread across columns (x).
    // Depth (y) only increases for children of composite blocks.
    const { positions } = computeLayout(blocks)
    const pa = positions.find((p) => p.id === 'a')!
    const pb = positions.find((p) => p.id === 'b')!
    const pc = positions.find((p) => p.id === 'c')!
    // All at same depth
    expect(pa.y).toBe(pb.y)
    expect(pb.y).toBe(pc.y)
    // Spread horizontally
    expect(pb.x).toBeGreaterThan(pa.x)
    expect(pc.x).toBeGreaterThan(pb.x)
  })
})

describe('computeLayout — parallel block', () => {
  const blocks: BlockDefinition[] = [
    {
      type: 'parallel',
      id: 'par1',
      branches: [[step('b1')], [step('b2')]],
    },
    step('after'),
  ]

  it('places parallel node and all branch children', () => {
    const { positions } = computeLayout(blocks)
    const ids = positions.map((p) => p.id)
    expect(ids).toContain('par1')
    expect(ids).toContain('b1')
    expect(ids).toContain('b2')
    expect(ids).toContain('after')
  })

  it('branch children are deeper than the parallel node', () => {
    const { positions } = computeLayout(blocks)
    const yPar = positions.find((p) => p.id === 'par1')!.y
    const yB1 = positions.find((p) => p.id === 'b1')!.y
    const yB2 = positions.find((p) => p.id === 'b2')!.y
    expect(yB1).toBeGreaterThan(yPar)
    expect(yB2).toBeGreaterThan(yPar)
  })

  it('branch siblings are at the same depth', () => {
    const { positions } = computeLayout(blocks)
    const yB1 = positions.find((p) => p.id === 'b1')!.y
    const yB2 = positions.find((p) => p.id === 'b2')!.y
    expect(yB1).toBe(yB2)
  })
})

describe('computeLayout — loop block', () => {
  const blocks: BlockDefinition[] = [
    {
      type: 'loop',
      id: 'loop1',
      condition: 'ctx.count < 10',
      body: [step('tick')],
      max_iterations: 100,
      continue_on_error: false,
    },
  ]

  it('places loop node and its body block', () => {
    const { positions } = computeLayout(blocks)
    const ids = positions.map((p) => p.id)
    expect(ids).toContain('loop1')
    expect(ids).toContain('tick')
  })
})

describe('computeLayout — empty blocks', () => {
  it('returns empty positions for empty blocks array', () => {
    const { positions } = computeLayout([])
    expect(positions).toEqual([])
  })
})

// --- buildEdges --------------------------------------------------------------

describe('buildEdges — linear chain', () => {
  const blocks: BlockDefinition[] = [step('a'), step('b'), step('c')]
  const edges = buildEdges(blocks)

  it('creates sequential edges between adjacent blocks', () => {
    const sources = edges.map((e) => e.source)
    const targets = edges.map((e) => e.target)
    expect(sources).toContain('a')
    expect(targets).toContain('b')
    expect(sources).toContain('b')
    expect(targets).toContain('c')
  })

  it('marks them as sequential type', () => {
    const types = edges.map((e) => e.edgeType)
    expect(types.every((t) => t === 'sequential')).toBe(true)
  })
})

describe('buildEdges — parallel fan-out', () => {
  const blocks: BlockDefinition[] = [
    {
      type: 'parallel',
      id: 'par1',
      branches: [[step('b1'), step('b2')], [step('c1')]],
    },
  ]
  const edges = buildEdges(blocks)

  it('creates branch edges from parallel to first block of each branch', () => {
    const branchEdges = edges.filter((e) => e.source === 'par1')
    expect(branchEdges).toHaveLength(2)
    const targets = branchEdges.map((e) => e.target)
    expect(targets).toContain('b1')
    expect(targets).toContain('c1')
  })

  it('marks fan-out edges as branch type', () => {
    const fanOutEdges = edges.filter((e) => e.source === 'par1')
    expect(fanOutEdges.every((e) => e.edgeType === 'branch')).toBe(true)
  })

  it('creates sequential edges within each branch', () => {
    const seqEdge = edges.find((e) => e.source === 'b1' && e.target === 'b2')
    expect(seqEdge).toBeDefined()
    expect(seqEdge?.edgeType).toBe('sequential')
  })
})

describe('buildEdges — loop back-edge', () => {
  const blocks: BlockDefinition[] = [
    {
      type: 'loop',
      id: 'loop1',
      condition: 'true',
      body: [step('tick'), step('tock')],
      max_iterations: 100,
      continue_on_error: false,
    },
  ]
  const edges = buildEdges(blocks)

  it('creates a back-edge from last body block to the loop node', () => {
    const backEdge = edges.find((e) => e.edgeType === 'back')
    expect(backEdge).toBeDefined()
    expect(backEdge?.source).toBe('tock')
    expect(backEdge?.target).toBe('loop1')
    expect(backEdge?.animated).toBe(true)
  })

  it('creates body entry edge from loop to first body block', () => {
    const entryEdge = edges.find((e) => e.source === 'loop1' && e.target === 'tick')
    expect(entryEdge).toBeDefined()
    expect(entryEdge?.edgeType).toBe('branch')
    expect(entryEdge?.label).toBe('body')
  })
})

describe('buildEdges — router conditional fan-out', () => {
  const blocks: BlockDefinition[] = [
    {
      type: 'router',
      id: 'router1',
      routes: [
        { condition: 'ctx.ok', blocks: [step('path_ok')] },
        { condition: 'ctx.fail', blocks: [step('path_fail')] },
      ],
      default: [step('path_default')],
    },
  ]
  const edges = buildEdges(blocks)

  it('creates branch edges for each route', () => {
    const routerEdges = edges.filter((e) => e.source === 'router1')
    expect(routerEdges).toHaveLength(3) // 2 routes + 1 default
  })

  it('labels the default branch', () => {
    const defaultEdge = edges.find((e) => e.source === 'router1' && e.label === 'default')
    expect(defaultEdge).toBeDefined()
    expect(defaultEdge?.target).toBe('path_default')
  })

  it('tags route + default edges with editable owner metadata (edge-click → editor)', () => {
    const routeEdges = edges.filter((e) => e.source === 'router1' && e.label?.startsWith('if:'))
    expect(routeEdges).toHaveLength(2)
    expect(routeEdges[0].editable).toEqual({ ownerId: 'router1', routeIndex: 0 })
    expect(routeEdges[1].editable).toEqual({ ownerId: 'router1', routeIndex: 1 })
    const defaultEdge = edges.find((e) => e.source === 'router1' && e.label === 'default')
    expect(defaultEdge?.editable).toEqual({ ownerId: 'router1' })
  })
})

describe('buildEdges — try_catch arms', () => {
  const blocks: BlockDefinition[] = [
    {
      type: 'try_catch',
      id: 'tc1',
      try_block: [step('try_step')],
      catch_block: [step('catch_step')],
      finally_block: [step('finally_step')],
    },
  ]
  const edges = buildEdges(blocks)

  it('creates try, catch, finally branch edges from try_catch node', () => {
    const tcEdges = edges.filter((e) => e.source === 'tc1')
    const labels = tcEdges.map((e) => e.label)
    expect(labels).toContain('try')
    expect(labels).toContain('catch')
    expect(labels).toContain('finally')
  })
})

describe('buildEdges — a_b_split', () => {
  const blocks: BlockDefinition[] = [
    {
      type: 'a_b_split',
      id: 'ab1',
      variants: [
        { name: 'control', weight: 70, blocks: [step('ctrl_step')] },
        { name: 'variant_a', weight: 30, blocks: [step('var_step')] },
      ],
    },
  ]
  const edges = buildEdges(blocks)

  it('creates branch edges for each variant', () => {
    const variantEdges = edges.filter((e) => e.source === 'ab1')
    expect(variantEdges).toHaveLength(2)
  })

  it('labels edges with variant name and weight', () => {
    const ctrlEdge = edges.find((e) => e.source === 'ab1' && e.label?.startsWith('control'))
    expect(ctrlEdge).toBeDefined()
    expect(ctrlEdge?.label).toContain('70')
  })
})

// --- isAcyclicEdge -----------------------------------------------------------

describe('isAcyclicEdge', () => {
  it('allows a safe edge in an acyclic graph', () => {
    const existing = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ]
    // Adding c → d is safe
    expect(isAcyclicEdge(existing, 'c', 'd')).toBe(true)
  })

  it('detects a direct cycle (a → b, b → a)', () => {
    const existing = [{ source: 'a', target: 'b' }]
    // Adding b → a would make a cycle
    expect(isAcyclicEdge(existing, 'b', 'a')).toBe(false)
  })

  it('detects a transitive cycle (a → b → c, adding c → a)', () => {
    const existing = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ]
    // c → a would create a → b → c → a cycle
    expect(isAcyclicEdge(existing, 'c', 'a')).toBe(false)
  })

  it('allows a self-loop check correctly (a → a is a cycle)', () => {
    // Self-loop: source === target → target can reach source trivially at start
    expect(isAcyclicEdge([], 'a', 'a')).toBe(false)
  })

  it('handles empty graph — any non-self edge is safe', () => {
    expect(isAcyclicEdge([], 'x', 'y')).toBe(true)
  })

  it('handles disconnected nodes safely', () => {
    const existing = [
      { source: 'a', target: 'b' },
      { source: 'c', target: 'd' }, // separate component
    ]
    // Adding b → c connects the components but is not a cycle
    expect(isAcyclicEdge(existing, 'b', 'c')).toBe(true)
  })
})
