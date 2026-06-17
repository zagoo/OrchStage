/**
 * Typed endpoint functions for Instance Detail advanced operations.
 * DO NOT modify src/api/instances.ts — new endpoints live here only.
 * All paths are canonical /api/v1/… form.
 * DESIGN_REFERENCE §Instances — instances-advanced.md
 */
import { http, API_V1, rawFetch } from '@/api/http'
import { asItems } from '@/api/types/common'
import type {
  ForkRequest,
  ForkResponse,
  InjectBlocksRequest,
  InjectBlocksResponse,
  Checkpoint,
  SaveCheckpointRequest,
  SaveCheckpointResponse,
  PruneCheckpointsRequest,
  PruneCheckpointsResponse,
  TimelineQuery,
  TimelineResponse,
  BlockOutput,
  ListArtifactsResponse,
  ArtifactMeta,
  StepLog,
  AuditLogEntry,
} from '@/api/types/instancesAdvanced'

// --- Fork --------------------------------------------------------------------
// POST /api/v1/instances/{id}/fork — Clone instance from a block
// DESIGN_REFERENCE §Instances §Fork Instance
export function forkInstance(
  id: string,
  body: ForkRequest,
  signal?: AbortSignal,
): Promise<ForkResponse> {
  return http.post<ForkResponse>(
    `${API_V1}/instances/${encodeURIComponent(id)}/fork`,
    body,
    { signal },
  )
}

// --- Inject Blocks -----------------------------------------------------------
// POST /api/v1/instances/{id}/inject-blocks — Dynamically inject blocks
// DESIGN_REFERENCE §Instances §Inject Blocks
export function injectBlocks(
  id: string,
  body: InjectBlocksRequest,
  signal?: AbortSignal,
): Promise<InjectBlocksResponse> {
  return http.post<InjectBlocksResponse>(
    `${API_V1}/instances/${encodeURIComponent(id)}/inject-blocks`,
    body,
    { signal },
  )
}

// --- Checkpoints -------------------------------------------------------------
// POST /api/v1/instances/{id}/checkpoints — Save checkpoint
// DESIGN_REFERENCE §Instances §Checkpoints
export function saveCheckpoint(
  id: string,
  body: SaveCheckpointRequest,
  signal?: AbortSignal,
): Promise<SaveCheckpointResponse> {
  return http.post<SaveCheckpointResponse>(
    `${API_V1}/instances/${encodeURIComponent(id)}/checkpoints`,
    body,
    { signal },
  )
}

// GET /api/v1/instances/{id}/checkpoints — List checkpoints (newest-first, cap 100)
// DESIGN_REFERENCE §Instances §Checkpoints
export function listCheckpoints(id: string, signal?: AbortSignal): Promise<Checkpoint[]> {
  return http.get<Checkpoint[]>(
    `${API_V1}/instances/${encodeURIComponent(id)}/checkpoints`,
    { signal },
  ).then(asItems<Checkpoint>)
}

// GET /api/v1/instances/{id}/checkpoints/latest — Get latest checkpoint
// DESIGN_REFERENCE §Instances §Checkpoints
export function getLatestCheckpoint(id: string, signal?: AbortSignal): Promise<Checkpoint> {
  return http.get<Checkpoint>(
    `${API_V1}/instances/${encodeURIComponent(id)}/checkpoints/latest`,
    { signal },
  )
}

// POST /api/v1/instances/{id}/checkpoints/prune — Delete old checkpoints
// DESIGN_REFERENCE §Instances §Checkpoints
export function pruneCheckpoints(
  id: string,
  body: PruneCheckpointsRequest,
  signal?: AbortSignal,
): Promise<PruneCheckpointsResponse> {
  return http.post<PruneCheckpointsResponse>(
    `${API_V1}/instances/${encodeURIComponent(id)}/checkpoints/prune`,
    body,
    { signal },
  )
}

// --- Timeline ----------------------------------------------------------------
// GET /api/v1/instances/{id}/timeline — Flat chronological execution view
// DESIGN_REFERENCE §Instances §Timeline
export function getTimeline(
  id: string,
  query?: TimelineQuery,
  signal?: AbortSignal,
): Promise<TimelineResponse> {
  return http.get<TimelineResponse>(
    `${API_V1}/instances/${encodeURIComponent(id)}/timeline`,
    { query, signal },
  )
}

// --- Outputs -----------------------------------------------------------------
// GET /api/v1/instances/{id}/outputs — Block outputs (sentinel rows stripped)
// DESIGN_REFERENCE §Instances §Outputs
export function getOutputs(id: string, signal?: AbortSignal): Promise<BlockOutput[]> {
  return http.get<BlockOutput[]>(
    `${API_V1}/instances/${encodeURIComponent(id)}/outputs`,
    { signal },
  ).then(asItems<BlockOutput>)
}

// --- Artifacts ---------------------------------------------------------------
// GET /api/v1/instances/{id}/artifacts — List artifact metadata
// DESIGN_REFERENCE §Instances §Artifacts
export function listArtifacts(id: string, signal?: AbortSignal): Promise<ArtifactMeta[]> {
  return http.get<ListArtifactsResponse>(
    `${API_V1}/instances/${encodeURIComponent(id)}/artifacts`,
    { signal },
  ).then((r) => (r as ListArtifactsResponse)?.items ?? [])
}

// GET /api/v1/artifacts/{*key} — Download artifact bytes (raw, no JSON wrapper)
// DESIGN_REFERENCE §Instances §Artifacts
export function getArtifactDownloadUrl(key: string, contentType?: string): string {
  // Returns a URL suitable for <a href> download or window.open.
  // rawFetch is used for streaming, but for download links we construct the URL
  // so the browser handles the streaming itself.
  const params = contentType ? `?content_type=${encodeURIComponent(contentType)}` : ''
  return `${API_V1}/artifacts/${key}${params}`
}

/**
 * Stream artifact bytes via rawFetch (auth headers included).
 * Caller gets the raw Response to consume as a Blob/stream.
 */
export function fetchArtifactBytes(key: string, contentType?: string): Promise<Response> {
  const params = contentType ? `?content_type=${encodeURIComponent(contentType)}` : ''
  return rawFetch(`${API_V1}/artifacts/${key}${params}`)
}

// --- Step Logs ---------------------------------------------------------------
// GET /api/v1/instances/{id}/logs — Step logs (oldest-first, no pagination)
// DESIGN_REFERENCE §Instances §Step Logs
export function getInstanceLogs(id: string, signal?: AbortSignal): Promise<StepLog[]> {
  return http.get<StepLog[]>(
    `${API_V1}/instances/${encodeURIComponent(id)}/logs`,
    { signal },
  ).then(asItems<StepLog>)
}

// --- Audit Log ---------------------------------------------------------------
// GET /api/v1/instances/{id}/audit — Audit entries (newest-first, cap 200)
// DESIGN_REFERENCE §Instances §Audit Log
export function listAuditLog(id: string, signal?: AbortSignal): Promise<AuditLogEntry[]> {
  return http.get<AuditLogEntry[]>(
    `${API_V1}/instances/${encodeURIComponent(id)}/audit`,
    { signal },
  ).then(asItems<AuditLogEntry>)
}

// --- SSE Stream --------------------------------------------------------------
// The stream endpoint is consumed via openEventStream from @/api/sse.
// Path helper for callers:
export function instanceStreamPath(id: string, pollMs?: number): string {
  const q = pollMs != null ? `?poll_ms=${pollMs}` : ''
  return `${API_V1}/instances/${encodeURIComponent(id)}/stream${q}`
}
