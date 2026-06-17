/**
 * Typed endpoint functions for the Rollback Policies domain.
 * All paths are canonical /api/v1/… form.
 * DESIGN_REFERENCE §Rollback Policies — ops-resilience.md §2
 */
import { http, API_V1 } from '@/api/http'
import type {
  RollbackPolicy,
  CreateRollbackPolicyRequest,
  ListRollbackPoliciesQuery,
} from '@/api/types/ops'

// POST /api/v1/rollback-policies — create a new rollback policy
export function createRollbackPolicy(
  body: CreateRollbackPolicyRequest,
  signal?: AbortSignal,
): Promise<RollbackPolicy> {
  return http.post<RollbackPolicy>(`${API_V1}/rollback-policies`, body, { signal })
}

// GET /api/v1/rollback-policies — list rollback policies (max 100 rows)
export function listRollbackPolicies(
  query?: ListRollbackPoliciesQuery,
  signal?: AbortSignal,
): Promise<RollbackPolicy[]> {
  return http.get<RollbackPolicy[]>(`${API_V1}/rollback-policies`, { query, signal })
}

// GET /api/v1/rollback-policies/{name} — get policy by sequence_name
export function getRollbackPolicy(
  sequenceName: string,
  tenantId?: string,
  signal?: AbortSignal,
): Promise<RollbackPolicy> {
  return http.get<RollbackPolicy>(
    `${API_V1}/rollback-policies/${encodeURIComponent(sequenceName)}`,
    { query: tenantId ? { tenant_id: tenantId } : undefined, signal },
  )
}

// DELETE /api/v1/rollback-policies/{name} — delete policy by sequence_name
export function deleteRollbackPolicy(
  sequenceName: string,
  tenantId?: string,
  signal?: AbortSignal,
): Promise<void> {
  return http.del<void>(
    `${API_V1}/rollback-policies/${encodeURIComponent(sequenceName)}`,
    { query: tenantId ? { tenant_id: tenantId } : undefined, signal },
  )
}
