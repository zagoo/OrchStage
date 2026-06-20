/**
 * Pure, immutable tree operations for the structure-first DAG editor.
 *
 * The Orch8 sequence is a NESTED, typed block tree (not a free edge graph).
 * Every mutation here returns a NEW `blocks[]`; the canvas re-derives nodes +
 * edges from the result (single source of truth — see FlowCanvasView.rebuildGraph).
 *
 * The per-block-type "container map" (which fields hold child lists) is defined
 * once in `getContainers` / `mapContainers` and mirrors dagLayout's accessors:
 *   parallel|race      → branches[]            (array of branch lists)
 *   loop|for_each      → body
 *   router             → routes[].blocks (+ default)
 *   try_catch          → try_block / catch_block / finally_block
 *   a_b_split           → variants[].blocks
 *   cancellation_scope → blocks
 *   step|sub_sequence  → (leaf, no children)
 *
 * DESIGN_REFERENCE §dag-sequences.md §3 (block taxonomy), §4 (edge semantics)
 */
import type { BlockDefinition, StepBlock } from '@/api/types/sequences'
import { buildEdges } from './dagLayout'

// ---------------------------------------------------------------------------
// Container model
// ---------------------------------------------------------------------------

/** A single editable child-list slot on a composite block. */
export interface Container {
  /** Stable slot key, unique within the block (e.g. `branch:0`, `try`, `body`). */
  key: string
  /** Human label for menus. */
  label: string
  blocks: BlockDefinition[]
}

/** A reference to a container anywhere in the tree (used as a move target). */
export interface ContainerRef {
  /** Owning block id, or null for the sequence root list. */
  parentId: string | null
  /** Container slot key, or null for the root list. */
  key: string | null
  /** Human path label for the move menu. */
  label: string
}

/** Enumerate the editable child-lists of a block. Leaf blocks return `[]`. */
export function getContainers(block: BlockDefinition): Container[] {
  switch (block.type) {
    case 'parallel':
    case 'race':
      return block.branches.map((b, i) => ({ key: `branch:${i}`, label: `Branch ${i + 1}`, blocks: b }))
    case 'loop':
    case 'for_each':
      return [{ key: 'body', label: 'Body', blocks: block.body }]
    case 'router': {
      const cs: Container[] = block.routes.map((r, i) => ({
        key: `route:${i}`,
        label: `Route ${i + 1}`,
        blocks: r.blocks,
      }))
      if (block.default) cs.push({ key: 'default', label: 'Default', blocks: block.default })
      return cs
    }
    case 'try_catch': {
      const cs: Container[] = [
        { key: 'try', label: 'Try', blocks: block.try_block },
        { key: 'catch', label: 'Catch', blocks: block.catch_block },
      ]
      if (block.finally_block) cs.push({ key: 'finally', label: 'Finally', blocks: block.finally_block })
      return cs
    }
    case 'a_b_split':
      return block.variants.map((v, i) => ({
        key: `variant:${i}`,
        label: v.name || `Variant ${i + 1}`,
        blocks: v.blocks,
      }))
    case 'cancellation_scope':
      return [{ key: 'scope', label: 'Scope', blocks: block.blocks }]
    default:
      return []
  }
}

/**
 * Immutably rebuild a block, replacing every child list via `fn(key, list)`.
 * This is the single write-side counterpart to `getContainers`.
 */
export function mapContainers(
  block: BlockDefinition,
  fn: (key: string, list: BlockDefinition[]) => BlockDefinition[],
): BlockDefinition {
  switch (block.type) {
    case 'parallel':
    case 'race':
      return { ...block, branches: block.branches.map((b, i) => fn(`branch:${i}`, b)) }
    case 'loop':
    case 'for_each':
      return { ...block, body: fn('body', block.body) }
    case 'router':
      return {
        ...block,
        routes: block.routes.map((r, i) => ({ ...r, blocks: fn(`route:${i}`, r.blocks) })),
        ...(block.default ? { default: fn('default', block.default) } : {}),
      }
    case 'try_catch':
      return {
        ...block,
        try_block: fn('try', block.try_block),
        catch_block: fn('catch', block.catch_block),
        ...(block.finally_block ? { finally_block: fn('finally', block.finally_block) } : {}),
      }
    case 'a_b_split':
      return { ...block, variants: block.variants.map((v, i) => ({ ...v, blocks: fn(`variant:${i}`, v.blocks) })) }
    case 'cancellation_scope':
      return { ...block, blocks: fn('scope', block.blocks) }
    default:
      return block
  }
}

