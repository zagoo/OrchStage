/**
 * Typed endpoint functions for the Plugins domain.
 * All paths use the canonical /api/v1/… form.
 * DESIGN_REFERENCE §Plugins (resources.md, inventory.md §2.22)
 *
 * Unlike credentials, plugin definitions contain no secret material.
 * Full PluginDef is returned on all read/write operations.
 */
import { http, API_V1 } from '@/api/http'
import type {
  PluginDef,
  CreatePluginRequest,
  UpdatePluginRequest,
  PluginQuery,
} from '@/api/types/plugins'

// GET /api/v1/plugins — List plugins (no limit param; all matching returned)
export function listPlugins(query?: PluginQuery, signal?: AbortSignal): Promise<PluginDef[]> {
  return http.get<PluginDef[]>(`${API_V1}/plugins`, { query, signal })
}

// POST /api/v1/plugins — Register a new plugin
export function createPlugin(body: CreatePluginRequest, signal?: AbortSignal): Promise<PluginDef> {
  return http.post<PluginDef>(`${API_V1}/plugins`, body, { signal })
}

// GET /api/v1/plugins/{name} — Get a single plugin by name
export function getPlugin(name: string, signal?: AbortSignal): Promise<PluginDef> {
  return http.get<PluginDef>(`${API_V1}/plugins/${encodeURIComponent(name)}`, { signal })
}

// PATCH /api/v1/plugins/{name} — Partial update
// NOTE: name and plugin_type cannot be changed; delete + recreate to rename/retype.
export function updatePlugin(
  name: string,
  body: UpdatePluginRequest,
  signal?: AbortSignal,
): Promise<PluginDef> {
  return http.patch<PluginDef>(
    `${API_V1}/plugins/${encodeURIComponent(name)}`,
    body,
    { signal },
  )
}

// DELETE /api/v1/plugins/{name} — Delete a plugin
// WARNING: Steps referencing wasm://<name> or grpc://<name> will fail after deletion.
export function deletePlugin(name: string, signal?: AbortSignal): Promise<void> {
  return http.del<void>(`${API_V1}/plugins/${encodeURIComponent(name)}`, { signal })
}
