/**
 * Typed endpoint functions for the Instances domain.
 * All paths are canonical /api/v1/… form.
 * DESIGN_REFERENCE §Instances — instances-core.md
 */
import { http, API_V1 } from '@/api/http'
import { asItems } from '@/api/types/common'
import type {
  TaskInstance,
  CreateInstanceRequest,
  CreateInstanceResponse,
  BatchCreateRequest,
  BatchCreateResponse,
  ListInstancesQuery,
  UpdateStateRequest,
  UpdateContextRequest,
  RetryResponse,
  ResumeFromRequest,
  ResumeFromResponse,
  SendSignalRequest,
  SendSignalResponse,
  BulkUpdateStateRequest,
  BulkUpdateStateResponse,
  BulkRescheduleRequest,
  BulkRescheduleResponse,
  BatchActionRequest,
  BatchActionResponse,
  ListDlqQuery,
  ExecutionNode,
} from '@/api/types/instances'

// GET /api/v1/instances — List instances with filters & pagination
// DESIGN_REFERENCE §Instances §3 List Instances
export function listInstances(query?: ListInstancesQuery, signal?: AbortSignal): Promise<TaskInstance[]> {
  return http.get<TaskInstance[] | { items: TaskInstance[] }>(`${API_V1}/instances`, { query, signal })
    .then(asItems<TaskInstance>)
}

// POST /api/v1/instances — Create a single instance
// DESIGN_REFERENCE §Instances §1 Create Instance
export function createInstance(
  body: CreateInstanceRequest,
  signal?: AbortSignal,
): Promise<CreateInstanceResponse> {
  return http.post<CreateInstanceResponse>(`${API_V1}/instances`, body, { signal })
}

// POST /api/v1/instances/batch — Create multiple instances atomically
// DESIGN_REFERENCE §Instances §2 Create Instances Batch
export function createInstancesBatch(
  body: BatchCreateRequest,
  signal?: AbortSignal,
): Promise<BatchCreateResponse> {
  return http.post<BatchCreateResponse>(`${API_V1}/instances/batch`, body, { signal })
}

// GET /api/v1/instances/{id} — Get a single instance
// DESIGN_REFERENCE §Instances §4 Get Instance
export function getInstance(id: string, signal?: AbortSignal): Promise<TaskInstance> {
  return http.get<TaskInstance>(`${API_V1}/instances/${encodeURIComponent(id)}`, { signal })
}

// GET /api/v1/instances/{id}/children — Get child instances
// DESIGN_REFERENCE §Instances §5 Get Instance Children
export function getInstanceChildren(id: string, signal?: AbortSignal): Promise<TaskInstance[]> {
  return http.get<TaskInstance[]>(`${API_V1}/instances/${encodeURIComponent(id)}/children`, { signal })
    .then(asItems<TaskInstance>)
}

// PATCH /api/v1/instances/{id}/state — Update instance state
// DESIGN_REFERENCE §Instances §7 Update Instance State
export function updateInstanceState(
  id: string,
  body: UpdateStateRequest,
  signal?: AbortSignal,
): Promise<void> {
  return http.patch<void>(`${API_V1}/instances/${encodeURIComponent(id)}/state`, body, { signal })
}

// PATCH /api/v1/instances/{id}/context — Update instance context
// DESIGN_REFERENCE §Instances §8 Update Instance Context
export function updateInstanceContext(
  id: string,
  body: UpdateContextRequest,
  signal?: AbortSignal,
): Promise<void> {
  return http.patch<void>(`${API_V1}/instances/${encodeURIComponent(id)}/context`, body, { signal })
}

// POST /api/v1/instances/{id}/retry — Retry a failed instance
// DESIGN_REFERENCE §Instances §9 Retry Instance
export function retryInstance(id: string, signal?: AbortSignal): Promise<RetryResponse> {
  return http.post<RetryResponse>(`${API_V1}/instances/${encodeURIComponent(id)}/retry`, {}, { signal })
}

// POST /api/v1/instances/{id}/resume-from/{block_id} — Resume from a specific block
// DESIGN_REFERENCE §Instances §10 Resume From Block
export function resumeFromBlock(
  id: string,
  blockId: string,
  body: ResumeFromRequest,
  signal?: AbortSignal,
): Promise<ResumeFromResponse> {
  return http.post<ResumeFromResponse>(
    `${API_V1}/instances/${encodeURIComponent(id)}/resume-from/${encodeURIComponent(blockId)}`,
    body,
    { signal },
  )
}

// POST /api/v1/instances/{id}/signals — Send a signal to an instance
// DESIGN_REFERENCE §Instances §11 Send Signal
export function sendSignal(
  id: string,
  body: SendSignalRequest,
  signal?: AbortSignal,
): Promise<SendSignalResponse> {
  return http.post<SendSignalResponse>(
    `${API_V1}/instances/${encodeURIComponent(id)}/signals`,
    body,
    { signal },
  )
}

// PATCH /api/v1/instances/bulk/state — Bulk update instance states
// DESIGN_REFERENCE §Instances §12 Bulk Update State
export function bulkUpdateState(
  body: BulkUpdateStateRequest,
  signal?: AbortSignal,
): Promise<BulkUpdateStateResponse> {
  return http.patch<BulkUpdateStateResponse>(`${API_V1}/instances/bulk/state`, body, { signal })
}

// PATCH /api/v1/instances/bulk/reschedule — Bulk reschedule instances
// DESIGN_REFERENCE §Instances §13 Bulk Reschedule
export function bulkReschedule(
  body: BulkRescheduleRequest,
  signal?: AbortSignal,
): Promise<BulkRescheduleResponse> {
  return http.patch<BulkRescheduleResponse>(`${API_V1}/instances/bulk/reschedule`, body, { signal })
}

// POST /api/v1/instances/batch-action — Apply one action to many instances
// DESIGN_REFERENCE §Instances §14 Batch Action
export function batchAction(
  body: BatchActionRequest,
  signal?: AbortSignal,
): Promise<BatchActionResponse> {
  return http.post<BatchActionResponse>(`${API_V1}/instances/batch-action`, body, { signal })
}

// GET /api/v1/instances/dlq — Dead letter queue (failed instances)
// DESIGN_REFERENCE §Instances §15 List DLQ
export function listDlq(query?: ListDlqQuery, signal?: AbortSignal): Promise<TaskInstance[]> {
  return http.get<TaskInstance[]>(`${API_V1}/instances/dlq`, { query, signal })
    .then(asItems<TaskInstance>)
}

// GET /api/v1/instances/{id}/tree — Execution tree nodes
export function getExecutionTree(id: string, signal?: AbortSignal): Promise<ExecutionNode[]> {
  return http.get<ExecutionNode[]>(`${API_V1}/instances/${encodeURIComponent(id)}/tree`, { signal })
    .then(asItems<ExecutionNode>)
}
