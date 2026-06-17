/**
 * Triggers domain types — Rust → TypeScript mapping.
 * Source: engine/orch8-types/src/trigger.rs, engine/orch8-api/src/triggers.rs
 * DESIGN_REFERENCE §Triggers
 */
import type { IsoTimestamp, Json, Uuid } from './common'

// --- enums -------------------------------------------------------------------

export type TriggerType = 'webhook' | 'nats' | 'file_watch' | 'event' | 'activepieces_poll'

// --- response shapes ---------------------------------------------------------

/**
 * Bookkeeping for activepieces_poll triggers.
 * (trigger.rs:61–95)
 */
export interface TriggerPollState {
  slug: string
  state: Json
  last_poll_at: IsoTimestamp | null
  last_error: string | null
  consecutive_failures: number
  updated_at: IsoTimestamp
}

/**
 * Full trigger definition returned by all trigger read endpoints.
 * NOTE: `secret` is always "[REDACTED]" in API responses — never the raw value.
 * (trigger.rs:98–128)
 */
export interface TriggerDef {
  slug: string
  sequence_name: string
  version: number | null
  tenant_id: string
  namespace: string
  enabled: boolean
  secret: string | null
  trigger_type: TriggerType
  config: Json
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
  /** Only present for activepieces_poll triggers. null if never written. */
  poll_state?: TriggerPollState | null
}

// --- request shapes ----------------------------------------------------------

/**
 * POST /api/v1/triggers — create a trigger.
 * (triggers.rs:38–52)
 */
export interface CreateTriggerRequest {
  slug: string
  sequence_name: string
  version?: number | null
  tenant_id: string
  namespace?: string
  secret?: string | null
  trigger_type?: TriggerType
  config?: Json
}

/**
 * GET /api/v1/triggers — list query params.
 * (triggers.rs:54–64)
 */
export interface TriggerQuery {
  tenant_id?: string
  limit?: number
}

/**
 * POST /api/v1/triggers/{slug}/fire — optional payload; any JSON value.
 * (triggers.rs:244)
 */
export type FireTriggerBody = Json

/**
 * POST /api/v1/triggers/{slug}/fire — 201 Created response.
 */
export interface FireTriggerResponse {
  instance_id: Uuid
  trigger: string
  sequence_name: string
}

/**
 * ActivepiecesPoll config sub-object (ap_poll.rs:109–172).
 * Validated at create time for trigger_type="activepieces_poll".
 */
export interface ActivepiecesPollConfig {
  piece: string
  trigger: string
  auth?: Json
  props?: Json
  interval_secs?: number
  cron?: string
}
