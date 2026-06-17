/**
 * Typed endpoint functions for the Sessions domain.
 * All paths are canonical /api/v1/… form.
 * DESIGN_REFERENCE §Sessions (human-sessions-stream.md §2, inventory.md §2.9)
 */
import { http, API_V1 } from '@/api/http'
import type {
  Session,
  CreateSessionRequest,
  UpdateSessionDataRequest,
  UpdateSessionStateRequest,
  TaskInstance,
} from '@/api/types/sessions'

// POST /api/v1/sessions — Create a session
// Source: sessions.rs:50-66, inventory.md §2.9
export function createSession(body: CreateSessionRequest, signal?: AbortSignal): Promise<Session> {
  return http.post<Session>(`${API_V1}/sessions`, body, { signal })
}

// GET /api/v1/sessions/{id} — Get session by ID
// Source: sessions.rs, inventory.md §2.9
export function getSession(id: string, signal?: AbortSignal): Promise<Session> {
  return http.get<Session>(`${API_V1}/sessions/${encodeURIComponent(id)}`, { signal })
}

// GET /api/v1/sessions/by-key/{tenant_id}/{key} — Get session by key
// tenant_id max 128 chars (sessions.rs:110-114). Returns 400 if exceeded.
// Source: sessions.rs, inventory.md §2.9
export function getSessionByKey(
  tenantId: string,
  key: string,
  signal?: AbortSignal,
): Promise<Session> {
  return http.get<Session>(
    `${API_V1}/sessions/by-key/${encodeURIComponent(tenantId)}/${encodeURIComponent(key)}`,
    { signal },
  )
}

// PATCH /api/v1/sessions/{id}/data — Replace session data (full replacement, not merge)
// Source: sessions.rs:141-159, inventory.md §2.9
export function updateSessionData(
  id: string,
  body: UpdateSessionDataRequest,
  signal?: AbortSignal,
): Promise<void> {
  return http.patch<void>(`${API_V1}/sessions/${encodeURIComponent(id)}/data`, body, { signal })
}

// PATCH /api/v1/sessions/{id}/state — Transition session state
// No API-layer transition validation; any SessionState value is accepted.
// Source: sessions.rs, inventory.md §2.9
export function updateSessionState(
  id: string,
  body: UpdateSessionStateRequest,
  signal?: AbortSignal,
): Promise<void> {
  return http.patch<void>(`${API_V1}/sessions/${encodeURIComponent(id)}/state`, body, { signal })
}

// GET /api/v1/sessions/{id}/instances — List instances linked to a session
// Returns unbounded TaskInstance[]; no pagination params available.
// Source: sessions.rs, inventory.md §2.9
export function listSessionInstances(id: string, signal?: AbortSignal): Promise<TaskInstance[]> {
  return http.get<TaskInstance[]>(`${API_V1}/sessions/${encodeURIComponent(id)}/instances`, {
    signal,
  })
}
