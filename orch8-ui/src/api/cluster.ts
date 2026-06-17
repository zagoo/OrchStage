/**
 * Typed endpoint functions for the Cluster domain.
 * All paths are canonical /api/v1/... form.
 * DESIGN_REFERENCE section Cluster Nodes - ops-resilience.md section 3
 */
import { http, API_V1 } from '@/api/http'
import type { ClusterNode } from '@/api/types/ops'

// GET /api/v1/cluster/nodes - list all registered cluster nodes
// Not tenant-scoped; operator-level endpoint.
export function listClusterNodes(signal?: AbortSignal): Promise<ClusterNode[]> {
  return http.get<ClusterNode[]>(`${API_V1}/cluster/nodes`, { signal })
}

// POST /api/v1/cluster/nodes/{id}/drain - signal a node to drain
// Sets drain=true; node stops claiming new work and finishes in-flight tasks.
export function drainNode(nodeId: string, signal?: AbortSignal): Promise<void> {
  return http.post<void>(
    `${API_V1}/cluster/nodes/${encodeURIComponent(nodeId)}/drain`,
    undefined,
    { signal },
  )
}
