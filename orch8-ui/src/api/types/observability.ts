/**
 * TypeScript types for the Usage, Telemetry, and Model Pricing domain.
 * Rust → TS mapping follows DESIGN_REFERENCE §Type mapping.
 * DESIGN_REFERENCE §Usage, §Telemetry (observability.md)
 */
import type { IsoTimestamp } from './common'

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

/** One aggregated usage group by (kind, model). */
export interface UsageAggregate {
  kind: string
  model: string
  events: number
  input_tokens: number
  output_tokens: number
  /** null when model is not in the pricing table */
  cost_usd: number | null
}

/** GET /api/v1/usage response */
export interface UsageResponse {
  tenant: string
  start: IsoTimestamp
  end: IsoTimestamp
  usage: UsageAggregate[]
  total_cost_usd: number
  /** Always true — list-price estimate, no discounts */
  cost_is_estimate: boolean
}

/** GET /api/v1/usage query parameters */
export interface UsageQuery {
  /** Required for admin/unscoped callers; ignored for header-scoped callers */
  tenant?: string
  /** RFC 3339 – defaults to end - 30d */
  start?: string
  /** RFC 3339 – defaults to now */
  end?: string
}

// ---------------------------------------------------------------------------
// Telemetry — Device context shared across ingest endpoints
// ---------------------------------------------------------------------------

export interface DeviceContext {
  device_id: string
  os_name: string
  os_version: string
  app_version: string
  sdk_version: string
}

// ---------------------------------------------------------------------------
// Telemetry — POST /api/v1/telemetry/mobile
// ---------------------------------------------------------------------------

export interface TelemetryBatchItem {
  event_type: string
  /** JSON-serialised payload string */
  payload: string
  /** RFC 3339 timestamp */
  timestamp: string
  device: DeviceContext
}

export interface IngestTelemetryRequest {
  events: TelemetryBatchItem[]
  tenant_id?: string | null
}

/** 202 response */
export interface IngestTelemetryResponse {
  accepted: number
}

// ---------------------------------------------------------------------------
// Telemetry — POST /api/v1/telemetry/mobile/errors
// ---------------------------------------------------------------------------

export interface IngestErrorRequest {
  error_type: string
  message: string
  stack_trace?: string | null
  device: DeviceContext
  tenant_id?: string | null
  instance_id?: string | null
  sequence_name?: string | null
}

// POST /telemetry/mobile/errors returns 202 with no body

// ---------------------------------------------------------------------------
// Telemetry — GET /api/v1/telemetry/mobile/dashboard
// ---------------------------------------------------------------------------

export type DashboardQueryType =
  | 'sync_completed_versions'
  | 'error_rate_per_sequence'
  | 'top_failing_steps'
  | 'device_os_breakdown'

export interface DashboardQuery {
  query_type: DashboardQueryType
  tenant_id?: string | null
  /** RFC 3339 – defaults to now - 7d */
  start_time?: string
  /** RFC 3339 – defaults to now */
  end_time?: string
}

export interface DashboardRow {
  dimension: string
  count: number
  percentage: number
}

export interface DashboardResponse {
  rows: DashboardRow[]
}

// ---------------------------------------------------------------------------
// Audit log — GET /api/v1/instances/{id}/audit
// ---------------------------------------------------------------------------

/** One audit log entry for a workflow instance. */
export interface AuditLogEntry {
  id: string
  instance_id: string
  tenant_id: string
  event_type: string
  /** Omitted when null (state_transition events only) */
  from_state?: string
  /** Omitted when null (state_transition events only) */
  to_state?: string
  /** Omitted when null (step events only) */
  block_id?: string
  /** Additional event data: duration, signal payload, error message, etc. */
  details: unknown
  created_at: IsoTimestamp
}

/** Query filters for the audit log view (drives per-instance lookup) */
export interface AuditQuery {
  instance_id?: string
  event_type?: string
  start?: string
  end?: string
}

// ---------------------------------------------------------------------------
// Model pricing (no HTTP endpoint — static table surfaced in UI for reference)
// ---------------------------------------------------------------------------

export interface ModelPrice {
  prefix: string
  input_per_1m: number
  output_per_1m: number
}

