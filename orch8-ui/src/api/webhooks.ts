/**
 * Typed endpoint functions for the Webhook Outbox domain (operator/admin endpoints).
 * Public inbound webhook (POST /webhooks/{slug}) is not in scope here — it has no API key auth.
 * All paths are canonical /api/v1/… form.
 * DESIGN_REFERENCE §Webhook Outbox — ops-resilience.md §5
 */
import { http, API_V1 } from '@/api/http'
import type { WebhookOutboxEntry, RedeliverResponse, ListOutboxQuery } from '@/api/types/ops'

// GET /api/v1/webhooks/outbox — list parked webhook deliveries (newest first)
export function listWebhookOutbox(
  query?: ListOutboxQuery,
  signal?: AbortSignal,
): Promise<WebhookOutboxEntry[]> {
  return http.get<WebhookOutboxEntry[]>(`${API_V1}/webhooks/outbox`, { query, signal })
}

// POST /api/v1/webhooks/outbox/{id}/redeliver — attempt to redeliver a parked delivery
// On success, the row is removed. On failure, 502 is returned and the row is kept.
export function redeliverOutbox(id: string, signal?: AbortSignal): Promise<RedeliverResponse> {
  return http.post<RedeliverResponse>(
    `${API_V1}/webhooks/outbox/${encodeURIComponent(id)}/redeliver`,
    undefined,
    { signal },
  )
}

// DELETE /api/v1/webhooks/outbox/{id} — permanently discard a parked delivery
export function discardOutbox(id: string, signal?: AbortSignal): Promise<void> {
  return http.del<void>(`${API_V1}/webhooks/outbox/${encodeURIComponent(id)}`, { signal })
}
