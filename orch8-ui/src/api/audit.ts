/**
 * Typed endpoint functions for the Audit domain.
 * Note: there is no global audit-log list endpoint; audit entries are
 * per-instance only via GET /api/v1/instances/{id}/audit.
 * DESIGN_REFERENCE §Audit (instances-advanced.md §Audit Log)
 */
import { http, API_V1 } from '@/api/http'
import type { AuditLogEntry } from '@/api/types/observability'

// GET /api/v1/instances/{id}/audit — List audit log entries for one instance
// Returns up to 200 entries, newest-first. No pagination beyond the hard cap.
export function listInstanceAuditLog(
  instanceId: string,
  signal?: AbortSignal,
): Promise<AuditLogEntry[]> {
  return http.get<AuditLogEntry[]>(
    `${API_V1}/instances/${encodeURIComponent(instanceId)}/audit`,
    { signal },
  )
}
