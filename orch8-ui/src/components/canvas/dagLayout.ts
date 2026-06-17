/**
 * Deterministic top-down layered auto-layout for the DAG canvas.
 * No external layout library — pure arithmetic on depth/breadth.
 *
 * Algorithm:
 *  1. Traverse the block tree depth-first, assigning a (depth, index) pair.
 *  2. Leaf nodes at the same depth are spaced horizontally.
 *  3. Composite nodes (parallel/race/router/try_catch/loop/for_each/ab_split/
 *     cancellation_scope) expand their children into sub-columns.
 *  4. x = column * COL_WIDTH + horizontal_offset; y = depth * ROW_HEIGHT.
 *
 * DESIGN_REFERENCE §dag-sequences.md §4 DAG Edge / Ordering Semantics
 */
import type { BlockDefinition } from '@/api/types/sequences'
import type { NodePosition, LayoutResult } from '@/api/types/canvas'

const ROW_HEIGHT = 120  // px between rows
const COL_WIDTH = 200   // px between columns
const PADDING = 60      // px margin around the whole graph

interface PlacedNode {
  id: string
  depth: number
  col: number // fractional column within depth
  width: number // number of leaf columns this node occupies
}

function layoutBlocks(
  blocks: BlockDefinition[],
  startDepth: number,
  startCol: number,
): { placed: PlacedNode[]; totalWidth: number } {
  const placed: PlacedNode[] = []
  let col = startCol

  for (const block of blocks) {
    const children = getChildrenBlocks(block)
    if (children.length === 0) {
      // Leaf node: occupies 1 column
      placed.push({ id: block.id, depth: startDepth, col, width: 1 })
      col += 1
    } else {
      // Composite: lay out children at depth+1
      const childResult = layoutChildren(block, startDepth + 1, col)
      placed.push(
        { id: block.id, depth: startDepth, col: childResult.centerCol, width: childResult.totalWidth },
        ...childResult.placed,
      )
      col += Math.max(childResult.totalWidth, 1)
    }
  }

  return { placed, totalWidth: col - startCol }
}

function layoutChildren(
  block: BlockDefinition,
  depth: number,
  startCol: number,
): { placed: PlacedNode[]; totalWidth: number; centerCol: number } {
  const placed: PlacedNode[] = []
  let col = startCol

  const branchSets = getBranchSets(block)

  if (branchSets.length === 0) {
    // Simple body (loop, for_each, cancellation_scope) — sequential in one column
    const body = getBodyBlocks(block)
    if (body.length > 0) {
      const r = layoutBlocks(body, depth, col)
      return { placed: r.placed, totalWidth: r.totalWidth, centerCol: col + (r.totalWidth - 1) / 2 }
    }
    return { placed, totalWidth: 1, centerCol: col }
  }

  // Multi-branch: each branch gets its own column group
  const branchCols: number[] = []
  for (const branch of branchSets) {
    branchCols.push(col)
    const r = layoutBlocks(branch, depth, col)
    placed.push(...r.placed)
    col += Math.max(r.totalWidth, 1)
  }

  const totalWidth = col - startCol
  const centerCol = startCol + (totalWidth - 1) / 2
  return { placed, totalWidth, centerCol }
}

/** Returns arrays of blocks for each branch of a composite block. */
function getBranchSets(block: BlockDefinition): BlockDefinition[][] {
  switch (block.type) {
    case 'parallel':
    case 'race':
      return block.branches
    case 'router': {
      const sets: BlockDefinition[][] = block.routes.map((r) => r.blocks)
      if (block.default && block.default.length > 0) sets.push(block.default)
      return sets
    }
    case 'try_catch': {
      const sets: BlockDefinition[][] = [block.try_block]
      if (block.catch_block.length > 0) sets.push(block.catch_block)
      if (block.finally_block && block.finally_block.length > 0) sets.push(block.finally_block)
      return sets
    }
    case 'ab_split':
      return block.variants.map((v) => v.blocks)
    default:
      return []
  }
}

