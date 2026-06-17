/**
 * Typed endpoint functions for the Queues & Routing domain.
 * All paths are canonical /api/v1/… form.
 * DESIGN_REFERENCE §Queue Dispatch Config, §Queue Routing Rules
 */
import { http, API_V1 } from '@/api/http'
import { asItems } from '@/api/types/common'
import type {
  QueueDispatchConfig,
  QueueRoutingRule,
  SetDispatchRequest,
  ListDispatchQuery,
  CreateRoutingRuleRequest,
  ListRoutingRulesQuery,
} from '@/api/types/queues'

// POST /api/v1/queues/dispatch — create or update dispatch config (upsert by tenant+queue)
// DESIGN_REFERENCE §POST /queues/dispatch
export function setDispatch(body: SetDispatchRequest, signal?: AbortSignal): Promise<QueueDispatchConfig> {
  return http.post<QueueDispatchConfig>(`${API_V1}/queues/dispatch`, body, { signal })
}

// GET /api/v1/queues/dispatch — list dispatch configurations
// DESIGN_REFERENCE §GET /queues/dispatch
export async function listDispatch(
  query?: ListDispatchQuery,
  signal?: AbortSignal,
): Promise<QueueDispatchConfig[]> {
  const payload = await http.get<unknown>(`${API_V1}/queues/dispatch`, { query, signal })
  return asItems<QueueDispatchConfig>(payload)
}

// DELETE /api/v1/queues/dispatch/{tenant_id}/{queue_name}
// DESIGN_REFERENCE §DELETE /queues/dispatch/{tenant_id}/{queue_name}
export function deleteDispatch(
  tenantId: string,
  queueName: string,
  signal?: AbortSignal,
): Promise<void> {
  return http.del<void>(
    `${API_V1}/queues/dispatch/${encodeURIComponent(tenantId)}/${encodeURIComponent(queueName)}`,
    { signal },
  )
}

// POST /api/v1/routing-rules — create a routing rule
// DESIGN_REFERENCE §POST /routing-rules
export function createRoutingRule(
  body: CreateRoutingRuleRequest,
  signal?: AbortSignal,
): Promise<QueueRoutingRule> {
  return http.post<QueueRoutingRule>(`${API_V1}/routing-rules`, body, { signal })
}

// GET /api/v1/routing-rules — list routing rules
// DESIGN_REFERENCE §GET /routing-rules
export async function listRoutingRules(
  query?: ListRoutingRulesQuery,
  signal?: AbortSignal,
): Promise<QueueRoutingRule[]> {
  const payload = await http.get<unknown>(`${API_V1}/routing-rules`, { query, signal })
  return asItems<QueueRoutingRule>(payload)
}

// GET /api/v1/routing-rules/{id} — get a single routing rule
// DESIGN_REFERENCE §GET /routing-rules/{id}
export function getRoutingRule(id: string, signal?: AbortSignal): Promise<QueueRoutingRule> {
  return http.get<QueueRoutingRule>(`${API_V1}/routing-rules/${encodeURIComponent(id)}`, { signal })
}

// DELETE /api/v1/routing-rules/{id} — delete a routing rule
// DESIGN_REFERENCE §DELETE /routing-rules/{id}
export function deleteRoutingRule(id: string, signal?: AbortSignal): Promise<void> {
  return http.del<void>(`${API_V1}/routing-rules/${encodeURIComponent(id)}`, { signal })
}
