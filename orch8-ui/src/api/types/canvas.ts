/**
 * Canvas domain types — shapes used exclusively by the interactive DAG canvas.
 * Reuses SequenceDefinition / BlockDefinition from sequences.ts and
 * ExecutionNode / NodeState from instances.ts.
 *
 * DESIGN_REFERENCE §dag-sequences.md, §instances-core.md
 */
import type { Uuid, IsoTimestamp } from './common'
import type { SequenceDefinition, BlockDefinition, BlockType } from './sequences'
import type { ExecutionNode, NodeState } from './instances'

export type { SequenceDefinition, BlockDefinition, BlockType, ExecutionNode, NodeState }

// --- canvas-specific picker types -------------------------------------------

/** Lightweight list item for the sequence picker (name + version only). */
export interface SequencePickerItem {
  id: Uuid
  name: string
  namespace: string
  version: number
  status: string
  deprecated: boolean
}

/** Lightweight instance item for the live-state overlay picker. */
export interface InstancePickerItem {
  id: Uuid
  sequence_id: Uuid
  state: string
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

// --- Vue Flow node/edge data -------------------------------------------------

/** Data payload attached to each Vue Flow node representing one block. */
export interface CanvasNodeData {
  block: BlockDefinition
  /** live state from the overlaid instance, if any */
  nodeState?: NodeState
  /** execution node from live tree */
  execNode?: ExecutionNode
  /** depth in the layout computation */
  depth: number
  /** horizontal index within depth for layout */
  indexInDepth: number
}

/** Data payload attached to each Vue Flow edge. */
export interface CanvasEdgeData {
  edgeType: 'sequential' | 'branch' | 'back'
  label?: string
}

// --- in-memory editable model -----------------------------------------------

/**
 * Mutable copy of a loaded sequence used by the canvas editor.
 * POST /sequences creates a new version from this model.
 */
export interface EditableSequence {
  /** Copy of the original definition; mutated by canvas operations. */
  definition: SequenceDefinition
  /** Whether the model has been changed relative to the loaded server version. */
  dirty: boolean
  /** Validation errors keyed by block id. */
  blockErrors: Record<string, string>
}

// --- layout -----------------------------------------------------------------

/** Position computed by the deterministic auto-layout algorithm. */
export interface NodePosition {
  id: string
  x: number
  y: number
}

/** Result of running auto-layout on a block tree. */
export interface LayoutResult {
  positions: NodePosition[]
  /** Total canvas width (px) needed */
  width: number
  /** Total canvas height (px) needed */
  height: number
}
