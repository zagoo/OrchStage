/**
 * Block-adjacency + entry-point policy for the structure-first DAG editor.
 *
 * Siblings in a block list run in order, forming predecessor → successor edges.
 * This module is the SINGLE SOURCE OF TRUTH for workflow-shape rules. It backs:
 *   - the strict UPSTREAM + FIRST-BLOCK checks when a block's type is changed
 *     (FlowCanvasView.panelChangeType), and
 *   - the strict GLOBAL gate run on Save (validateWorkflow over the whole tree).
 *
 * POLICY (defaults — edit `canFollow` / `FANOUT_TYPES` / `FANOUT_FOLLOW_EXCEPTIONS`
 * / `FIRST_BLOCK_TYPE` to change it):
 *
 *  1. ENTRY POINT — the workflow's very first (root-level) block must be a `step`.
 *     A concrete action, not a control-flow construct, starts the workflow.
 *
 *  2. FAN-OUT ADJACENCY — a "fan-out" block (parallel | race | router | a_b_split)
 *     may not be immediately followed by another fan-out block (chaining two branch
 *     points with no convergence yields an ambiguous DAG), with these practical
 *     enterprise-DAG EXCEPTIONS:
 *       - router → parallel : branch conditionally, then run tasks concurrently
 *       - router → router   : chained multi-tier conditional routing
 *       - try_catch is NOT a fan-out at all — it's an error BOUNDARY, so a branching
 *         block may sit on either side of it (recovery pipelines).
 *       - a `sub_sequence` may follow ANY block — it's an opaque call into another
 *         workflow, so it never breaks adjacency.
 *
 * DESIGN_REFERENCE §dag-sequences.md §4 DAG Edge / Ordering Semantics
 */
import type { BlockType, BlockDefinition } from '@/api/types/sequences'
import { getContainers } from './treeOps'

/**
 * Branch / fan-out block types — they split control flow into multiple paths.
 * NOTE: `try_catch` is deliberately EXCLUDED. It is an error boundary, not a fan-out,
 * so a branching block may immediately precede or follow it.
 */
export const FANOUT_TYPES = new Set<BlockType>(['parallel', 'race', 'router', 'a_b_split'])

export const isFanout = (t: BlockType): boolean => FANOUT_TYPES.has(t)

/**
 * Allowed exceptions to "no fan-out immediately after a fan-out", keyed
 * `${upstream}>${candidate}`. Common enterprise DAG patterns.
 */
export const FANOUT_FOLLOW_EXCEPTIONS = new Set<string>(['router>parallel', 'router>router'])

/** The workflow entry point must be this type. */
export const FIRST_BLOCK_TYPE: BlockType = 'step'

/**
 * May `candidate` run immediately AFTER `upstream` as the next sibling?
 * Pure and side-effect free so every enforcement point shares identical semantics.
 */
export function canFollow(upstream: BlockType, candidate: BlockType): boolean {
  // A sub_sequence may follow ANY block — it's an opaque call into another workflow.
  if (candidate === 'sub_sequence') return true
  // Two consecutive fan-outs need a convergence step, except the allowed exceptions.
  if (isFanout(upstream) && isFanout(candidate)) {
    return FANOUT_FOLLOW_EXCEPTIONS.has(`${upstream}>${candidate}`)
  }
  return true
}

/** The root-level first block must be a `step` (empty sequences are not flagged here). */
export function isValidFirstBlock(blocks: BlockDefinition[]): boolean {
  return blocks.length === 0 || blocks[0].type === FIRST_BLOCK_TYPE
}

export interface AdjacencyViolation {
  upstreamId: string
  upstreamType: BlockType
  downstreamId: string
  downstreamType: BlockType
}

/**
 * Walk EVERY sibling list in the tree (root + all containers, recursively) and
 * collect adjacent (predecessor, successor) pairs that violate `canFollow`.
 */
export function validateAdjacency(blocks: BlockDefinition[]): AdjacencyViolation[] {
  const out: AdjacencyViolation[] = []
  const walk = (list: BlockDefinition[]) => {
    for (let i = 0; i < list.length; i++) {
      const cur = list[i]
      const next = list[i + 1]
      if (next && !canFollow(cur.type, next.type)) {
        out.push({
          upstreamId: cur.id,
          upstreamType: cur.type,
          downstreamId: next.id,
          downstreamType: next.type,
        })
      }
      for (const c of getContainers(cur)) walk(c.blocks)
    }
  }
  walk(blocks)
  return out
}

/** Every workflow-policy violation for the global Save gate (entry-point + adjacency). */
export type WorkflowViolation =
  | { kind: 'first-block'; blockId: string; blockType: BlockType }
  | ({ kind: 'adjacency' } & AdjacencyViolation)

/**
 * Comprehensive end-to-end workflow check for the Save gate: the entry-point rule
 * (first block must be a step) followed by every adjacency violation in the DAG.
 */
export function validateWorkflow(blocks: BlockDefinition[]): WorkflowViolation[] {
  const out: WorkflowViolation[] = []
  if (blocks.length > 0 && blocks[0].type !== FIRST_BLOCK_TYPE) {
    out.push({ kind: 'first-block', blockId: blocks[0].id, blockType: blocks[0].type })
  }
  for (const a of validateAdjacency(blocks)) out.push({ kind: 'adjacency', ...a })
  return out
}