/**
 * Recurse children-first, then apply `fn` to EVERY block list in the tree
 * (root + all containers). The building block for the mutators below.
 */
export function mapAllLists(
  blocks: BlockDefinition[],
  fn: (list: BlockDefinition[]) => BlockDefinition[],
): BlockDefinition[] {
  const recursed = blocks.map((b) => mapContainers(b, (_key, child) => mapAllLists(child, fn)))
  return fn(recursed)
}

// ---------------------------------------------------------------------------
// Traversal / queries
// ---------------------------------------------------------------------------

/** Depth-first lookup of a block by id. */
export function findBlock(blocks: BlockDefinition[], id: string): BlockDefinition | null {
  for (const b of blocks) {
    if (b.id === id) return b
    for (const c of getContainers(b)) {
      const found = findBlock(c.blocks, id)
      if (found) return found
    }
  }
  return null
}

export interface ParentRef {
  parentId: string | null
  key: string | null
  index: number
  siblings: BlockDefinition[]
}

/** Find the immediate container (parent list) holding `id`, plus its index. */
export function findParent(blocks: BlockDefinition[], id: string): ParentRef | null {
  const rootIdx = blocks.findIndex((b) => b.id === id)
  if (rootIdx !== -1) return { parentId: null, key: null, index: rootIdx, siblings: blocks }

  for (const b of blocks) {
    for (const c of getContainers(b)) {
      const idx = c.blocks.findIndex((x) => x.id === id)
      if (idx !== -1) return { parentId: b.id, key: c.key, index: idx, siblings: c.blocks }
      const deeper = findParent(c.blocks, id)
      if (deeper) return deeper
    }
  }
  return null
}

/** All block ids in the tree (depth-first). */
export function collectIds(blocks: BlockDefinition[]): string[] {
  const ids: string[] = []
  const walk = (list: BlockDefinition[]) => {
    for (const b of list) {
      ids.push(b.id)
      for (const c of getContainers(b)) walk(c.blocks)
    }
  }
  walk(blocks)
  return ids
}

/** Ids of all descendants of a block (excluding the block itself). */
export function descendantIds(block: BlockDefinition): string[] {
  const ids: string[] = []
  for (const c of getContainers(block)) ids.push(...collectIds(c.blocks))
  return ids
}

