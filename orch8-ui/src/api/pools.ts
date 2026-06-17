/**
 * Typed endpoint functions for the Resource Pools domain.
 * All paths use the canonical /api/v1/… form.
 * DESIGN_REFERENCE §Resource Pools (resources.md, inventory.md §2.11)
 */
import { http, API_V1 } from '@/api/http'
import type {
  ResourcePool,
  PoolResource,
  CreatePoolRequest,
  AddResourceRequest,
  UpdateResourceRequest,
  PoolQuery,
} from '@/api/types/pools'

// --- Pools -------------------------------------------------------------------

// GET /api/v1/pools — List pools for a tenant
export function listPools(query?: PoolQuery, signal?: AbortSignal): Promise<ResourcePool[]> {
  return http.get<ResourcePool[]>(`${API_V1}/pools`, { query, signal })
}

// POST /api/v1/pools — Create a new pool
export function createPool(body: CreatePoolRequest, signal?: AbortSignal): Promise<ResourcePool> {
  return http.post<ResourcePool>(`${API_V1}/pools`, body, { signal })
}

// GET /api/v1/pools/{id} — Get a single pool by UUID
export function getPool(id: string, signal?: AbortSignal): Promise<ResourcePool> {
  return http.get<ResourcePool>(`${API_V1}/pools/${encodeURIComponent(id)}`, { signal })
}

// DELETE /api/v1/pools/{id} — Delete a pool (cascades to resources)
export function deletePool(id: string, signal?: AbortSignal): Promise<void> {
  return http.del<void>(`${API_V1}/pools/${encodeURIComponent(id)}`, { signal })
}

// --- Pool Resources ----------------------------------------------------------

// GET /api/v1/pools/{pool_id}/resources — List resources in a pool
export function listPoolResources(poolId: string, signal?: AbortSignal): Promise<PoolResource[]> {
  return http.get<PoolResource[]>(`${API_V1}/pools/${encodeURIComponent(poolId)}/resources`, { signal })
}

// POST /api/v1/pools/{pool_id}/resources — Add a resource to a pool
export function addPoolResource(
  poolId: string,
  body: AddResourceRequest,
  signal?: AbortSignal,
): Promise<PoolResource> {
  return http.post<PoolResource>(
    `${API_V1}/pools/${encodeURIComponent(poolId)}/resources`,
    body,
    { signal },
  )
}

// PUT /api/v1/pools/{pool_id}/resources/{resource_id} — Update a pool resource
export function updatePoolResource(
  poolId: string,
  resourceId: string,
  body: UpdateResourceRequest,
  signal?: AbortSignal,
): Promise<PoolResource> {
  return http.put<PoolResource>(
    `${API_V1}/pools/${encodeURIComponent(poolId)}/resources/${encodeURIComponent(resourceId)}`,
    body,
    { signal },
  )
}

// DELETE /api/v1/pools/{pool_id}/resources/{resource_id} — Remove a resource from a pool
export function deletePoolResource(
  poolId: string,
  resourceId: string,
  signal?: AbortSignal,
): Promise<void> {
  return http.del<void>(
    `${API_V1}/pools/${encodeURIComponent(poolId)}/resources/${encodeURIComponent(resourceId)}`,
    { signal },
  )
}
