/**
 * Request / response types for the Instance Detail (advanced) domain.
 * Covers: fork, inject-blocks, checkpoints, timeline, outputs, artifacts, audit, stream.
 * Rust → TypeScript mapping follows auth-rbac.md §9.
 * DESIGN_REFERENCE §Instances — instances-advanced.md
 */
import type { Uuid, IsoTimestamp, Json } from '@/api/types/common'
import type { InstanceState, ExecutionContext, InjectedSignal } from '@/api/types/instances'

// --- Fork --------------------------------------------------------------------

export interface ForkRequest {
  from_block_id: string
  context?: Json | null
  dry_run?: boolean
  signals?: InjectedSignal[]
}

export interface ForkResponse {
  id: Uuid
  forked_from: Uuid
  state: 'scheduled'
  copied_blocks: number
  rerun_blocks: string[]
  dry_run: boolean
}

// --- Inject Blocks -----------------------------------------------------------

export interface InjectBlocksRequest {
  blocks: Json[]
  position?: number | null
}

export interface InjectBlocksResponse {
  injected_block_ids: string[]
  position: number | null
  total_injected: number
}

// --- Checkpoints -------------------------------------------------------------

export interface Checkpoint {
  id: Uuid
  instance_id: Uuid
  checkpoint_data: Json
  created_at: IsoTimestamp
}

export interface SaveCheckpointRequest {
  checkpoint_data: Json
}

export interface SaveCheckpointResponse {
  id: Uuid
}

export interface PruneCheckpointsRequest {
  keep: number
}

export interface PruneCheckpointsResponse {
  count: number
}

// --- Timeline ----------------------------------------------------------------

export interface TimelineQuery {
  offset?: number
  limit?: number
  include_outputs?: boolean
}

export interface TimelineInstance {
  id: Uuid
  sequence_id: Uuid
  state: InstanceState
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
  context?: ExecutionContext
}

export interface TimelineEntry {
  block_id: string
  attempt: number
  completed_at: IsoTimestamp
  output?: Json
  output_ref?: string
  is_sentinel: boolean
}

export interface TimelineStateTransition {
  from_state?: string
  to_state?: string
  at: IsoTimestamp
}

export interface TimelineResponse {
  instance: TimelineInstance
  state_transitions: TimelineStateTransition[]
  entries: TimelineEntry[]
  offset: number
  limit: number
  has_more: boolean
}

// --- Outputs -----------------------------------------------------------------

export interface BlockOutput {
  id: Uuid
  instance_id: Uuid
  block_id: string
  output: Json
  output_ref: string | null
  output_size: number
  attempt: number
  created_at: IsoTimestamp
}

// --- Artifacts ---------------------------------------------------------------

export interface ArtifactMeta {
  key: string
  size: number
  uri: string
}

export interface ListArtifactsResponse {
  items: ArtifactMeta[]
}

// --- Step Logs ---------------------------------------------------------------

export interface StepLog {
  block_id: string
  ts: IsoTimestamp
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error'
  message: string
}

// --- Audit Log ---------------------------------------------------------------

export interface AuditLogEntry {
  id: Uuid
  instance_id: Uuid
  tenant_id: string
  event_type: string
  from_state?: string
  to_state?: string
  block_id?: string
  details: Json
  created_at: IsoTimestamp
}

// --- SSE Stream --------------------------------------------------------------

export type InstanceStreamEventType = 'state' | 'output' | 'llm_delta' | 'done' | 'error'

export interface StreamStateEvent {
  instance_id: string
  state: InstanceState
}

export interface StreamDoneEvent {
  state: InstanceState
}

export interface StreamErrorEvent {
  error: string
}