/** Every container in the tree, plus the root, as move targets. */
export function listContainers(blocks: BlockDefinition[]): ContainerRef[] {
  const out: ContainerRef[] = [{ parentId: null, key: null, label: 'Root' }]
  const walk = (list: BlockDefinition[]) => {
    for (const b of list) {
      for (const c of getContainers(b)) {
        out.push({ parentId: b.id, key: c.key, label: `${b.id} › ${c.label}` })
        walk(c.blocks)
      }
    }
  }
  walk(blocks)
  return out
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/** Create a fresh, valid step block. `id` must be unique (see genBlockId). */
export function makeStep(id: string, handler = 'log'): StepBlock {
  return { type: 'step', id, handler, params: {}, cancellable: false }
}

/** Generate a tree-unique block id with the given prefix. Deterministic. */
export function genBlockId(blocks: BlockDefinition[], prefix = 'step'): string {
  const existing = new Set(collectIds(blocks))
  let n = 1
  let id = `${prefix}_${n}`
  while (existing.has(id)) {
    n++
    id = `${prefix}_${n}`
  }
  return id
}

// ---------------------------------------------------------------------------
// Mutators (all pure / immutable — return a new blocks[])
// ---------------------------------------------------------------------------

/** Insert `newBlock` immediately after `afterId`; `afterId === null` appends to root. */
export function insertAfter(
  blocks: BlockDefinition[],
  afterId: string | null,
  newBlock: BlockDefinition,
): BlockDefinition[] {
  if (afterId === null) return [...blocks, newBlock]
  return mapAllLists(blocks, (list) => {
    const i = list.findIndex((b) => b.id === afterId)
    if (i === -1) return list
    return [...list.slice(0, i + 1), newBlock, ...list.slice(i + 1)]
  })
}

/** Convenience: insert a new step after `afterId` (or at root end). */
export function insertStep(
  blocks: BlockDefinition[],
  afterId: string | null,
  handler = 'log',
): BlockDefinition[] {
  return insertAfter(blocks, afterId, makeStep(genBlockId(blocks, 'step'), handler))
}

/** Remove a block (and its subtree) from wherever it lives. */
export function deleteBlock(blocks: BlockDefinition[], id: string): BlockDefinition[] {
  return mapAllLists(blocks, (list) => list.filter((b) => b.id !== id))
}

/** Run `fn` on the block matching `id` (identity elsewhere). */
export function updateBlockById(
  blocks: BlockDefinition[],
  id: string,
  fn: (block: BlockDefinition) => BlockDefinition,
): BlockDefinition[] {
  return mapAllLists(blocks, (list) => list.map((b) => (b.id === id ? fn(b) : b)))
}

/**
 * Shallow-merge a config patch into a block. `type` and `id` are immutable and
 * are stripped from the patch so the discriminant can never be corrupted.
 */
export function updateBlockConfig(
  blocks: BlockDefinition[],
  id: string,
  patch: Record<string, unknown>,
): BlockDefinition[] {
  const safe: Record<string, unknown> = { ...patch }
  delete safe.type
  delete safe.id
  // Boundary cast: the panel builds a per-type field patch; discriminant kept intact.
  return updateBlockById(blocks, id, (b) => ({ ...b, ...safe }) as BlockDefinition)
}

/** Swap a block with its previous/next sibling in the same list. No-op at edges. */
export function reorderSibling(
  blocks: BlockDefinition[],
  id: string,
  dir: 'up' | 'down',
): BlockDefinition[] {
  return mapAllLists(blocks, (list) => {
    const i = list.findIndex((b) => b.id === id)
    if (i === -1) return list
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= list.length) return list
    const copy = [...list]
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
    return copy
  })
}

/** A destination container + index for a move. */
export interface MoveTarget {
  parentId: string | null
  key: string | null
  index: number
}

/**
 * Move a block into `target` at `target.index`. Index is relative to the
 * destination list AFTER the source has been removed. Refuses to move a block
 * into itself or its own descendants (which would orphan the subtree).
 */
export function moveBlock(blocks: BlockDefinition[], id: string, target: MoveTarget): BlockDefinition[] {
  const moving = findBlock(blocks, id)
  if (!moving) return blocks
  if (target.parentId === id) return blocks
  if (target.parentId && descendantIds(moving).includes(target.parentId)) return blocks

  const without = deleteBlock(blocks, id)
  const clamp = (i: number, len: number) => Math.max(0, Math.min(i, len))

  if (target.parentId === null) {
    const i = clamp(target.index, without.length)
    return [...without.slice(0, i), moving, ...without.slice(i)]
  }
  return updateBlockById(without, target.parentId, (parent) =>
    mapContainers(parent, (key, list) => {
      if (key !== target.key) return list
      const i = clamp(target.index, list.length)
      return [...list.slice(0, i), moving, ...list.slice(i)]
    }),
  )
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  /** blockId → first error message. */
  blockErrors: Record<string, string>
  /** sequence-level errors (not tied to one block). */
  errors: string[]
  valid: boolean
}

