/**
 * Request / response types for the Instances domain.
 * Rust → TypeScript mapping follows auth-rbac.md §9.
 * DESIGN_REFERENCE §Instances — instances-core.md
 */
import type { Uuid, IsoTimestamp, Json, ListQuery } from '@/api/types/common'

// --- State machine -----------------------------------------------------------

export type InstanceState =
  | 'scheduled'
  | 'running'
  | 'waiting'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** States from which no further automatic transitions occur. */
export const TERMINAL_STATES: ReadonlySet<InstanceState> = new Set([
  'completed',
  'failed',
  'cancelled',
])

export function isTerminal(state: InstanceState): boolean {
  return TERMINAL_STATES.has(state)
}

// Server enum is PascalCase (`Low`/`Normal`/`High`/`Critical`); sending lowercase
// is rejected with HTTP 422 `unknown variant`. Verified against live orch8-server.
export type Priority = 'Low' | 'Normal' | 'High' | 'Critical'

// --- ExecutionContext ---------------------------------------------------------

export interface AuditEntry {
  timestamp: IsoTimestamp
  event: string
  details: Json
}

export interface RuntimeContext {
  current_step?: string | null
  attempt?: number
  started_at?: IsoTimestamp | null
  current_step_started_at?: IsoTimestamp | null
  resource_key?: string | null
  instance_id?: string
  total_steps_executed?: number
  dry_run?: boolean
  dry_run_auto_approve?: boolean
}

export interface ExecutionContext {
  data?: Json
  config?: Json
  audit?: AuditEntry[]
  runtime?: RuntimeContext
}

// --- Budget ------------------------------------------------------------------

export interface Budget {
  max_input_tokens?: number
  max_output_tokens?: number
  max_total_tokens?: number
  max_steps?: number
}

// --- Core entity -------------------------------------------------------------

export interface TaskInstance {
  id: Uuid
  sequence_id: Uuid
  tenant_id: string
  namespace: string
  state: InstanceState
  next_fire_at: IsoTimestamp | null
  priority: Priority
  timezone: string
  metadata: Json
  context: ExecutionContext
  concurrency_key?: string
  max_concurrency?: number
  idempotency_key?: string
  session_id?: Uuid
  parent_instance_id?: Uuid
  budget?: Budget
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

// --- Create ------------------------------------------------------------------

export interface CreateInstanceRequest {
  sequence_id: Uuid
  tenant_id: string
  namespace: string
  priority?: Priority
  timezone?: string
  metadata?: Json
  context?: ExecutionContext
  dry_run?: boolean
  dry_run_auto_approve?: boolean
  next_fire_at?: IsoTimestamp | null
  concurrency_key?: string | null
  max_concurrency?: number | null
  idempotency_key?: string | null
  budget?: Budget | null
}

export interface CreateInstanceResponse {
  id: Uuid
  deduplicated?: boolean
}

export interface BatchCreateRequest {
  instances: CreateInstanceRequest[]
}

export interface BatchCreateResponse {
  count: number
}

// --- List --------------------------------------------------------------------

export interface ListInstancesQuery extends ListQuery {
  tenant_id?: string
  namespace?: string
  sequence_id?: string
  state?: string
  [key: string]: string | number | boolean | undefined
}

// --- State update ------------------------------------------------------------

export interface UpdateStateRequest {
  state: InstanceState
  next_fire_at?: IsoTimestamp | null
}

export interface UpdateContextRequest {
  context: ExecutionContext
}

// --- Retry / Resume ----------------------------------------------------------

export interface RetryResponse {
  id: Uuid
  state: 'scheduled'
}

export interface InjectedSignal {
  signal_type: string
  payload?: Json
}

export interface ResumeFromRequest {
  context?: Json | null
  signals?: InjectedSignal[]
}

export interface ResumeFromResponse {
  id: Uuid
  state: 'scheduled'
  resumed_from: string
  outputs_deleted: number
  signals_enqueued: number
}

// --- Signals -----------------------------------------------------------------

export type SignalType = 'pause' | 'resume' | 'cancel' | 'update_context' | string

export interface SendSignalRequest {
  signal_type: SignalType
  payload?: Json
}

export interface SendSignalResponse {
  signal_id: Uuid
}

// --- Bulk / batch ------------------------------------------------------------

export interface BulkFilter {
  tenant_id: string | null
  namespace?: string | null
  sequence_id?: Uuid | null
  states?: InstanceState[] | null
  metadata?: Record<string, string> | null
}

export interface BulkUpdateStateRequest {
  filter: BulkFilter
  state: InstanceState
}

export interface BulkUpdateStateResponse {
  count: number
}

export interface BulkRescheduleRequest {
  filter: BulkFilter
  offset_secs: number
}

export interface BulkRescheduleResponse {
  count: number
}

export type BatchAction = 'retry' | 'pause' | 'resume' | 'cancel' | 'signal'

export interface BatchActionRequest {
  filter: BulkFilter
  action: BatchAction
  signal_type?: string | null
  payload?: Json
  dry_run?: boolean
  limit?: number
}

export interface BatchActionResponse {
  matched: number
  applied: number
  skipped: number
  failed: number
  dry_run: boolean
}

// --- DLQ / Children ----------------------------------------------------------

export interface ListDlqQuery {
  tenant_id?: string
  namespace?: string
  sequence_id?: string
  offset?: number
  limit?: number
}

// --- Execution nodes ---------------------------------------------------------

export type NodeState =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped'

export interface ExecutionNode {
  id: Uuid
  instance_id: Uuid
  block_id: string
  parent_id: Uuid | null
  block_type: string
  branch_index: number | null
  state: NodeState
  started_at: IsoTimestamp | null
  completed_at: IsoTimestamp | null
}
