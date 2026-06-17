/**
 * Typed endpoint functions for the Credentials domain.
 * All paths use the canonical /api/v1/… form.
 * DESIGN_REFERENCE §Credentials (resources.md, inventory.md §2.13)
 *
 * SECURITY: Credential values are write-only. Secret fields are NEVER returned
 * by the API. CredentialResponse has no value or refresh_token fields.
 */
import { http, API_V1 } from '@/api/http'
import type {
  CredentialResponse,
  CreateCredentialRequest,
  UpdateCredentialRequest,
  CredentialQuery,
} from '@/api/types/credentials'

// GET /api/v1/credentials — List credentials (metadata only, no secrets)
export function listCredentials(
  query?: CredentialQuery,
  signal?: AbortSignal,
): Promise<CredentialResponse[]> {
  return http.get<CredentialResponse[]>(`${API_V1}/credentials`, { query, signal })
}

// POST /api/v1/credentials — Create a credential (secret stored, never returned)
export function createCredential(
  body: CreateCredentialRequest,
  signal?: AbortSignal,
): Promise<CredentialResponse> {
  return http.post<CredentialResponse>(`${API_V1}/credentials`, body, { signal })
}

// GET /api/v1/credentials/{id} — Get credential metadata (no secret)
export function getCredential(id: string, signal?: AbortSignal): Promise<CredentialResponse> {
  return http.get<CredentialResponse>(`${API_V1}/credentials/${encodeURIComponent(id)}`, { signal })
}

// PATCH /api/v1/credentials/{id} — Partial update (can rotate secret via value field)
export function updateCredential(
  id: string,
  body: UpdateCredentialRequest,
  signal?: AbortSignal,
): Promise<CredentialResponse> {
  return http.patch<CredentialResponse>(
    `${API_V1}/credentials/${encodeURIComponent(id)}`,
    body,
    { signal },
  )
}

// DELETE /api/v1/credentials/{id} — Delete credential permanently
// WARNING: Any step referencing credentials://<id> will fail after deletion.
export function deleteCredential(id: string, signal?: AbortSignal): Promise<void> {
  return http.del<void>(`${API_V1}/credentials/${encodeURIComponent(id)}`, { signal })
}
