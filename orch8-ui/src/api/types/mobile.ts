/**
 * Mobile Sync domain types — Rust → TypeScript mapping.
 * Source: orch8-api/src/mobile_sync.rs, engine/migrations/038_mobile_sync.sql
 * DESIGN_REFERENCE §Mobile Sync (2.21)
 *
 * Timestamp note: the PostgreSQL implementation formats timestamps as
 * 'YYYY-MM-DD HH24:MI:SS' (not ISO 8601). Parse with:
 *   new Date(val.replace(' ', 'T') + 'Z')
 */

/** Parse a Postgres-formatted UTC timestamp string to a JS Date. */
export function parsePgTimestamp(val: string | null | undefined): Date | null {
  if (!val) return null
  // Handle both "YYYY-MM-DD HH:MM:SS" and ISO 8601 formats
  const normalized = val.includes('T') ? val : val.replace(' ', 'T') + 'Z'
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

// ---------------------------------------------------------------------------
// Approval state machine
// ---------------------------------------------------------------------------

export type ApprovalState = 'pending' | 'resolved' | 'expired'

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** Mobile device registered via POST /mobile/devices/register */
export interface MobileDevice {
  device_id: string
  tenant_id: string
  push_token: string | null
  platform: string
  app_version: string | null
  active: boolean
  /** "YYYY-MM-DD HH24:MI:SS" UTC — null if never synced */
  last_sync_at: string | null
  /** "YYYY-MM-DD HH24:MI:SS" UTC */
  registered_at: string
}

/** Approval request created by a device at a wait_for_input step */
export interface MobileApprovalRequest {
  id: string
  device_id: string
  tenant_id: string
  instance_id: string
  block_id: string
  sequence_name: string | null
  prompt: string | null
  /** JSON-encoded string — call JSON.parse before rendering */
  choices: string | null
  store_as: string | null
  timeout_secs: number | null
  /** JSON-encoded string — call JSON.parse before rendering */
  metadata: string | null
  state: ApprovalState
  /** JSON-encoded output value; null until resolved */
  resolution: string | null
  /** "YYYY-MM-DD HH24:MI:SS" UTC */
  created_at: string
  /** "YYYY-MM-DD HH24:MI:SS" UTC; null until resolved */
  resolved_at: string | null
}

/** Instance status reported by a mobile device */
export interface MobileInstanceStatus {
  device_id: string
  instance_id: string
  sequence_name: string | null
  /** Device-reported state string; not server-validated */
  state: string
  /** block_id of the step currently executing */
  current_step: string | null
  handler: string | null
  /** JSON-encoded string; call JSON.parse before use */
  context_summary: string | null
  /** JSON-encoded array string; call JSON.parse before use */
  steps: string | null
  /** "YYYY-MM-DD HH24:MI:SS" UTC */
  updated_at: string
}

/** Command in the device command inbox */
export interface CommandPayload {
  id: string
  /** JSON key is "type" (serde rename from command_type) */
  type: string
  payload: unknown
}

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

export interface RegisterDeviceRequest {
  device_id: string
  push_token?: string
  /** "ios" or "android" (not validated server-side; stored verbatim) */
  platform: string
  app_version?: string
}

export interface StatusUpdatePayload {
  instance_id: string
  sequence_name?: string
  /** e.g. "running", "waiting", "completed" */
  state: string
  current_step?: string
  handler?: string
  /** Required — ISO 8601 string from the device clock */
  timestamp: string
  context_summary?: unknown
  steps?: unknown
}

export interface ApprovalRequestPayload {
  instance_id: string
  block_id: string
  sequence_name?: string
  prompt?: string
  choices?: unknown
  store_as?: string
  timeout_seconds?: number
  metadata?: unknown
}

export interface StepDelegationPayload {
  request_id: string
  instance_id: string
  block_id: string
  handler: string
  params: unknown
}

export interface SyncRequest {
  device_id: string
  status_updates?: StatusUpdatePayload[]
  approval_requests?: ApprovalRequestPayload[]
  step_delegations?: StepDelegationPayload[]
  command_acks?: string[]
}

export interface SyncResponse {
  commands: CommandPayload[]
  /** u32 — 5 (commands pending) or 30 (idle) */
  sync_interval_secs: number
}

export interface ResolveApprovalRequest {
  output: unknown
}

export interface CreateCommandRequest {
  device_id: string
  command_type: string
  payload: unknown
}

// ---------------------------------------------------------------------------
// Query / response envelopes
// ---------------------------------------------------------------------------

export interface ListDevicesQuery {
  tenant_id?: string
  limit?: number
}

export interface ListApprovalsQuery {
  tenant_id?: string
  state?: ApprovalState | ''
  limit?: number
}

export interface ListStatusQuery {
  tenant_id?: string
  device_id?: string
  limit?: number
}

export interface ListDevicesResponse {
  items: MobileDevice[]
  total: number
}

export interface ListApprovalsResponse {
  items: MobileApprovalRequest[]
  total: number
}

export interface ListStatusResponse {
  items: MobileInstanceStatus[]
  total: number
}
