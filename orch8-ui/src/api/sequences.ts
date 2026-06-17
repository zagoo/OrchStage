/**
 * Typed endpoint functions for the Sequences domain.
 * All paths are canonical /api/v1/… form.
 * DESIGN_REFERENCE §Sequences (dag-sequences.md §9)
 */
import { http, API_V1 } from '@/api/http'
import { asItems } from '@/api/types/common'
import type {
  SequenceDefinition,
  CreateSequenceRequest,
  CreateSequenceResponse,
  ListSequencesQuery,
  ByNameQuery,
  SetStatusRequest,
  UnpublishRequest,
  PromoteResponse,
  PaginatedSequences,
} from '@/api/types/sequences'

// GET /api/v1/sequences — list sequences (paginated)
// DESIGN_REFERENCE §9.4 List Sequences
export function listSequences(
  query?: ListSequencesQuery,
  signal?: AbortSignal,
): Promise<PaginatedSequences> {
  return http.get<PaginatedSequences>(`${API_V1}/sequences`, { query, signal })
}

// GET /api/v1/sequences.json — plain array, no pagination, up to 1000 rows
// DESIGN_REFERENCE §9.5 List Sequences Array
export function listSequencesArray(signal?: AbortSignal): Promise<SequenceDefinition[]> {
  return http
    .get<unknown>(`${API_V1}/sequences.json`, { signal })
    .then((payload) => asItems<SequenceDefinition>(payload))
}

// GET /api/v1/sequences/by-name — look up a named sequence
// DESIGN_REFERENCE §9.3 Get Sequence by Name
export function getSequenceByName(
  query: ByNameQuery,
  signal?: AbortSignal,
): Promise<SequenceDefinition> {
  return http.get<SequenceDefinition>(`${API_V1}/sequences/by-name`, { query, signal })
}

// GET /api/v1/sequences/versions — all versions for a named sequence
// DESIGN_REFERENCE §9.6 List Sequence Versions
export function listSequenceVersions(
  query: ByNameQuery,
  signal?: AbortSignal,
): Promise<SequenceDefinition[]> {
  return http
    .get<unknown>(`${API_V1}/sequences/versions`, { query, signal })
    .then((payload) => asItems<SequenceDefinition>(payload))
}

// GET /api/v1/sequences/{id} — get one sequence by ID
// DESIGN_REFERENCE §9.2 Get Sequence by ID
export function getSequence(id: string, signal?: AbortSignal): Promise<SequenceDefinition> {
  return http.get<SequenceDefinition>(`${API_V1}/sequences/${encodeURIComponent(id)}`, { signal })
}

// POST /api/v1/sequences — create a new sequence
// DESIGN_REFERENCE §9.1 Create Sequence
export function createSequence(
  body: CreateSequenceRequest,
  signal?: AbortSignal,
): Promise<CreateSequenceResponse> {
  return http.post<CreateSequenceResponse>(`${API_V1}/sequences`, body, { signal })
}

// DELETE /api/v1/sequences/{id} — delete a sequence
// DESIGN_REFERENCE §9.7 Delete Sequence
export function deleteSequence(id: string, signal?: AbortSignal): Promise<void> {
  return http.del<void>(`${API_V1}/sequences/${encodeURIComponent(id)}`, { signal })
}

// POST /api/v1/sequences/{id}/deprecate — mark version deprecated
// DESIGN_REFERENCE §9.8 Deprecate Sequence
export function deprecateSequence(id: string, signal?: AbortSignal): Promise<void> {
  return http.post<void>(
    `${API_V1}/sequences/${encodeURIComponent(id)}/deprecate`,
    undefined,
    { signal },
  )
}

// POST /api/v1/sequences/{id}/status — set sequence status (state machine)
// DESIGN_REFERENCE §9.9 Set Sequence Status
export function setSequenceStatus(
  id: string,
  body: SetStatusRequest,
  signal?: AbortSignal,
): Promise<void> {
  return http.post<void>(
    `${API_V1}/sequences/${encodeURIComponent(id)}/status`,
    body,
    { signal },
  )
}

// POST /api/v1/sequences/{name}/promote — promote staging → production
// DESIGN_REFERENCE §9.11 Promote Sequence
export function promoteSequence(name: string, signal?: AbortSignal): Promise<PromoteResponse> {
  return http.post<PromoteResponse>(
    `${API_V1}/sequences/${encodeURIComponent(name)}/promote`,
    undefined,
    { signal },
  )
}

// POST /api/v1/sequences/{name}/unpublish — mark all versions unpublished
// DESIGN_REFERENCE §9.10 Unpublish Sequence
export function unpublishSequence(
  name: string,
  body: UnpublishRequest,
  signal?: AbortSignal,
): Promise<void> {
  return http.post<void>(
    `${API_V1}/sequences/${encodeURIComponent(name)}/unpublish`,
    body,
    { signal },
  )
}
