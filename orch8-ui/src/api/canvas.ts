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
} from '@/api/sequences'
import { listInstances, getExecutionTree } from '@/api/instances'
import type { SequenceDefinition, CreateSequenceRequest, ListSequencesQuery } from '@/api/types/sequences'
import type { ExecutionNode, ListInstancesQuery, TaskInstance } from '@/api/types/instances'

// Re-export for convenience so canvas components import from one place.
export {
  listSequences,
  getSequence,
  listSequenceVersions,
  createSequence,
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
