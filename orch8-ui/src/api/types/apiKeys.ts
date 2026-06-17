/**
 * API Keys domain types — Rust → TypeScript mapping.
 * Source: orch8-types/src/api_key.rs, orch8-api/src/api_keys.rs
 * DESIGN_REFERENCE §API-key management endpoints (auth-rbac.md §8)
 */
import type { IsoTimestamp } from './common'

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

/**
 * Full response on POST /api-keys — plaintext secret returned ONCE.
 * The server stores only the SHA-256 hash; this is the only moment the secret
 * is visible to a client. (api_key.rs:77–103)
 */
export interface CreatedApiKey {
  /** "ak_..." — public identifier used for listing and revocation. */
  id: string
  tenant_id: string
  name: string
  /** "sk_..." — plaintext secret. ONE-TIME ONLY. Never returned again. */
  secret: string
  created_at: IsoTimestamp
  expires_at: IsoTimestamp | null
}

/**
 * Metadata returned by GET /api-keys — secret and hash are never included.
 * (api_keys.rs:69–147)
 */
export interface ApiKeyInfo {
  /** "ak_..." — use for revocation. */
  id: string
  tenant_id: string
  name: string
  created_at: IsoTimestamp
  /** null if the key has never been used. */
  last_used_at: IsoTimestamp | null
  /** null = non-expiring. */
  expires_at: IsoTimestamp | null
  revoked: boolean
}

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

/**
 * POST /api-keys — create a new per-tenant API key.
 * Requires root / admin key. (api_keys.rs:44–128)
 */
export interface CreateApiKeyRequest {
  /** Required; must be non-empty (trimmed). */
  tenant_id: string
  /** Optional human label; defaults to "" on the server. */
  name?: string
  /** Optional ISO 8601 UTC datetime; omit for a non-expiring key. */
  expires_at?: string | null
}

/**
 * GET /api-keys query parameters.
 * tenant_id is required by the server. (api_keys.rs:69–90)
 */
export interface ListApiKeysQuery {
  tenant_id: string
}