/** Returns the sequential body blocks of a composite block (for simple bodies). */
function getBodyBlocks(block: BlockDefinition): BlockDefinition[] {
  switch (block.type) {
    case 'loop':
      return block.body
    case 'for_each':
      return block.body
    case 'cancellation_scope':
      return block.blocks
    default:
      return []
  }
}

/** All child block arrays of a composite block (flattened to top-level arrays). */
function getChildrenBlocks(block: BlockDefinition): BlockDefinition[] {
  switch (block.type) {
    case 'parallel':
    case 'race':
      return block.branches.flat()
    case 'loop':
    case 'for_each':
      return block.type === 'loop' ? block.body : block.body
    case 'router': {
      const all = block.routes.flatMap((r) => r.blocks)
      if (block.default) all.push(...block.default)
      return all
    }
    case 'try_catch': {
      const all = [...block.try_block, ...block.catch_block]
      if (block.finally_block) all.push(...block.finally_block)
      return all
    }
    case 'ab_split':
      return block.variants.flatMap((v) => v.blocks)
    case 'cancellation_scope':
      return block.blocks
    default:
      return []
  }
}

/**
 * Compute node positions for a block tree.
 * Returns Vue Flow-compatible {id, x, y} positions plus canvas dimensions.
 */
export function computeLayout(blocks: BlockDefinition[]): LayoutResult {
  const { placed, totalWidth } = layoutBlocks(blocks, 0, 0)

  const positions: NodePosition[] = placed.map((p) => ({
    id: p.id,
    x: PADDING + p.col * COL_WIDTH,
    y: PADDING + p.depth * ROW_HEIGHT,
  }))

  const maxDepth = placed.reduce((m, p) => Math.max(m, p.depth), 0)
  const width = PADDING * 2 + totalWidth * COL_WIDTH
  const height = PADDING * 2 + (maxDepth + 1) * ROW_HEIGHT

  return { positions, width, height }
}

/**
 * Build the flat list of (sourceId, targetId, edgeType, label) tuples
 * for Vue Flow edges.
 *
 * DESIGN_REFERENCE §dag-sequences.md §4
 */
export interface EdgeSpec {
  id: string
  source: string
  target: string
  edgeType: 'sequential' | 'branch' | 'back'
  label?: string
  animated?: boolean
}

let edgeSeq = 0
function makeEdgeId() {
  return `e-${++edgeSeq}`
}

export function buildEdges(blocks: BlockDefinition[]): EdgeSpec[] {
  edgeSeq = 0
  return collectEdges(blocks)
}

function collectEdges(
  blocks: BlockDefinition[],
  _parentId?: string,
  afterId?: string,
): EdgeSpec[] {
  const edges: EdgeSpec[] = []

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const next = blocks[i + 1]

    // Sequential edge to next sibling
    if (next) {
      edges.push({
        id: makeEdgeId(),
        source: block.id,
        target: next.id,
        edgeType: 'sequential',
      })
    } else if (afterId) {
      // Last block in a branch: rejoin edge to the node after the composite
      edges.push({
        id: makeEdgeId(),
        source: block.id,
        target: afterId,
        edgeType: 'sequential',
      })
    }

    // Edges into children
    edges.push(...collectChildEdges(block))
  }

  return edges
}

