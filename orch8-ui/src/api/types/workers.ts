/**
 * Workers & Tasks domain types — Rust → TypeScript mapping.
 * Source: engine/orch8-types/src/worker.rs, engine/orch8-types/src/worker_filter.rs
 * DESIGN_REFERENCE §Workers & Tasks
 */
import type { IsoTimestamp, Json, Uuid } from './common'

// --- enums -------------------------------------------------------------------

export type WorkerTaskState = 'pending' | 'claimed' | 'completed' | 'failed'

export type WorkerCommandKind = 'drain' | 'reload' | 'ping'

// --- entities ----------------------------------------------------------------

/**
 * A single worker task (one unit of external work dispatched to a handler).
 * worker.rs:115
 */
export interface WorkerTask {
  id: Uuid
  instance_id: Uuid
  block_id: string
  handler_name: string
  queue_name: string | null
  params: Json
  context: Json
  attempt: number
  timeout_ms: number | null
  state: WorkerTaskState
  worker_id: string | null
  claimed_at: IsoTimestamp | null
  heartbeat_at: IsoTimestamp | null
  completed_at: IsoTimestamp | null
  output: Json | null
  error_message: string | null
  error_retryable: boolean | null
  created_at: IsoTimestamp
}

/**
 * One registration row: (worker_id, handler_name) pair.
 * worker.rs:145
 */
export interface WorkerRegistration {
  worker_id: string
  handler_name: string
  queue_name?: string
  version?: string
  tenant_id?: string
  last_seen_at: IsoTimestamp
}

/**
 * Aggregated fleet view — one row per worker_id (multiple registrations collapsed).
 * workers.rs:421
 */
export interface WorkerInfo {
  worker_id: string
  handlers: string[]
  queues: string[]
  version: string | null
  last_seen_at: IsoTimestamp
  alive: boolean
  in_flight: number
}

/**
 * Control command queued for a worker.
 * worker.rs:164
 */
export interface WorkerCommand {
  id: Uuid
  worker_id: string
  command: WorkerCommandKind
  payload: Json
  created_at: IsoTimestamp
}

/**
 * Minimum-version pin for a (tenant, handler) pair.
 * worker.rs:213
 */
export interface WorkerVersionPin {
  tenant_id: string
  handler_name: string
  min_version: string
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

/**
 * Handler catalog — built-in (in-process) vs external (via worker registry).
 * workers.rs:533
 */
export interface HandlerCatalog {
  builtin: string[]
  external: string[]
}

/**
 * Aggregate task statistics, optionally scoped to tenant.
 * worker_filter.rs:19
 */
export interface WorkerTaskStats {
  by_state: Record<string, number>
  by_handler: Record<string, Record<string, number>>
  active_workers: string[]
}

// --- request shapes ----------------------------------------------------------

/**
 * GET /api/v1/workers — query parameters
 */
export interface ListWorkersQuery {
  alive_within_secs?: number
  include_stale?: boolean
}

/**
 * GET /api/v1/workers/tasks — query parameters
 */
export interface ListTasksQuery {
  tenant_id?: string
  state?: string
  handler_name?: string
  worker_id?: string
  queue_name?: string
  limit?: number
  offset?: number
}

/**
 * POST /api/v1/workers/tasks/poll
 */
export interface PollTasksRequest {
  handler_name: string
  worker_id: string
  limit?: number
  version?: string | null
}

/**
 * POST /api/v1/workers/tasks/poll/queue
 */
export interface PollTasksFromQueueRequest {
  queue_name: string
  handler_name: string
  worker_id: string
  limit?: number
  version?: string | null
}

/**
 * POST /api/v1/workers/tasks/{id}/complete
 */
export interface CompleteTaskRequest {
  worker_id: string
  output: Json
  logs?: StepLogEntry[]
}

/**
 * POST /api/v1/workers/tasks/{id}/fail
 */
export interface FailTaskRequest {
  worker_id: string
  message: string
  retryable?: boolean
  logs?: StepLogEntry[]
}

/**
 * POST /api/v1/workers/tasks/{id}/heartbeat
 */
export interface HeartbeatTaskRequest {
  worker_id: string
}

/** Log entry attached to task completion/failure. */
export interface StepLogEntry {
  level: string
  message: string
  timestamp: IsoTimestamp
}

/**
 * POST /api/v1/workers/commands — enqueue a control command
 */
export interface EnqueueCommandRequest {
  worker_id: string
  command: WorkerCommandKind
  payload?: Json
}

/**
 * POST /api/v1/workers/version-pins — upsert a version pin
 */
export interface SetVersionPinRequest {
  tenant_id: string
  handler_name: string
  min_version: string
}

/**
 * GET /api/v1/workers/version-pins — optional filter
 */
export interface ListVersionPinsQuery {
  tenant_id?: string
}
