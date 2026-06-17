/**
 * Typed endpoint functions for the Triggers domain.
 * All paths are canonical /api/v1/… form.
 * DESIGN_REFERENCE §Triggers
 */
import { http, API_V1 } from '@/api/http'
import type {
  TriggerDef,
  CreateTriggerRequest,
  TriggerQuery,
  FireTriggerBody,
  FireTriggerResponse,
} from '@/api/types/triggers'

// GET /api/v1/triggers — List Triggers
export function listTriggers(query?: TriggerQuery, signal?: AbortSignal): Promise<TriggerDef[]> {
  return http.get<TriggerDef[]>(`${API_V1}/triggers`, { query, signal })
}

// POST /api/v1/triggers — Create Trigger
export function createTrigger(body: CreateTriggerRequest, signal?: AbortSignal): Promise<TriggerDef> {
  return http.post<TriggerDef>(`${API_V1}/triggers`, body, { signal })
}

// GET /api/v1/triggers/{slug} — Get Trigger
export function getTrigger(slug: string, signal?: AbortSignal): Promise<TriggerDef> {
  return http.get<TriggerDef>(`${API_V1}/triggers/${encodeURIComponent(slug)}`, { signal })
}

// DELETE /api/v1/triggers/{slug} — Delete Trigger
export function deleteTrigger(slug: string, signal?: AbortSignal): Promise<void> {
  return http.del<void>(`${API_V1}/triggers/${encodeURIComponent(slug)}`, { signal })
}

// POST /api/v1/triggers/{slug}/fire — Fire Trigger
export function fireTrigger(
  slug: string,
  body: FireTriggerBody,
  triggerSecret?: string | null,
  signal?: AbortSignal,
): Promise<FireTriggerResponse> {
  const headers: Record<string, string> = {}
  if (triggerSecret) headers['X-Trigger-Secret'] = triggerSecret
  return http.post<FireTriggerResponse>(
    `${API_V1}/triggers/${encodeURIComponent(slug)}/fire`,
    body,
    { signal, headers },
  )
}