function collectChildEdges(block: BlockDefinition): EdgeSpec[] {
  const edges: EdgeSpec[] = []

  switch (block.type) {
    case 'parallel':
    case 'race': {
      for (const branch of block.branches) {
        if (branch.length > 0) {
          edges.push({
            id: makeEdgeId(),
            source: block.id,
            target: branch[0].id,
            edgeType: 'branch',
            label: block.type === 'race' ? 'race' : undefined,
          })
          edges.push(...collectEdges(branch))
        }
      }
      break
    }

    case 'router': {
      block.routes.forEach((route, _idx) => {
        if (route.blocks.length > 0) {
          edges.push({
            id: makeEdgeId(),
            source: block.id,
            target: route.blocks[0].id,
            edgeType: 'branch',
            label: `if: ${route.condition.slice(0, 20)}`,
          })
          edges.push(...collectEdges(route.blocks))
        }
      })
      if (block.default && block.default.length > 0) {
        edges.push({
          id: makeEdgeId(),
          source: block.id,
          target: block.default[0].id,
          edgeType: 'branch',
          label: 'default',
        })
        edges.push(...collectEdges(block.default))
      }
      break
    }

    case 'try_catch': {
      if (block.try_block.length > 0) {
        edges.push({
          id: makeEdgeId(),
          source: block.id,
          target: block.try_block[0].id,
          edgeType: 'branch',
          label: 'try',
        })
        edges.push(...collectEdges(block.try_block))
      }
      if (block.catch_block.length > 0) {
        edges.push({
          id: makeEdgeId(),
          source: block.id,
          target: block.catch_block[0].id,
          edgeType: 'branch',
          label: 'catch',
        })
        edges.push(...collectEdges(block.catch_block))
      }
      if (block.finally_block && block.finally_block.length > 0) {
        edges.push({
          id: makeEdgeId(),
          source: block.id,
          target: block.finally_block[0].id,
          edgeType: 'branch',
          label: 'finally',
        })
        edges.push(...collectEdges(block.finally_block))
      }
      break
    }

    case 'loop': {
      if (block.body.length > 0) {
        edges.push({
          id: makeEdgeId(),
          source: block.id,
          target: block.body[0].id,
          edgeType: 'branch',
          label: 'body',
        })
        edges.push(...collectEdges(block.body))
        // Back-edge: last body block → loop node
        const last = block.body[block.body.length - 1]
        edges.push({
          id: makeEdgeId(),
          source: last.id,
          target: block.id,
          edgeType: 'back',
          label: 'repeat',
          animated: true,
        })
      }
      break
    }

    case 'for_each': {
      if (block.body.length > 0) {
        edges.push({
          id: makeEdgeId(),
          source: block.id,
          target: block.body[0].id,
          edgeType: 'branch',
          label: `each ${block.item_var}`,
        })
        edges.push(...collectEdges(block.body))
      }
      break
    }

    case 'ab_split': {
      for (const variant of block.variants) {
        if (variant.blocks.length > 0) {
          edges.push({
            id: makeEdgeId(),
            source: block.id,
            target: variant.blocks[0].id,
            edgeType: 'branch',
            label: `${variant.name} (${variant.weight})`,
          })
          edges.push(...collectEdges(variant.blocks))
        }
      }
      break
    }

    case 'cancellation_scope': {
      if (block.blocks.length > 0) {
        edges.push({
          id: makeEdgeId(),
          source: block.id,
          target: block.blocks[0].id,
          edgeType: 'branch',
        })
        edges.push(...collectEdges(block.blocks))
      }
      break
    }

    default:
      // step / sub_sequence: no children in block tree
      break
  }

  return edges
}

/**
 * Validate that adding an edge (source → target) would not create a cycle.
 * Uses DFS reachability: if target can reach source, adding source→target
 * would create a cycle.
 *
 * Returns true if the edge is safe (acyclic).
 */
export function isAcyclicEdge(
  existingEdges: Array<{ source: string; target: string }>,
  newSource: string,
  newTarget: string,
): boolean {
  // Build adjacency list
  const adj: Record<string, string[]> = {}
  for (const e of existingEdges) {
    if (!adj[e.source]) adj[e.source] = []
    adj[e.source].push(e.target)
  }

  // DFS from newTarget: can we reach newSource?
  const visited = new Set<string>()
  const stack = [newTarget]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node === newSource) return false // cycle detected
    if (visited.has(node)) continue
    visited.add(node)
    for (const neighbor of adj[node] ?? []) {
      stack.push(neighbor)
    }
  }
  return true
}
