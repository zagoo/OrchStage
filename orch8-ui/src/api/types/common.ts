/**
 * Shared scalar + envelope types used across every domain module.
 * Rust → TS mapping: Uuid → string, DateTime<Utc> → ISO string, i64 → number,
 * serde_json::Value → Json (unknown).
 */
export type Uuid = string
export type IsoTimestamp = string
export type Json = unknown
export type JsonObject = Record<string, unknown>

/** A tenant-scoped resource always carries these. */
export interface TenantScoped {
  tenant_id: string
  namespace?: string
}

/** Common list/pagination query parameters (see filter.rs conventions). */
export interface ListQuery {
  limit?: number
  offset?: number
  cursor?: string
}

/** Some list endpoints return a bare array; others wrap with a cursor. */
export interface Page<T> {
  items: T[]
  next_cursor?: string | null
  total?: number | null
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrow an unknown list payload into `T[]` regardless of wrapper shape. */
export function asItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (isJsonObject(payload) && Array.isArray(payload.items)) return payload.items as T[]
  return []
}