/** Hard-coded pricing table matching model_pricing.rs defaults (mid-2025 list prices). */
export const MODEL_PRICING_TABLE: ModelPrice[] = [
  // OpenAI
  { prefix: 'gpt-4o-mini', input_per_1m: 0.15, output_per_1m: 0.60 },
  { prefix: 'gpt-4o', input_per_1m: 2.50, output_per_1m: 10.00 },
  { prefix: 'gpt-4.1-mini', input_per_1m: 0.40, output_per_1m: 1.60 },
  { prefix: 'gpt-4.1-nano', input_per_1m: 0.10, output_per_1m: 0.40 },
  { prefix: 'gpt-4.1', input_per_1m: 2.00, output_per_1m: 8.00 },
  { prefix: 'gpt-4-turbo', input_per_1m: 10.00, output_per_1m: 30.00 },
  { prefix: 'gpt-3.5-turbo', input_per_1m: 0.50, output_per_1m: 1.50 },
  { prefix: 'o1', input_per_1m: 15.00, output_per_1m: 60.00 },
  { prefix: 'o3-mini', input_per_1m: 1.10, output_per_1m: 4.40 },
  { prefix: 'o3', input_per_1m: 2.00, output_per_1m: 8.00 },
  { prefix: 'o4-mini', input_per_1m: 1.10, output_per_1m: 4.40 },
  // Anthropic
  { prefix: 'claude-opus-4', input_per_1m: 15.00, output_per_1m: 75.00 },
  { prefix: 'claude-sonnet-4', input_per_1m: 3.00, output_per_1m: 15.00 },
  { prefix: 'claude-haiku-4-5', input_per_1m: 1.00, output_per_1m: 5.00 },
  { prefix: 'claude-haiku', input_per_1m: 1.00, output_per_1m: 5.00 },
  { prefix: 'claude-3-7-sonnet', input_per_1m: 3.00, output_per_1m: 15.00 },
  { prefix: 'claude-3-5-sonnet', input_per_1m: 3.00, output_per_1m: 15.00 },
  { prefix: 'claude-3-5-haiku', input_per_1m: 0.80, output_per_1m: 4.00 },
  { prefix: 'claude-3-opus', input_per_1m: 15.00, output_per_1m: 75.00 },
  // Google
  { prefix: 'gemini-2.5-pro', input_per_1m: 1.25, output_per_1m: 10.00 },
  { prefix: 'gemini-2.5-flash', input_per_1m: 0.30, output_per_1m: 2.50 },
  { prefix: 'gemini-2.0-flash', input_per_1m: 0.10, output_per_1m: 0.40 },
  { prefix: 'gemini-1.5-pro', input_per_1m: 1.25, output_per_1m: 5.00 },
  { prefix: 'gemini-1.5-flash', input_per_1m: 0.075, output_per_1m: 0.30 },
  // DeepSeek
  { prefix: 'deepseek-chat', input_per_1m: 0.27, output_per_1m: 1.10 },
  { prefix: 'deepseek-reasoner', input_per_1m: 0.55, output_per_1m: 2.19 },
  // Mistral
  { prefix: 'mistral-large', input_per_1m: 2.00, output_per_1m: 6.00 },
  { prefix: 'mistral-medium', input_per_1m: 0.40, output_per_1m: 2.00 },
  { prefix: 'mistral-small', input_per_1m: 0.10, output_per_1m: 0.30 },
  // Meta
  { prefix: 'llama-3.3-70b', input_per_1m: 0.59, output_per_1m: 0.79 },
  { prefix: 'llama-3.1-405b', input_per_1m: 3.50, output_per_1m: 3.50 },
  { prefix: 'llama-3.1-70b', input_per_1m: 0.59, output_per_1m: 0.79 },
  { prefix: 'llama-3.1-8b', input_per_1m: 0.05, output_per_1m: 0.08 },
  // xAI
  { prefix: 'grok-3-mini', input_per_1m: 0.30, output_per_1m: 0.50 },
  { prefix: 'grok-3', input_per_1m: 3.00, output_per_1m: 15.00 },
  { prefix: 'grok-2', input_per_1m: 2.00, output_per_1m: 10.00 },
  // Alibaba
  { prefix: 'qwen-max', input_per_1m: 1.60, output_per_1m: 6.40 },
  { prefix: 'qwen-plus', input_per_1m: 0.40, output_per_1m: 1.20 },
  { prefix: 'qwen-turbo', input_per_1m: 0.05, output_per_1m: 0.20 },
  // Cohere
  { prefix: 'command-r-plus', input_per_1m: 2.50, output_per_1m: 10.00 },
  { prefix: 'command-r', input_per_1m: 0.15, output_per_1m: 0.60 },
  // Amazon
  { prefix: 'nova-pro', input_per_1m: 0.80, output_per_1m: 3.20 },
  { prefix: 'nova-lite', input_per_1m: 0.06, output_per_1m: 0.24 },
]
