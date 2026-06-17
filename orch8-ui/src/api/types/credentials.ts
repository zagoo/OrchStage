/**
 * Credentials domain types — Rust → TypeScript mapping.
 * Source: orch8-types/src/credential.rs, orch8-api/src/credentials.rs
 * DESIGN_REFERENCE §Credentials (resources.md)
 *
 * CRITICAL: Secret material (value, refresh_token) is NEVER returned by the API.
 * The CredentialResponse type has no value field by design (compile-time guarantee).
 */
import type { IsoTimestamp } from './common'

// --- enums -------------------------------------------------------------------

/**
 * Credential kind — determines expected shape of the write-only `value` field.
 * Serialized as snake_case. (credential.rs:22)
 *
 * Value field shapes by kind:
 * - api_key:  {"token": "..."}
 * - oauth2:   {"access_token": "...", "refresh_token": "..."}
 * - basic:    {"username": "...", "password": "..."}
 */
export type CredentialKind = 'api_key' | 'oauth2' | 'basic'

// --- response shapes ---------------------------------------------------------

/**
 * Credential metadata returned by all credential read endpoints.
 * SECRET FIELDS value AND refresh_token ARE NEVER PRESENT.
 * Use has_refresh_token boolean to indicate presence.
 * DESIGN_REFERENCE §GET /api/v1/credentials
 */
export interface CredentialResponse {
  id: string
  tenant_id: string
  name: string
  kind: CredentialKind
  enabled: boolean
  expires_at: string | null
  refresh_url: string | null
  /** true if a refresh token is stored; the token value itself is never returned. */
  has_refresh_token: boolean
  description: string | null
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

// --- request shapes ----------------------------------------------------------

/**
 * POST /api/v1/credentials — create a credential.
 * Business rules:
 * - id: non-empty; max 255 chars; [a-zA-Z0-9-_.] only (URL-safe for credentials:// URI)
 * - name: non-empty
 * - value: write-only; never returned; JSON-encoded secret
 * - oauth2 with refresh_url set MUST also have refresh_token (credentials.rs:161)
 */
export interface CreateCredentialRequest {
  id: string
  name: string
  kind?: CredentialKind
  /** Write-only. JSON-encoded secret. Shape depends on kind. NEVER returned. */
  value: string
  tenant_id?: string
  expires_at?: string | null
  refresh_url?: string | null
  /** Write-only. Required for oauth2 when refresh_url is set. NEVER returned. */
  refresh_token?: string | null
  description?: string | null
}

/**
 * PATCH /api/v1/credentials/{id} — partial update.
 * All fields optional; absent fields are not modified.
 * Note: value and refresh_token are write-only and never echoed.
 */
export interface UpdateCredentialRequest {
  name?: string
  kind?: CredentialKind
  /** Write-only. Replaces stored secret. NEVER returned. */
  value?: string
  expires_at?: string
  refresh_url?: string
  /** Write-only. Replaces OAuth2 refresh token. NEVER returned. */
  refresh_token?: string
  enabled?: boolean
  description?: string
}

/** Query params for GET /api/v1/credentials */
export interface CredentialQuery {
  tenant_id?: string
  limit?: number
}
