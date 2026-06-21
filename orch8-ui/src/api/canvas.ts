/**
 * Canvas domain API functions.
 * Reuses sequences + instances modules; adds no new HTTP endpoints beyond what
 * is already covered by those modules (per DESIGN_REFERENCE §inventory.md §2.2
 * and §2.3).
 *
 * Covered endpoints:
 *   GET  /api/v1/sequences               — list sequences for picker
 *   GET  /api/v1/sequences/{id}          — load full definition for canvas
 *   GET  /api/v1/sequences/versions      — list all versions for a sequence
 *   POST /api/v1/sequences               — save a new sequence version (canvas Save)
 *   GET  /api/v1/instances               — list instances for overlay picker
 *   GET  /api/v1/instances/{id}/tree     — live execution tree for state overlay
 *
 * DESIGN_REFERENCE §dag-sequences.md §9, §instances-core.md
 */
import {
  listSequences,
  getSequence,
  listSequenceVersions,
  createSequence,
  deleteSequence,
} from '@/api/sequences'
import { listInstances, getExecutionTree } from '@/api/instances'
import { genUuid } from '@/lib/uuid'
import type { SequenceDefinition, CreateSequenceRequest, ListSequencesQuery } from '@/api/types/sequences'
import type { ExecutionNode, ListInstancesQuery, TaskInstance } from '@/api/types/instances'

// Re-export for convenience so canvas components import from one place.
export {
  listSequences,
  getSequence,
  listSequenceVersions,
  createSequence,
  deleteSequence,
  listInstances,
  getExecutionTree,
}

// --- canvas-specific wrappers ------------------------------------------------

/**
 * List sequences for the sequence picker.
 * Returns up to 200 rows (default); callers may override with query.
 * GET /api/v1/sequences — DESIGN_REFERENCE §dag-sequences.md §9.4
 */
export function listSequencesForPicker(
  query?: ListSequencesQuery,
  signal?: AbortSignal,
) {
  return listSequences({ limit: 200, ...query }, signal)
}

/**
 * List non-terminal instances for the live-state overlay picker.
 * Returns the most recent 100 instances for the given sequence.
 * GET /api/v1/instances — DESIGN_REFERENCE §instances-core.md §3
 */
export function listInstancesForSequence(
  sequenceId: string,
  query?: ListInstancesQuery,
  signal?: AbortSignal,
): Promise<TaskInstance[]> {
  return listInstances({ sequence_id: sequenceId, limit: 100, ...query }, signal)
}

/**
 * Fetch the execution tree for live state overlay.
 * GET /api/v1/instances/{id}/tree — DESIGN_REFERENCE §instances-core.md §inventory §2.3
 */
export function fetchExecutionTree(instanceId: string, signal?: AbortSignal): Promise<ExecutionNode[]> {
  return getExecutionTree(instanceId, signal)
}

/**
 * Save an edited sequence as a new version.
 * POST /api/v1/sequences — DESIGN_REFERENCE §dag-sequences.md §9.1
 */
export function saveSequenceVersion(
  body: CreateSequenceRequest,
  signal?: AbortSignal,
) {
  return createSequence(body, signal)
}

/** How a Save was persisted, derived from the sequence's current status. */
export type SaveMode = 'overwrite' | 'new-version'

export interface PersistResult {
  mode: SaveMode
  /** Exactly what now lives on the server (id + version reflect the chosen mode). */
  saved: SequenceDefinition
  warnings?: string[]
}

/**
 * Persist canvas edits, choosing HOW from the sequence's status:
 *
 *  - production → FORK a new version. The server's primary key is `sequences.id`,
 *    so the new row MUST get a FRESH id — reusing it returns 409 "UNIQUE
 *    constraint failed: sequences.id" (the reported production-save bug). The live
 *    production version is left intact.
 *  - draft | staging | unpublished → OVERWRITE in place at the SAME id + version.
 *    The server exposes no PUT/upsert, so overwrite = DELETE the row then re-create
 *    it. On a failed re-create we restore `original` so a transient error never
 *    strands the user with a deleted sequence.
 *
 * Verified against the live server (DESIGN_REFERENCE §dag-sequences.md §9.1).
 */
export async function persistSequenceEdit(
  edited: SequenceDefinition,
  original: SequenceDefinition,
  signal?: AbortSignal,
): Promise<PersistResult> {
  const now = new Date().toISOString()

  if (edited.status === 'production') {
    const saved: SequenceDefinition = { ...edited, id: genUuid(), version: edited.version + 1, created_at: now }
    const res = await createSequence(saved, signal)
    return { mode: 'new-version', saved: { ...saved, id: res.id }, warnings: res.warnings }
  }

  const saved: SequenceDefinition = { ...edited, created_at: now }
  await deleteSequence(edited.id, signal)
  try {
    const res = await createSequence(saved, signal)
    return { mode: 'overwrite', saved: { ...saved, id: res.id }, warnings: res.warnings }
  } catch (e) {
    // Best-effort restore so a failed overwrite never loses the sequence.
    await createSequence(original, signal).catch(() => {})
    throw e
  }
}

/**
 * Export a SequenceDefinition as a JSON blob download.
 * Pure client-side — no HTTP call.
 */
export function exportSequenceAsJson(seq: SequenceDefinition): void {
  const blob = new Blob([JSON.stringify(seq, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${seq.name}-v${seq.version}.json`
  a.click()
  URL.revokeObjectURL(url)
}
