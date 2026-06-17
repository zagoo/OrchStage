/**
 * Cron schedules domain types — Rust → TypeScript mapping.
 * Source: engine/orch8-types/src/cron.rs, engine/orch8-api/src/cron.rs
 * DESIGN_REFERENCE §Cron Schedules
 */
import type { IsoTimestamp, Json, Uuid } from './common'

// --- enums -------------------------------------------------------------------

/**
 * Concurrency control when a previous run is still active.
 * (cron.rs:12–28)
 */
export type OverlapPolicy = 'allow' | 'skip' | 'buffer_one' | 'cancel_previous'

// --- response shapes ---------------------------------------------------------

/**
 * Full cron schedule record returned by list/get/update endpoints.
 * (cron.rs:56–82)
 */
export interface CronSchedule {
  id: Uuid
  tenant_id: string
  namespace: string
  sequence_id: Uuid
  cron_expr: string
  timezone: string
  enabled: boolean
  metadata: Json
  overlap_policy: OverlapPolicy
  skipped_fires: number
  last_skipped_at: IsoTimestamp | null
  last_triggered_at: IsoTimestamp | null
  next_fire_at: IsoTimestamp | null
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

/**
 * Minimal create response — id + next_fire_at only.
 * Full record available via GET /cron/{id}.
 * (cron.rs:132)
 */
export interface CreateCronResponse {
  id: Uuid
  next_fire_at: IsoTimestamp | null
}

/**
 * GET /cron/{id}/next-fires response.
 * (cron.rs:222)
 */
export interface NextFiresResponse {
  timezone: string
  fires: IsoTimestamp[]
}

// --- request shapes ----------------------------------------------------------

/**
 * POST /api/v1/cron — create a cron schedule.
 * (cron.rs:28–43)
 */
export interface CreateCronRequest {
  tenant_id: string
  namespace: string
  sequence_id: Uuid
  cron_expr: string
  timezone?: string
  metadata?: Json
  enabled?: boolean
  overlap_policy?: OverlapPolicy
}

/**
 * PUT /api/v1/cron/{id} — patch-semantics update (all fields optional).
 * (cron.rs:54–60)
 */
export interface UpdateCronRequest {
  cron_expr?: string | null
  timezone?: string | null
  enabled?: boolean | null
  metadata?: Json | null
  overlap_policy?: OverlapPolicy | null
}

/**
 * GET /api/v1/cron — list query params.
 * (cron.rs:63–67)
 */
export interface ListCronQuery {
  tenant_id?: string
  limit?: number
}

/**
 * GET /api/v1/cron/{id}/next-fires — query params.
 * (cron.rs:73–77)
 */
export interface NextFiresQuery {
  /** Number of upcoming fires; server clamps to [1, 50]. */
  n?: number
}
