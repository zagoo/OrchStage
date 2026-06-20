/**
 * Sequences domain types — Rust → TypeScript mapping.
 * Source: engine/orch8-types/src/sequence.rs, engine/orch8-api/src/sequences.rs
 * DESIGN_REFERENCE §Sequences (dag-sequences.md)
 */
import type { IsoTimestamp, Json, Uuid } from './common'

// --- enums -------------------------------------------------------------------

export type SequenceStatus = 'draft' | 'staging' | 'production' | 'unpublished'

export type BlockType =
  | 'step'
  | 'parallel'
  | 'race'
  | 'loop'
  | 'for_each'
  | 'router'
  | 'try_catch'
  | 'sub_sequence'
  | 'a_b_split'
  | 'cancellation_scope'

export type RaceSemantics = 'first_to_resolve' | 'first_to_succeed'

// --- per-block option types --------------------------------------------------

export interface RetryPolicy {
  max_attempts: number
  initial_backoff: number
  max_backoff: number
  backoff_multiplier: number
}

export interface DelaySpec {
  duration: number
  business_days_only: boolean
  jitter?: number
  holidays: string[]
  fire_at_local?: string
  timezone?: string
}

export interface SendWindow {
  start_hour: number
  end_hour: number
  days: number[]
}

export type FieldAccess = boolean | 'all' | 'none' | { fields: string[] }

export interface ContextAccess {
  data: FieldAccess
  config: boolean
  audit: boolean
  runtime: boolean
}

export interface HumanChoice {
  label: string
  value: string
}

export interface HumanInputDef {
  prompt: string
  timeout?: number
  escalation_handler?: string
  choices?: HumanChoice[]
  store_as?: string
  allow_comment: boolean
}

export interface EscalationDef {
  handler: string
  params: Json
}

export interface SlaPolicy {
  max_runtime?: number
  max_step_runtime?: number
}

// --- block definitions (discriminated union) --------------------------------

export interface StepBlock {
  type: 'step'
  id: string
  handler: string
  params?: Json
  delay?: DelaySpec
  retry?: RetryPolicy
  timeout?: number
  rate_limit_key?: string
  send_window?: SendWindow
  context_access?: ContextAccess
  cancellable: boolean
  wait_for_input?: HumanInputDef
  queue_name?: string
  deadline?: number
  on_deadline_breach?: EscalationDef
  fallback_handler?: string
  cache_key?: string
}

export interface ParallelBlock {
  type: 'parallel'
  id: string
  branches: BlockDefinition[][]
}

export interface RaceBlock {
  type: 'race'
  id: string
  branches: BlockDefinition[][]
  semantics: RaceSemantics
}

export interface LoopBlock {
  type: 'loop'
  id: string
  condition: string
  body: BlockDefinition[]
  max_iterations: number
  break_on?: string
  continue_on_error: boolean
  poll_interval?: number
  retain_iterations?: number
}

export interface ForEachBlock {
  type: 'for_each'
  id: string
  collection: string
  item_var: string
  body: BlockDefinition[]
  max_iterations: number
  retain_iterations?: number
}

export interface Route {
  condition: string
  blocks: BlockDefinition[]
}

export interface RouterBlock {
  type: 'router'
  id: string
  routes: Route[]
  default?: BlockDefinition[]
}

export interface TryCatchBlock {
  type: 'try_catch'
  id: string
  try_block: BlockDefinition[]
  catch_block: BlockDefinition[]
  finally_block?: BlockDefinition[]
}

export interface SubSequenceBlock {
  type: 'sub_sequence'
  id: string
  sequence_name: string
  version?: number
  input?: Json
}

export interface ABVariant {
  name: string
  weight: number
  blocks: BlockDefinition[]
}

export interface ABSplitBlock {
  type: 'a_b_split'
  id: string
  variants: ABVariant[]
}

export interface CancellationScopeBlock {
  type: 'cancellation_scope'
  id: string
  blocks: BlockDefinition[]
}

export type BlockDefinition =
  | StepBlock
  | ParallelBlock
  | RaceBlock
  | LoopBlock
  | ForEachBlock
  | RouterBlock
  | TryCatchBlock
  | SubSequenceBlock
  | ABSplitBlock
  | CancellationScopeBlock

// --- main entity -------------------------------------------------------------

/**
 * Full sequence definition returned by read endpoints.
 * (sequence.rs — SequenceDefinition)
 */
export interface SequenceDefinition {
  id: Uuid
  tenant_id: string
  namespace: string
  name: string
  version: number
  deprecated: boolean
  status: SequenceStatus
  blocks: BlockDefinition[]
  interceptors?: Json
  input_schema?: Json
  sla?: SlaPolicy
  on_failure?: BlockDefinition[]
  on_cancel?: BlockDefinition[]
  created_at: IsoTimestamp
}

// --- request shapes ----------------------------------------------------------

/**
 * POST /api/v1/sequences — create a sequence.
 * (sequences.rs — create_sequence)
 */
export interface CreateSequenceRequest {
  id: Uuid
  tenant_id: string
  namespace: string
  name: string
  version: number
  deprecated?: boolean
  status?: SequenceStatus
  blocks: BlockDefinition[]
  interceptors?: Json
  input_schema?: Json
  sla?: SlaPolicy
  on_failure?: BlockDefinition[]
  on_cancel?: BlockDefinition[]
  created_at: IsoTimestamp
}

/**
 * 201 Created response from POST /sequences.
 * Warnings about unknown handlers / lint issues (may be absent).
 */
export interface CreateSequenceResponse {
  id: Uuid
  warnings?: string[]
}

/**
 * GET /api/v1/sequences — list query params.
 * (sequences.rs — list_sequences)
 */
export interface ListSequencesQuery {
  tenant_id?: string
  namespace?: string
  limit?: number
  offset?: number
}

/**
 * GET /api/v1/sequences/by-name — query params.
 */
export interface ByNameQuery {
  tenant_id: string
  namespace: string
  name: string
  version?: number
}

/**
 * POST /api/v1/sequences/{id}/status — body.
 */
export interface SetStatusRequest {
  status: SequenceStatus
}

/**
 * POST /api/v1/sequences/{name}/unpublish — body.
 */
export interface UnpublishRequest {
  delete?: boolean
}

/**
 * 201 Created response from POST /sequences/{name}/promote.
 */
export interface PromoteResponse {
  id: Uuid
  version: number
}

/**
 * GET /api/v1/sequences — paginated response wrapper.
 */
export interface PaginatedSequences {
  items: SequenceDefinition[]
  has_more?: boolean
}
