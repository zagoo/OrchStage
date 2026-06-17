/**
 * Typed endpoint functions for the Circuit Breakers domain.
 * All paths are canonical /api/v1/… form.
 * DESIGN_REFERENCE §Circuit Breakers — ops-resilience.md §1
 */
import { http, API_V1 } from '@/api/http'
import type { CircuitBreakerState } from '@/api/types/ops'

// GET /api/v1/circuit-breakers — list all breakers (scoped to caller's tenant)
// Returns empty list for unscoped callers to avoid cross-tenant info leak.
export function listCircuitBreakers(signal?: AbortSignal): Promise<CircuitBreakerState[]> {
  return http.get<CircuitBreakerState[]>(`${API_V1}/circuit-breakers`, { signal })
}

// GET /api/v1/tenants/{tenant_id}/circuit-breakers — list breakers for a specific tenant
export function listBreakersForTenant(
  tenantId: string,
  signal?: AbortSignal,
): Promise<CircuitBreakerState[]> {
  return http.get<CircuitBreakerState[]>(
    `${API_V1}/tenants/${encodeURIComponent(tenantId)}/circuit-breakers`,
    { signal },
  )
}

// GET /api/v1/tenants/{tenant_id}/circuit-breakers/{handler} — get single breaker
export function getBreaker(
  tenantId: string,
  handler: string,
  signal?: AbortSignal,
): Promise<CircuitBreakerState> {
  return http.get<CircuitBreakerState>(
    `${API_V1}/tenants/${encodeURIComponent(tenantId)}/circuit-breakers/${encodeURIComponent(handler)}`,
    { signal },
  )
}

// POST /api/v1/tenants/{tenant_id}/circuit-breakers/{handler}/reset — force-reset to Closed
export function resetBreaker(
  tenantId: string,
  handler: string,
  signal?: AbortSignal,
): Promise<void> {
  return http.post<void>(
    `${API_V1}/tenants/${encodeURIComponent(tenantId)}/circuit-breakers/${encodeURIComponent(handler)}/reset`,
    undefined,
    { signal },
  )
}
