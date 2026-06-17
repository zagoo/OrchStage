/**
 * Typed endpoint functions for the Workers & Tasks domain.
 * All paths are canonical /api/v1/… form.
 * DESIGN_REFERENCE §Workers & Tasks
 */
import { http, API_V1 } from '@/api/http'
import { asItems } from '@/api/types/common'
import type {
  WorkerInfo,
  WorkerTask,
  WorkerCommand,
  WorkerVersionPin,
  HandlerCatalog,
  WorkerTaskStats,
  ListWorkersQuery,
  ListTasksQuery,
  PollTasksRequest,
  PollTasksFromQueueRequest,
  CompleteTaskRequest,
  FailTaskRequest,
  HeartbeatTaskRequest,
  EnqueueCommandRequest,
  SetVersionPinRequest,
  ListVersionPinsQuery,
} from '@/api/types/workers'

// GET /api/v1/workers — list live worker fleet
// DESIGN_REFERENCE §GET /workers
export function listWorkers(query?: ListWorkersQuery, signal?: AbortSignal): Promise<WorkerInfo[]> {
  return http.get<WorkerInfo[]>(`${API_V1}/workers`, { query, signal })
}

// GET /api/v1/handlers — handler catalog (builtin + external)
// DESIGN_REFERENCE §GET /handlers
export function listHandlers(signal?: AbortSignal): Promise<HandlerCatalog> {
  return http.get<HandlerCatalog>(`${API_V1}/handlers`, { signal })
}

// GET /api/v1/workers/tasks — list/filter worker tasks
// DESIGN_REFERENCE §GET /workers/tasks
export async function listTasks(query?: ListTasksQuery, signal?: AbortSignal): Promise<WorkerTask[]> {
  const payload = await http.get<unknown>(`${API_V1}/workers/tasks`, { query, signal })
  return asItems<WorkerTask>(payload)
}

// GET /api/v1/workers/tasks/stats — aggregate task statistics
// DESIGN_REFERENCE §GET /workers/tasks/stats
export function getTaskStats(signal?: AbortSignal): Promise<WorkerTaskStats> {
  return http.get<WorkerTaskStats>(`${API_V1}/workers/tasks/stats`, { signal })
}

// POST /api/v1/workers/tasks/poll — claim tasks by handler
// DESIGN_REFERENCE §POST /workers/tasks/poll
export function pollTasks(body: PollTasksRequest, signal?: AbortSignal): Promise<WorkerTask[]> {
  return http.post<WorkerTask[]>(`${API_V1}/workers/tasks/poll`, body, { signal })
}

// POST /api/v1/workers/tasks/poll/queue — claim tasks from a named queue
// DESIGN_REFERENCE §POST /workers/tasks/poll/queue
export function pollTasksFromQueue(
  body: PollTasksFromQueueRequest,
  signal?: AbortSignal,
): Promise<WorkerTask[]> {
  return http.post<WorkerTask[]>(`${API_V1}/workers/tasks/poll/queue`, body, { signal })
}

// POST /api/v1/workers/tasks/{id}/complete — report task success
// DESIGN_REFERENCE §POST /workers/tasks/{id}/complete
export function completeTask(id: string, body: CompleteTaskRequest, signal?: AbortSignal): Promise<void> {
  return http.post<void>(`${API_V1}/workers/tasks/${encodeURIComponent(id)}/complete`, body, { signal })
}

// POST /api/v1/workers/tasks/{id}/fail — report task failure
// DESIGN_REFERENCE §POST /workers/tasks/{id}/fail
export function failTask(id: string, body: FailTaskRequest, signal?: AbortSignal): Promise<void> {
  return http.post<void>(`${API_V1}/workers/tasks/${encodeURIComponent(id)}/fail`, body, { signal })
}

// POST /api/v1/workers/tasks/{id}/heartbeat — extend task lease
// DESIGN_REFERENCE §POST /workers/tasks/{id}/heartbeat
export function heartbeatTask(
  id: string,
  body: HeartbeatTaskRequest,
  signal?: AbortSignal,
): Promise<void> {
  return http.post<void>(`${API_V1}/workers/tasks/${encodeURIComponent(id)}/heartbeat`, body, { signal })
}

// POST /api/v1/workers/commands — enqueue a control command for a worker
// DESIGN_REFERENCE §POST /workers/commands
export function enqueueCommand(body: EnqueueCommandRequest, signal?: AbortSignal): Promise<WorkerCommand> {
  return http.post<WorkerCommand>(`${API_V1}/workers/commands`, body, { signal })
}

// GET /api/v1/workers/{worker_id}/commands — list pending commands for a worker
// DESIGN_REFERENCE §GET /workers/{worker_id}/commands
export function listCommands(workerId: string, signal?: AbortSignal): Promise<WorkerCommand[]> {
  return http.get<WorkerCommand[]>(`${API_V1}/workers/${encodeURIComponent(workerId)}/commands`, { signal })
}

// DELETE /api/v1/workers/commands/{id} — acknowledge and delete a command
// DESIGN_REFERENCE §DELETE /workers/commands/{id}
export function ackCommand(id: string, signal?: AbortSignal): Promise<void> {
  return http.del<void>(`${API_V1}/workers/commands/${encodeURIComponent(id)}`, { signal })
}

// POST /api/v1/workers/version-pins — create/update a version pin (upsert)
// DESIGN_REFERENCE §POST /workers/version-pins
export function setVersionPin(body: SetVersionPinRequest, signal?: AbortSignal): Promise<WorkerVersionPin> {
  return http.post<WorkerVersionPin>(`${API_V1}/workers/version-pins`, body, { signal })
}

// GET /api/v1/workers/version-pins — list version pins
// DESIGN_REFERENCE §GET /workers/version-pins
export async function listVersionPins(
  query?: ListVersionPinsQuery,
  signal?: AbortSignal,
): Promise<WorkerVersionPin[]> {
  const payload = await http.get<unknown>(`${API_V1}/workers/version-pins`, { query, signal })
  return asItems<WorkerVersionPin>(payload)
}

// DELETE /api/v1/workers/version-pins/{tenant_id}/{handler_name}
// DESIGN_REFERENCE §DELETE /workers/version-pins/{tenant_id}/{handler_name}
export function deleteVersionPin(
  tenantId: string,
  handlerName: string,
  signal?: AbortSignal,
): Promise<void> {
  return http.del<void>(
    `${API_V1}/workers/version-pins/${encodeURIComponent(tenantId)}/${encodeURIComponent(handlerName)}`,
    { signal },
  )
}