function requiredFieldError(b: BlockDefinition): string | null {
  switch (b.type) {
    case 'step':
      return b.handler && b.handler.trim() ? null : 'Step requires a handler.'
    case 'sub_sequence':
      return b.sequence_name && b.sequence_name.trim() ? null : 'Sub-sequence requires a sequence_name.'
    case 'parallel':
    case 'race':
      return b.branches.length > 0 ? null : `${b.type} requires at least one branch.`
    case 'router':
      return b.routes.length > 0 ? null : 'Router requires at least one route.'
    case 'try_catch':
      return b.try_block.length > 0 ? null : 'Try/catch requires a non-empty try block.'
    case 'loop':
      // Mirror backend hard constraints: condition required AND non-empty body
      // (server: "loop body must not be empty").
      if (!b.condition || !b.condition.trim()) return 'Loop requires a condition.'
      return b.body.length > 0 ? null : 'Loop body must not be empty.'
    case 'for_each':
      if (!b.collection || !b.collection.trim() || !b.item_var || !b.item_var.trim())
        return 'For-each requires a collection and an item variable.'
      return b.body.length > 0 ? null : 'For-each body must not be empty.'
    case 'a_b_split':
      // Server rejects a single-variant split ("must have at least 2 variants").
      return b.variants.length >= 2 ? null : 'A/B split requires at least 2 variants.'
    case 'cancellation_scope':
      return b.blocks.length > 0 ? null : 'Cancellation scope requires at least one block.'
    default:
      return null
  }
}

/** Directed-graph cycle detection (3-colour DFS). */
function hasCycle(edges: Array<{ source: string; target: string }>): boolean {
  const adj: Record<string, string[]> = {}
  const nodes = new Set<string>()
  for (const e of edges) {
    ;(adj[e.source] ??= []).push(e.target)
    nodes.add(e.source)
    nodes.add(e.target)
  }
  const color: Record<string, 0 | 1 | 2> = {}
  for (const n of nodes) color[n] = 0
  const dfs = (u: string): boolean => {
    color[u] = 1
    for (const v of adj[u] ?? []) {
      if (color[v] === 1) return true
      if (color[v] === 0 && dfs(v)) return true
    }
    color[u] = 2
    return false
  }
  for (const n of nodes) {
    if (color[n] === 0 && dfs(n)) return true
  }
  return false
}

/**
 * Validate a block tree: unique ids, required fields per type, and an
 * acyclicity invariant over derived forward edges (loop "repeat" back-edges
 * are excluded — they are legitimate, not validation failures).
 */
export function validateSequence(blocks: BlockDefinition[]): ValidationResult {
  const blockErrors: Record<string, string> = {}
  const errors: string[] = []

  // 1) unique ids
  const counts = new Map<string, number>()
  for (const id of collectIds(blocks)) counts.set(id, (counts.get(id) ?? 0) + 1)
  let hasDuplicates = false
  for (const [id, count] of counts) {
    if (count > 1) {
      blockErrors[id] = `Duplicate block id "${id}" (${count} occurrences).`
      hasDuplicates = true
    }
  }
  if (counts.size === 0) errors.push('Sequence has no blocks.')

  // 2) required fields per block type
  const checkList = (list: BlockDefinition[]) => {
    for (const b of list) {
      const err = requiredFieldError(b)
      if (err && !blockErrors[b.id]) blockErrors[b.id] = err
      for (const c of getContainers(b)) checkList(c.blocks)
    }
  }
  checkList(blocks)

  // 3) acyclic invariant (forward edges only). Loop "repeat" back-edges are
  //    excluded as legitimate — EVERY loop emits exactly one, at any nesting
  //    depth, so deeply-nested loops (retry-in-catch-in-loop, etc.) never
  //    false-positive. Skipped when ids are non-unique, since a duplicated id
  //    makes the flattened edge graph degenerate (a spurious "cycle" that is
  //    really the duplicate-id error in disguise — already reported above).
  if (!hasDuplicates) {
    const forward = buildEdges(blocks).filter((e) => e.edgeType !== 'back')
    if (hasCycle(forward)) errors.push('The graph is not acyclic (excluding loop repeat-edges).')
  }

  return { blockErrors, errors, valid: Object.keys(blockErrors).length === 0 && errors.length === 0 }
}
