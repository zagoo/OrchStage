/**
 * Ops resilience domain types — Circuit Breakers, Rollback Policies, Cluster Nodes, Webhook Outbox.
 * Rust → TypeScript mapping per DESIGN_REFERENCE §ops-resilience.md
 */
import type { IsoTimestamp, Uuid } from './common'

// --- Circuit Breakers --------------------------------------------------------

/** BreakerState enum (circuit_breaker.rs). */
export type BreakerState = 'closed' | 'open' | 'half_open'

/** CircuitBreakerState returned by all breaker read endpoints. */
export interface CircuitBreakerState {
  tenant_id: string
  handler: string
  state: BreakerState
  failure_count: number
  failure_threshold: number
  cooldown_secs: number
  opened_at?: IsoTimestamp | null
}

// --- Rollback Policies -------------------------------------------------------

/** PolicyResponse returned by rollback CRUD endpoints. */
export interface RollbackPolicy {
  id: number
  tenant_id: string
  sequence_name: string
  error_rate_threshold: number
  time_window_secs: number
  enabled: boolean
  cooldown_secs: number
  confirmation_window_secs: number
  webhook_url: string | null
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

/** POST /api/v1/rollback-policies request body. */
export interface CreateRollbackPolicyRequest {
  tenant_id?: string | null
  sequence_name: string
  error_rate_threshold: number
  time_window_secs: number
  cooldown_secs?: number | null
  confirmation_window_secs?: number | null
  webhook_url?: string | null
}

/** GET /api/v1/rollback-policies query params. */
export interface ListRollbackPoliciesQuery {
  tenant_id?: string
}

// --- Cluster Nodes -----------------------------------------------------------

/** NodeStatus enum (cluster.rs). */
export type NodeStatus = 'active' | 'draining' | 'stopped'

/** ClusterNode returned by list_nodes. */
export interface ClusterNode {
  id: Uuid
  name: string
  status: NodeStatus
  registered_at: IsoTimestamp
  last_heartbeat_at: IsoTimestamp
  drain: boolean
}

// --- Webhook Outbox ----------------------------------------------------------

/** WebhookOutboxEntry returned by list_outbox. */
export interface WebhookOutboxEntry {
  id: Uuid
  url: string
  event_type: string
  instance_id?: string | null
  payload: unknown
  attempts: number
  last_error?: string | null
  created_at: IsoTimestamp
}

/** Response from POST /api/v1/webhooks/outbox/{id}/redeliver. */
export interface RedeliverResponse {
  redelivered: boolean
}

/** GET /api/v1/webhooks/outbox query params. */
export interface ListOutboxQuery {
  limit?: number
}
