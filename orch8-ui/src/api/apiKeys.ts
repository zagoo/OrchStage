/**
 * Typed endpoint functions for the API Keys domain.
 *
 * Auth: ALL three endpoints require the root/admin key. Per-tenant keys
 * receive 403 Forbidden. The UI shows a notice for non-admin connections but
 * still allows attempts — the server enforces authoritatively.
 *
 * Mount point: the routes are registered at /api-keys (not /api/v1/api-keys)
 * per the inventory note "mounted at both /api-keys and (legacy) /api-keys …
 * without an /api/v1 prefix check". We use the root path directly.
 *
 * DESIGN_REFERENCE §API-key management endpoints (auth-rbac.md §8, inventory.md §2.14)
 */
import { http } from '@/api/http'
import type { ApiKeyInfo, CreatedApiKey, CreateApiKeyRequest, ListApiKeysQuery } from '@/api/types/apiKeys'

const BASE = '/api-keys'

// GET /api-keys?tenant_id={tenant_id} — List API keys
// Requires root key. Returns metadata only — never the secret.
export function listApiKeys(query: ListApiKeysQuery, signal?: AbortSignal): Promise<ApiKeyInfo[]> {
  return http.get<ApiKeyInfo[]>(BASE, { query, signal })
}

// POST /api-keys — Create API key
// Requires root key. Returns CreatedApiKey including plaintext secret (one-time only).
export function createApiKey(body: CreateApiKeyRequest, signal?: AbortSignal): Promise<CreatedApiKey> {
  return http.post<CreatedApiKey>(BASE, body, { signal })
}

// DELETE /api-keys/{id} — Revoke (delete) an API key
// Requires root key. Returns 204 No Content on success. 404 if not found.
export function revokeApiKey(id: string, signal?: AbortSignal): Promise<void> {
  return http.del<void>(`${BASE}/${encodeURIComponent(id)}`, { signal })
}
