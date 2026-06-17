/**
 * Resource Pools domain types — Rust → TypeScript mapping.
 * Source: orch8-types/src/pool.rs, orch8-api/src/pools.rs
 * DESIGN_REFERENCE §Resource Pools (resources.md)
 */
import type { IsoTimestamp, Uuid } from './common'

// --- enums -------------------------------------------------------------------

/** Rotation strategy for pool resource assignment. (pool.rs) */
export type RotationStrategy = 'round_robin' | 'weighted' | 'random'

// --- response shapes ---------------------------------------------------------

/**
 * Resource pool entity returned by all pool read endpoints.
 * DESIGN_REFERENCE §GET /api/v1/pools
 */
export interface ResourcePool {
  id: Uuid
  tenant_id: string
  name: string
  strategy: RotationStrategy
  /** Internal round-robin counter; display-only in UI. */
  round_robin_index: number
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

/**
 * A single resource within a pool.
 * DESIGN_REFERENCE §GET /api/v1/pools/{pool_id}/resources
 */
export interface PoolResource {
  id: Uuid
  pool_id: Uuid
  resource_key: string
  name: string
  weight: number
  enabled: boolean
  /** 0 = unlimited */
  daily_cap: number
  /** Current day's usage counter (read-only; managed by engine). */
  daily_usage: number
  /** Date of current counter; null if never used. YYYY-MM-DD */
  daily_usage_date: string | null
  /** Warmup start date in YYYY-MM-DD format; null if no warmup. */
  warmup_start: string | null
  warmup_days: number
  warmup_start_cap: number
  created_at: IsoTimestamp
}

// --- request shapes ----------------------------------------------------------

/**
 * POST /api/v1/pools — create a new pool.
 */
export interface CreatePoolRequest {
  tenant_id: string
  name: string
  strategy?: RotationStrategy
}

/**
 * POST /api/v1/pools/{pool_id}/resources — add a resource to a pool.
 * Business rule: resource_key and name 1–255 chars; weight >= 1.
 * warmup_start must be YYYY-MM-DD if provided.
 */
export interface AddResourceRequest {
  resource_key: string
  name: string
  weight?: number
  daily_cap?: number
  warmup_start?: string | null
  warmup_days?: number
  warmup_start_cap?: number
}

/**
 * PUT /api/v1/pools/{pool_id}/resources/{resource_id} — partial update.
 * All fields optional; only non-null fields are applied server-side.
 * Note: resource_key is immutable; delete + re-add to change it.
 */
export interface UpdateResourceRequest {
  name?: string | null
  weight?: number | null
  enabled?: boolean | null
  daily_cap?: number | null
  warmup_start?: string | null
  warmup_days?: number | null
  warmup_start_cap?: number | null
}

/** Query params for GET /api/v1/pools */
export interface PoolQuery {
  tenant_id?: string
}
