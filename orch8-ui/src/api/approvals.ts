/**
 * Typed endpoint functions for the Approvals domain.
 * All paths are canonical /api/v1/… form.
 * DESIGN_REFERENCE §Approvals (human-sessions-stream.md §1, inventory.md §2.17)
 */
import { http, API_V1 } from '@/api/http'
import type { ApprovalsResponse, ApprovalsQuery, ResolveApprovalPayload } from '@/api/types/approvals'

// GET /api/v1/approvals — List pending approvals
// Source: approvals.rs, inventory.md §2.17
export function listApprovals(query?: ApprovalsQuery, signal?: AbortSignal): Promise<ApprovalsResponse> {
  return http.get<ApprovalsResponse>(`${API_V1}/approvals`, { query, signal })
}

/**
 * POST /api/v1/instances/{id}/signals — Resolve an approval via human-input signal.
 *
 * Signal name construction: `custom:human_input:{block_id}` where block_id is
 * the exact ApprovalItem.block_id value.
 * Source: human-sessions-stream.md §1.2, signal.rs:46-54
 * DESIGN_REFERENCE §Instances §2.3 POST /instances/{id}/signals
 */
export function resolveApproval(
  instanceId: string,
  blockId: string,
  payload: ResolveApprovalPayload,
  signal?: AbortSignal,
): Promise<void> {
  return http.post<void>(
    `${API_V1}/instances/${encodeURIComponent(instanceId)}/signals`,
    {
      signal_type: `custom:human_input:${blockId}`,
      payload,
    },
    { signal },
  )
}
