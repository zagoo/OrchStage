/**
 * Plugins domain types — Rust → TypeScript mapping.
 * Source: orch8-types/src/plugin.rs, orch8-api/src/plugins.rs
 * DESIGN_REFERENCE §Plugins (resources.md)
 *
 * Unlike credentials, plugin definitions contain no secret material.
 * All fields are returned in full on every read operation.
 */
import type { IsoTimestamp, Json } from './common'

// --- enums -------------------------------------------------------------------

/**
 * Plugin type enum. Marked #[non_exhaustive] in Rust — future types possible.
 * Serialized as snake_case. (plugin.rs:10)
 *
 * - wasm: WebAssembly module; source is a file path to a .wasm file
 * - grpc: gRPC endpoint; source is host:port/Service.Method
 */
export type PluginType = 'wasm' | 'grpc'

// --- response shapes ---------------------------------------------------------

/**
 * Full plugin definition returned by all plugin read/write operations.
 * No fields are redacted.
 * DESIGN_REFERENCE §GET /api/v1/plugins
 */
export interface PluginDef {
  name: string
  plugin_type: PluginType
  /** File path (.wasm) or gRPC endpoint (host:port/Service.Method). Max 2048 chars. */
  source: string
  tenant_id: string
  enabled: boolean
  /** Freeform JSON plugin-specific configuration. Defaults to null. */
  config: Json
  description: string | null
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

// --- request shapes ----------------------------------------------------------

/**
 * POST /api/v1/plugins — register a new plugin.
 * Business rules:
 * - name: non-empty; max 255 chars; used as handler name prefix (wasm://name, grpc://name)
 * - plugin_type: required; no default
 * - source: non-empty; max 2048 chars
 */
export interface CreatePluginRequest {
  name: string
  plugin_type: PluginType
  source: string
  tenant_id?: string
  config?: Json
  description?: string | null
}

/**
 * PATCH /api/v1/plugins/{name} — partial update.
 * NOTE: name and plugin_type CANNOT be changed via PATCH.
 * To rename or retype a plugin, delete and recreate it.
 * All fields optional; absent fields are not modified.
 */
export interface UpdatePluginRequest {
  source?: string
  enabled?: boolean
  config?: Json
  description?: string
}

/** Query params for GET /api/v1/plugins */
export interface PluginQuery {
  tenant_id?: string
}
