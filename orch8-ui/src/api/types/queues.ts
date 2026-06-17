/**
 * Queues & Routing domain types — Rust → TypeScript mapping.
 * Source: engine/orch8-types/src/queue_dispatch.rs, engine/orch8-types/src/queue_routing.rs
 * DESIGN_REFERENCE §Queue Dispatch Config, §Queue Routing Rules
 */
import type { IsoTimestamp, Uuid } from './common'

// --- enums -------------------------------------------------------------------

export type DispatchMode = 'poll' | 'push'

// --- entities ----------------------------------------------------------------

/**
 * Queue dispatch configuration — controls poll vs push delivery.
 * Keyed on (tenant_id, queue_name).
 * queue_dispatch.rs:25
 */
export interface QueueDispatchConfig {
  tenant_id: string
  queue_name: string
  mode: DispatchMode
  push_url: string | null
  /** Never returned by the API — write-only on create/update. */
  secret?: string
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

/**
 * Routing rule — evaluated at task-enqueue time; highest priority wins.
 * queue_routing.rs:16
 */
export interface QueueRoutingRule {
  id: Uuid
  tenant_id: string
  handler_name: string
  match_queue: string | null
  queue_override: string
  priority: number
  enabled: boolean
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

// --- request shapes ----------------------------------------------------------

/**
 * POST /api/v1/queues/dispatch — create/update dispatch config
 */
export interface SetDispatchRequest {
  tenant_id: string
  queue_name: string
  mode: DispatchMode
  push_url?: string | null
  secret?: string | null
}

/**
 * GET /api/v1/queues/dispatch — optional filter
 */
export interface ListDispatchQuery {
  tenant_id?: string
}

/**
 * POST /api/v1/routing-rules — create a routing rule
 */
export interface CreateRoutingRuleRequest {
  tenant_id: string
  handler_name: string
  match_queue?: string | null
  queue_override: string
  priority?: number
  enabled?: boolean
}

/**
 * GET /api/v1/routing-rules — list query parameters
 */
export interface ListRoutingRulesQuery {
  tenant_id?: string
  handler_name?: string
}
