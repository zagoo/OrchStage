/**
 * Sessions domain types — Rust → TypeScript mapping.
 * Source: orch8-api/src/sessions.rs, orch8-types/src/session.rs
 * DESIGN_REFERENCE §Sessions (human-sessions-stream.md §2)
 */
import type { IsoTimestamp, Json, Uuid } from './common'

// --- enums -------------------------------------------------------------------

/**
 * Session lifecycle state machine.
 * Serialized as snake_case strings.
 * Source: session.rs:31-60
 *
 * State machine (no API-layer transition guard):
 *   active  <--> paused
 *   active  ──>  completed (terminal)
 *   active  ──>  expired   (terminal)
 *   paused  ──>  completed (terminal)
 *   paused  ──>  expired   (terminal)
 */
export type SessionState = 'active' | 'paused' | 'completed' | 'expired'

// --- entity ------------------------------------------------------------------

/**
 * Full session entity returned by read endpoints.
 * Source: orch8-types/src/session.rs, sessions.rs
 * DESIGN_REFERENCE §Sessions §2.1 Session Entity
 */
export interface Session {
  /** Server-assigned UUID v7. */
  id: Uuid
  tenant_id: string
  /** Human-readable lookup key. 1–512 characters. Unique per tenant. */
  session_key: string
  /** Shared data blob. Default {}. */
  data: Json
  /** Lifecycle state. Always starts as 'active'. */
  state: SessionState
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
  /** Optional TTL timestamp. Omitted from JSON when not set. */
  expires_at?: IsoTimestamp
}

// --- request shapes ----------------------------------------------------------

/**
 * POST /api/v1/sessions — create a session.
 * Source: sessions.rs:50-66
 * DESIGN_REFERENCE §Sessions §2.2 Create Session
 */
export interface CreateSessionRequest {
  tenant_id: string
  /** 1–512 characters. */
  session_key: string
  /** Initial shared data blob. Default {}. */
  data?: Json
  /** Optional TTL. */
  expires_at?: IsoTimestamp
}

/**
 * PATCH /api/v1/sessions/{id}/data — replace data field.
 * Full replacement (not a merge). Source: sessions.rs:141-159
 * DESIGN_REFERENCE §Sessions §2.5 Update Session Data
 */
export interface UpdateSessionDataRequest {
  data: Json
}

/**
 * PATCH /api/v1/sessions/{id}/state — transition state.
 * No transition validation at API level. Source: sessions.rs
 * DESIGN_REFERENCE §Sessions §2.6 Update Session State
 */
export interface UpdateSessionStateRequest {
  state: SessionState
}

// --- query shapes -------------------------------------------------------------

/**
 * GET /api/v1/sessions — list sessions (not in inventory but modelled for future use).
 */
export interface SessionsQuery {
  tenant_id?: string
  limit?: number
  offset?: number
}

// --- TaskInstance (reference type used by GET /sessions/{id}/instances) ------

/** Instance state enum — terminal states: completed, failed, cancelled. */
export type InstanceState =
  | 'scheduled'
  | 'running'
  | 'waiting'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** Minimal task instance shape for session instances list. */
export interface TaskInstance {
  id: Uuid
  sequence_id: Uuid
  tenant_id: string
  namespace: string
  state: InstanceState
  next_fire_at: IsoTimestamp | null
  priority: string
  timezone: string
  metadata: Json
  context: Json
  session_id?: Uuid
  parent_instance_id?: Uuid
  idempotency_key?: string
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}
