/**
 * Unit tests for workers API module.
 * Stubs global fetch and asserts correct method, path, query, body construction.
 * DESIGN_REFERENCE §Workers & Tasks
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  listWorkers,
  listHandlers,
  listTasks,
  getTaskStats,
  enqueueCommand,
  listCommands,
  ackCommand,
  setVersionPin,
  listVersionPins,
  deleteVersionPin,
  pollTasks,
  pollTasksFromQueue,
  completeTask,
  failTask,
  heartbeatTask,
} from './workers'
import type { WorkerInfo, WorkerTask, WorkerCommand, WorkerVersionPin, HandlerCatalog, WorkerTaskStats } from './types/workers'

// --- helpers -----------------------------------------------------------------

function mockFetch(status: number, body: unknown, headers?: Record<string, string>) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  })
}

function makeWorker(id = 'worker-1'): WorkerInfo {
  return {
    worker_id: id,
    handlers: ['send-email'],
    queues: ['bulk-email'],
    version: '1.4.2',
    last_seen_at: '2026-06-17T10:00:00Z',
    alive: true,
    in_flight: 2,
  }
}

function makeTask(id = 'task-uuid-1'): WorkerTask {
  return {
    id,
    instance_id: 'inst-uuid-1',
    block_id: 'step-1',
    handler_name: 'send-email',
    queue_name: 'bulk-email',
    params: { to: 'user@example.com' },
    context: {},
    attempt: 0,
    timeout_ms: 30000,
    state: 'pending',
    worker_id: null,
    claimed_at: null,
    heartbeat_at: null,
    completed_at: null,
    output: null,
    error_message: null,
    error_retryable: null,
    created_at: '2026-06-17T10:00:00Z',
  }
}

function makeCommand(id = 'cmd-uuid-1'): WorkerCommand {
  return {
    id,
    worker_id: 'worker-1',
    command: 'ping',
    payload: {},
    created_at: '2026-06-17T10:00:00Z',
  }
}

function makePin(): WorkerVersionPin {
  return {
    tenant_id: 'acme',
    handler_name: 'send-email',
    min_version: '1.5.0',
    created_at: '2026-06-17T10:00:00Z',
    updated_at: '2026-06-17T10:00:00Z',
  }
}

// --- setup -------------------------------------------------------------------

beforeEach(() => {
  setHttpConfig({ baseUrl: '', apiKey: 'test-key', tenantId: 't_acme' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- listWorkers -------------------------------------------------------------

describe('listWorkers', () => {
  it('GET /api/v1/workers returns array', async () => {
    const data = [makeWorker()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listWorkers()
    expect(result).toEqual(data)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/workers')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('passes alive_within_secs and include_stale as query params', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listWorkers({ alive_within_secs: 120, include_stale: true })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('alive_within_secs=120')
    expect(url).toContain('include_stale=true')
  })

  it('throws ApiError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'unauthorized' }))
    await expect(listWorkers()).rejects.toMatchObject({ status: 401 })
  })
})

// --- listHandlers ------------------------------------------------------------

describe('listHandlers', () => {
  it('GET /api/v1/handlers returns catalog', async () => {
    const catalog: HandlerCatalog = { builtin: ['delay'], external: ['send-email'] }
    vi.stubGlobal('fetch', mockFetch(200, catalog))

    const result = await listHandlers()
    expect(result.builtin).toContain('delay')
    expect(result.external).toContain('send-email')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/handlers')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })
})

// --- listTasks ---------------------------------------------------------------

describe('listTasks', () => {
  it('GET /api/v1/workers/tasks — array payload', async () => {
    const data = [makeTask()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listTasks()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('task-uuid-1')
  })

  it('GET /api/v1/workers/tasks — wrapped { items } payload', async () => {
    const data = { items: [makeTask()] }
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listTasks()
    expect(result).toHaveLength(1)
  })

  it('passes state and handler_name as query params', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listTasks({ state: 'pending', handler_name: 'send-email', limit: 50 })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('state=pending')
    expect(url).toContain('handler_name=send-email')
    expect(url).toContain('limit=50')
  })

  it('throws ApiError on 400 unknown state', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: unknown state' }))
    await expect(listTasks({ state: 'bogus' })).rejects.toMatchObject({ status: 400 })
  })
})

// --- getTaskStats ------------------------------------------------------------

describe('getTaskStats', () => {
  it('GET /api/v1/workers/tasks/stats returns stats object', async () => {
    const stats: WorkerTaskStats = {
      by_state: { pending: 5, claimed: 2, completed: 100, failed: 1 },
      by_handler: { 'send-email': { pending: 5, claimed: 2 } },
      active_workers: ['worker-1'],
    }
    vi.stubGlobal('fetch', mockFetch(200, stats))

    const result = await getTaskStats()
    expect(result.by_state.pending).toBe(5)
    expect(result.active_workers).toContain('worker-1')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/workers/tasks/stats')
  })
})

// --- pollTasks ---------------------------------------------------------------

describe('pollTasks', () => {
  it('POST /api/v1/workers/tasks/poll with correct body', async () => {
    vi.stubGlobal('fetch', mockFetch(200, [makeTask()]))

    const result = await pollTasks({ handler_name: 'send-email', worker_id: 'w-1', limit: 5, version: '1.4.2' })
    expect(result).toHaveLength(1)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/workers/tasks/poll')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.handler_name).toBe('send-email')
    expect(body.worker_id).toBe('w-1')
    expect(body.limit).toBe(5)
    expect(body.version).toBe('1.4.2')
  })

  it('returns empty array when no tasks or version pin blocks', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))
    const result = await pollTasks({ handler_name: 'send-email', worker_id: 'w-1' })
    expect(result).toEqual([])
  })
})

// --- pollTasksFromQueue ------------------------------------------------------

describe('pollTasksFromQueue', () => {
  it('POST /api/v1/workers/tasks/poll/queue includes queue_name', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await pollTasksFromQueue({ queue_name: 'bulk-email', handler_name: 'send-email', worker_id: 'w-1' })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/workers/tasks/poll/queue')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.queue_name).toBe('bulk-email')
  })
})

// --- completeTask ------------------------------------------------------------

describe('completeTask', () => {
  it('POST /api/v1/workers/tasks/{id}/complete with worker_id and output', async () => {
    vi.stubGlobal('fetch', mockFetch(200, null))

    await completeTask('task-id-1', { worker_id: 'w-1', output: { result: 'ok' } })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/workers/tasks/task-id-1/complete')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.worker_id).toBe('w-1')
    expect((body.output as Record<string, unknown>).result).toBe('ok')
  })

  it('throws ApiError on 404 task not found', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: task missing' }))
    await expect(
      completeTask('missing', { worker_id: 'w-1', output: {} }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError on 403 tenant mismatch', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { error: 'forbidden: tenant mismatch' }))
    await expect(
      completeTask('task-id-1', { worker_id: 'w-1', output: {} }),
    ).rejects.toMatchObject({ status: 403 })
  })
})

// --- failTask ----------------------------------------------------------------

describe('failTask', () => {
  it('POST /api/v1/workers/tasks/{id}/fail with correct body', async () => {
    vi.stubGlobal('fetch', mockFetch(200, null))

    await failTask('task-id-1', { worker_id: 'w-1', message: 'SMTP refused', retryable: true })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/workers/tasks/task-id-1/fail')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.message).toBe('SMTP refused')
    expect(body.retryable).toBe(true)
  })
})

// --- heartbeatTask -----------------------------------------------------------

describe('heartbeatTask', () => {
  it('POST /api/v1/workers/tasks/{id}/heartbeat with worker_id', async () => {
    vi.stubGlobal('fetch', mockFetch(200, null))

    await heartbeatTask('task-id-1', { worker_id: 'w-1' })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/workers/tasks/task-id-1/heartbeat')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.worker_id).toBe('w-1')
  })

  it('throws ApiError on 404 stale/missing task', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: task reaped' }))
    await expect(heartbeatTask('task-id-1', { worker_id: 'w-1' })).rejects.toMatchObject({ status: 404 })
  })
})

// --- enqueueCommand ----------------------------------------------------------

describe('enqueueCommand', () => {
  it('POST /api/v1/workers/commands with correct body', async () => {
    const cmd = makeCommand()
    vi.stubGlobal('fetch', mockFetch(201, cmd))

    const result = await enqueueCommand({ worker_id: 'worker-1', command: 'ping' })
    expect(result.command).toBe('ping')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/workers/commands')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.worker_id).toBe('worker-1')
    expect(body.command).toBe('ping')
  })

  it('throws ApiError on 400 when worker_id is empty', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: worker_id is empty' }))
    await expect(enqueueCommand({ worker_id: '', command: 'drain' })).rejects.toMatchObject({ status: 400 })
  })

  it('sends drain command with payload', async () => {
    const cmd = { ...makeCommand(), command: 'drain' as const, payload: { deadline: '2026-06-17T11:00:00Z' } }
    vi.stubGlobal('fetch', mockFetch(201, cmd))

    await enqueueCommand({
      worker_id: 'worker-1',
      command: 'drain',
      payload: { deadline: '2026-06-17T11:00:00Z' },
    })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.command).toBe('drain')
    expect((body.payload as Record<string, unknown>).deadline).toBe('2026-06-17T11:00:00Z')
  })
})

// --- listCommands ------------------------------------------------------------

describe('listCommands', () => {
  it('GET /api/v1/workers/{worker_id}/commands', async () => {
    const data = [makeCommand()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listCommands('worker-1')
    expect(result).toHaveLength(1)
    expect(result[0].command).toBe('ping')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/workers/worker-1/commands')
  })

  it('URL-encodes worker_id with special chars', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listCommands('worker/zone-a')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/workers/worker%2Fzone-a/commands')
  })
})

// --- ackCommand --------------------------------------------------------------

describe('ackCommand', () => {
  it('DELETE /api/v1/workers/commands/{id}', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await ackCommand('cmd-uuid-1')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/workers/commands/cmd-uuid-1')
    expect((init.method as string).toUpperCase()).toBe('DELETE')
  })
})

// --- setVersionPin -----------------------------------------------------------

describe('setVersionPin', () => {
  it('POST /api/v1/workers/version-pins returns pin', async () => {
    const pin = makePin()
    vi.stubGlobal('fetch', mockFetch(200, pin))

    const result = await setVersionPin({ tenant_id: 'acme', handler_name: 'send-email', min_version: '1.5.0' })
    expect(result.min_version).toBe('1.5.0')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/workers/version-pins')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.handler_name).toBe('send-email')
    expect(body.min_version).toBe('1.5.0')
  })

  it('throws ApiError on 400 when handler_name is empty', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: handler_name is empty' }))
    await expect(
      setVersionPin({ tenant_id: 'acme', handler_name: '', min_version: '1.0.0' }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

// --- listVersionPins ---------------------------------------------------------

describe('listVersionPins', () => {
  it('GET /api/v1/workers/version-pins — array payload', async () => {
    const data = [makePin()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listVersionPins()
    expect(result).toHaveLength(1)
    expect(result[0].handler_name).toBe('send-email')
  })

  it('passes tenant_id as query param', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listVersionPins({ tenant_id: 'acme' })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('tenant_id=acme')
  })
})

// --- deleteVersionPin --------------------------------------------------------

describe('deleteVersionPin', () => {
  it('DELETE /api/v1/workers/version-pins/{tenant_id}/{handler_name}', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deleteVersionPin('acme', 'send-email')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/workers/version-pins/acme/send-email')
    expect((init.method as string).toUpperCase()).toBe('DELETE')
  })

  it('URL-encodes tenant_id and handler_name', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deleteVersionPin('acme/prod', 'send-email')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/workers/version-pins/acme%2Fprod/send-email')
  })
})
