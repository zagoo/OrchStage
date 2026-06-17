/**
 * Approvals domain types — Rust → TypeScript mapping.
 * Source: orch8-api/src/approvals.rs, orch8-types/src/instance.rs
 * DESIGN_REFERENCE §Approvals (human-sessions-stream.md §1)
 */
import type { IsoTimestamp, Json, Uuid } from './common'

// --- shared sub-types ---------------------------------------------------------

/**
 * A single choice the human reviewer can pick.
 * Default choices when HumanInputDef.choices is null:
 *   [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }]
 * Source: approvals.rs:175-186
 */
export interface HumanChoice {
  label: string
  value: string
}

// --- response shapes ----------------------------------------------------------

/**
 * A single approval item: one paused wait_for_input step needing human action.
 * Source: approvals.rs, orch8-types ApprovalItem
 * DESIGN_REFERENCE §Approvals §1.1 ApprovalItem Schema
 */
export interface ApprovalItem {
  instance_id: Uuid
  tenant_id: string
  namespace: string
  sequence_id: Uuid
  sequence_name: string
  /** ID of the step block waiting for input — used to construct the signal name. */
  block_id: string
  /** Prompt text to display to the reviewer. */
  prompt: string
  /** Allowed response values. */
  choices: HumanChoice[]
  /** Context variable key where the picked value is stored. Defaults to block_id. */
  store_as: string | null
  /** Seconds until the gate auto-escalates or fails. null = indefinite wait. */
  timeout_seconds: number | null
  /** Handler name invoked if timeout fires before a human responds. */
  escalation_handler: string | null
  /** When the step entered the waiting state. */
  waiting_since: IsoTimestamp
  /** waiting_since + timeout_seconds. null when no timeout. */
  deadline: IsoTimestamp | null
  /** Full instance.metadata blob. */
  metadata: Json
  /** When true, the UI should provide a free-text comment field. */
  allow_comment: boolean
}

/**
 * Paginated response from GET /api/v1/approvals.
 * NOTE: total reflects items.len() in the current page (not global count).
 * Source: approvals.rs:171-172
 */
export interface ApprovalsResponse {
  items: ApprovalItem[]
  /** Page count (not global total). See open issues in human-sessions-stream.md §5. */
  total: number
}

// --- query shapes -------------------------------------------------------------

/**
 * GET /api/v1/approvals — query parameters.
 * Source: approvals.rs:86-90
 */
export interface ApprovalsQuery {
  tenant_id?: string
  namespace?: string
  offset?: number
  limit?: number
}

// --- signal payload for resolving an approval --------------------------------

/**
 * Signal payload sent to POST /instances/{id}/signals to resolve an approval.
 * signal_type: `custom:human_input:{block_id}`
 * Source: human-sessions-stream.md §1.2, signal.rs:46-54
 */
export interface ResolveApprovalSignal {
  signal_type: string // "custom:human_input:{block_id}"
  payload: ResolveApprovalPayload
}

export interface ResolveApprovalPayload {
  /** Must match one of ApprovalItem.choices[].value */
  choice: string
  /** Free-text reviewer note. Only meaningful when allow_comment is true. */
  comment?: string
}
