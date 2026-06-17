/**
 * Unit tests for instancesAdvanced API module.
 * Stubs global fetch; asserts method, path, query, and body construction.
 * Business intent: every advanced instance endpoint reaches the correct URL
 * and serialises/deserialises its request/response correctly.
 * DESIGN_REFERENCE §Instances — instances-advanced.md
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  forkInstance,
  injectBlocks,
  saveCheckpoint,
  listCheckpoints,
  getLatestCheckpoint,
  pruneCheckpoints,
  getTimeline,
  getOutputs,
  listArtifacts,
  getInstanceLogs,
  listAuditLog,
  instanceStreamPath,
  fetchArtifactBytes,
} from './instancesAdvanced'
import type { Checkpoint, BlockOutput, StepLog, AuditLogEntry, TimelineResponse, ForkResponse } from './types/instancesAdvanced'

// --- helpers -----------------------------------------------------------------

const INSTANCE_ID = '01912e4d-1234-7abc-8def-000000000001'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  })
}

function getCall() {
  const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
  const [url, init] = calls[0] as [string, RequestInit]
  return { url, init, method: ((init.method as string) ?? 'GET').toUpperCase() }
}

function parseBody(init: RequestInit): Record<string, unknown> {
  return JSON.parse(init.body as string) as Record<string, unknown>
}

// --- setup -------------------------------------------------------------------

beforeEach(() => {
  setHttpConfig({ baseUrl: '', apiKey: 'test-key', tenantId: 't_acme' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- forkInstance ------------------------------------------------------------

describe('forkInstance', () => {
  it('POST /api/v1/instances/{id}/fork with required fields', async () => {
    const resp: ForkResponse = {
      id: '01912e4d-0000-7abc-0000-000000000002',
      forked_from: INSTANCE_ID,
      state: 'scheduled',
      copied_blocks: 3,
      rerun_blocks: ['step_b'],
      dry_run: true,
    }
    vi.stubGlobal('fetch', mockFetch(201, resp))

    const result = await forkInstance(INSTANCE_ID, { from_block_id: 'step_a', dry_run: true })

    expect(result.forked_from).toBe(INSTANCE_ID)
    expect(result.copied_blocks).toBe(3)
    expect(result.dry_run).toBe(true)

    const { url, method } = getCall()
    expect(url).toContain(`/api/v1/instances/${INSTANCE_ID}/fork`)
    expect(method).toBe('POST')
  })

  it('sends context patch and signals in body', async () => {
    const resp: ForkResponse = { id: 'x', forked_from: INSTANCE_ID, state: 'scheduled', copied_blocks: 0, rerun_blocks: [], dry_run: false }
    vi.stubGlobal('fetch', mockFetch(201, resp))

    await forkInstance(INSTANCE_ID, {
      from_block_id: 'enrich',
      context: { feature_flag: true },
      signals: [{ signal_type: 'resume' }],
    })

    const { init } = getCall()
    const body = parseBody(init)
    expect(body.from_block_id).toBe('enrich')
    expect((body.context as Record<string, unknown>).feature_flag).toBe(true)
    expect((body.signals as unknown[]).length).toBe(1)
  })

  it('throws ApiError on 400 (block not top-level)', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: not a top-level block' }))
    await expect(forkInstance(INSTANCE_ID, { from_block_id: 'nested' })).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError on 404 (instance not found)', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: instance abc' }))
    await expect(forkInstance('bad-id', { from_block_id: 'step' })).rejects.toMatchObject({ status: 404 })
  })
})

// --- injectBlocks ------------------------------------------------------------

describe('injectBlocks', () => {
  it('POST /api/v1/instances/{id}/inject-blocks', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { injected_block_ids: ['review_1'], position: 2, total_injected: 5 }))

    const result = await injectBlocks(INSTANCE_ID, {
      blocks: [{ type: 'step', id: 'review_1', handler: 'approval' }],
      position: 2,
    })

    expect(result.injected_block_ids).toEqual(['review_1'])
    expect(result.total_injected).toBe(5)

    const { url, method } = getCall()
    expect(url).toContain(`/api/v1/instances/${INSTANCE_ID}/inject-blocks`)
    expect(method).toBe('POST')
  })

  it('throws 400 when blocks array is empty', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: blocks array is empty' }))
    await expect(injectBlocks(INSTANCE_ID, { blocks: [] })).rejects.toMatchObject({ status: 400 })
  })
})

// --- saveCheckpoint ----------------------------------------------------------

describe('saveCheckpoint', () => {
  it('POST /api/v1/instances/{id}/checkpoints returns new id', async () => {
    const newId = '018f4b2c-1234-7000-8000-000000000002'
    vi.stubGlobal('fetch', mockFetch(201, { id: newId }))

    const result = await saveCheckpoint(INSTANCE_ID, {
      checkpoint_data: { completed_blocks: ['step_a'], context_snapshot: {} },
    })

    expect(result.id).toBe(newId)
    const { url, method } = getCall()
    expect(url).toContain(`/api/v1/instances/${INSTANCE_ID}/checkpoints`)
    expect(url).not.toContain('/latest')
    expect(url).not.toContain('/prune')
    expect(method).toBe('POST')
  })

  it('throws 404 when instance not found', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: instance abc' }))
    await expect(saveCheckpoint('missing', { checkpoint_data: {} })).rejects.toMatchObject({ status: 404 })
  })
})

// --- listCheckpoints ---------------------------------------------------------

describe('listCheckpoints', () => {
  it('GET /api/v1/instances/{id}/checkpoints returns array', async () => {
    const checkpoints: Checkpoint[] = [
      { id: 'cp1', instance_id: INSTANCE_ID, checkpoint_data: {}, created_at: '2026-06-17T10:00:00Z' },
    ]
    vi.stubGlobal('fetch', mockFetch(200, checkpoints))

    const result = await listCheckpoints(INSTANCE_ID)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('cp1')

    const { url, method } = getCall()
    expect(url).toContain(`/api/v1/instances/${INSTANCE_ID}/checkpoints`)
    expect(method).toBe('GET')
  })

  it('returns empty array when instance has no checkpoints', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))
    const result = await listCheckpoints(INSTANCE_ID)
    expect(result).toEqual([])
  })
})

// --- getLatestCheckpoint -----------------------------------------------------

describe('getLatestCheckpoint', () => {
  it('GET /api/v1/instances/{id}/checkpoints/latest', async () => {
    const cp: Checkpoint = { id: 'cpLatest', instance_id: INSTANCE_ID, checkpoint_data: { x: 1 }, created_at: '2026-06-17T12:00:00Z' }
    vi.stubGlobal('fetch', mockFetch(200, cp))

    const result = await getLatestCheckpoint(INSTANCE_ID)
    expect(result.id).toBe('cpLatest')

    const { url } = getCall()
    expect(url).toContain('/checkpoints/latest')
  })

  it('throws 404 when no checkpoint exists', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: checkpoint for instance abc' }))
    await expect(getLatestCheckpoint(INSTANCE_ID)).rejects.toMatchObject({ status: 404 })
  })
})

// --- pruneCheckpoints --------------------------------------------------------

describe('pruneCheckpoints', () => {
  it('POST /api/v1/instances/{id}/checkpoints/prune with keep param', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { count: 12 }))

    const result = await pruneCheckpoints(INSTANCE_ID, { keep: 5 })
    expect(result.count).toBe(12)

    const { url, method, init } = getCall()
    expect(url).toContain('/checkpoints/prune')
    expect(method).toBe('POST')
    expect(parseBody(init).keep).toBe(5)
  })
})

// --- getTimeline -------------------------------------------------------------

describe('getTimeline', () => {
  it('GET /api/v1/instances/{id}/timeline with default params', async () => {
    const resp: TimelineResponse = {
      instance: { id: INSTANCE_ID, sequence_id: 'seq1', state: 'running', created_at: '2026-06-17T10:00:00Z', updated_at: '2026-06-17T10:05:00Z' },
      state_transitions: [],
      entries: [],
      offset: 0,
      limit: 200,
      has_more: false,
    }
    vi.stubGlobal('fetch', mockFetch(200, resp))

    const result = await getTimeline(INSTANCE_ID)
    expect(result.instance.id).toBe(INSTANCE_ID)
    expect(result.has_more).toBe(false)

    const { url, method } = getCall()
    expect(url).toContain(`/api/v1/instances/${INSTANCE_ID}/timeline`)
    expect(method).toBe('GET')
  })

  it('passes include_outputs=false and pagination params', async () => {
    vi.stubGlobal('fetch', mockFetch(200, {
      instance: { id: INSTANCE_ID, sequence_id: 'seq1', state: 'completed', created_at: '', updated_at: '' },
      state_transitions: [],
      entries: [],
      offset: 50,
      limit: 100,
      has_more: false,
    }))

    await getTimeline(INSTANCE_ID, { offset: 50, limit: 100, include_outputs: false })
    const { url } = getCall()
    expect(url).toContain('offset=50')
    expect(url).toContain('limit=100')
    expect(url).toContain('include_outputs=false')
  })

  it('surfaces is_sentinel=true on sentinel entries', async () => {
    const resp: TimelineResponse = {
      instance: { id: INSTANCE_ID, sequence_id: 'seq1', state: 'running', created_at: '', updated_at: '' },
      state_transitions: [],
      entries: [
        { block_id: 'step_a', attempt: 0, completed_at: '', is_sentinel: true, output_ref: '__retry__' },
        { block_id: 'step_a', attempt: 1, completed_at: '', is_sentinel: false, output: { done: true } },
      ],
      offset: 0,
      limit: 200,
      has_more: false,
    }
    vi.stubGlobal('fetch', mockFetch(200, resp))
    const result = await getTimeline(INSTANCE_ID)
    expect(result.entries[0].is_sentinel).toBe(true)
    expect(result.entries[1].is_sentinel).toBe(false)
  })
})

// --- getOutputs --------------------------------------------------------------

describe('getOutputs', () => {
  it('GET /api/v1/instances/{id}/outputs returns BlockOutput array', async () => {
    const outputs: BlockOutput[] = [
      { id: 'out1', instance_id: INSTANCE_ID, block_id: 'step_a', output: { result: 42 }, output_ref: null, output_size: 12, attempt: 0, created_at: '2026-06-17T10:00:01Z' },
    ]
    vi.stubGlobal('fetch', mockFetch(200, outputs))

    const result = await getOutputs(INSTANCE_ID)
    expect(result).toHaveLength(1)
    expect(result[0].block_id).toBe('step_a')
    expect(result[0].output_ref).toBeNull()
  })

  it('throws 404 on missing instance', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: instance abc' }))
    await expect(getOutputs(INSTANCE_ID)).rejects.toMatchObject({ status: 404 })
  })
})

// --- listArtifacts -----------------------------------------------------------

describe('listArtifacts', () => {
  it('GET /api/v1/instances/{id}/artifacts returns items array', async () => {
    vi.stubGlobal('fetch', mockFetch(200, {
      items: [{ key: `${INSTANCE_ID}/art1`, size: 204800, uri: `artifact://${INSTANCE_ID}/art1` }],
    }))

    const result = await listArtifacts(INSTANCE_ID)
    expect(result).toHaveLength(1)
    expect(result[0].size).toBe(204800)

    const { url } = getCall()
    expect(url).toContain(`/api/v1/instances/${INSTANCE_ID}/artifacts`)
  })

  it('returns empty array when no artifacts', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { items: [] }))
    const result = await listArtifacts(INSTANCE_ID)
    expect(result).toEqual([])
  })
})

// --- getInstanceLogs ---------------------------------------------------------

describe('getInstanceLogs', () => {
  it('GET /api/v1/instances/{id}/logs returns StepLog array', async () => {
    const logs: StepLog[] = [
      { block_id: 'step_a', ts: '2026-06-17T10:00:01Z', level: 'info', message: 'Starting' },
      { block_id: 'step_a', ts: '2026-06-17T10:00:02Z', level: 'warn', message: 'Slow' },
    ]
    vi.stubGlobal('fetch', mockFetch(200, logs))

    const result = await getInstanceLogs(INSTANCE_ID)
    expect(result).toHaveLength(2)
    expect(result[0].level).toBe('info')
    expect(result[1].level).toBe('warn')

    const { url, method } = getCall()
    expect(url).toContain(`/api/v1/instances/${INSTANCE_ID}/logs`)
    expect(method).toBe('GET')
  })

  it('throws 404 on missing instance', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: instance abc' }))
    await expect(getInstanceLogs(INSTANCE_ID)).rejects.toMatchObject({ status: 404 })
  })
})

// --- listAuditLog ------------------------------------------------------------

describe('listAuditLog', () => {
  it('GET /api/v1/instances/{id}/audit returns AuditLogEntry array', async () => {
    const entries: AuditLogEntry[] = [
      { id: 'a1', instance_id: INSTANCE_ID, tenant_id: 't_acme', event_type: 'state_transition', from_state: 'scheduled', to_state: 'running', details: {}, created_at: '2026-06-17T10:00:01Z' },
      { id: 'a2', instance_id: INSTANCE_ID, tenant_id: 't_acme', event_type: 'step_completed', block_id: 'step_a', details: { duration_ms: 45 }, created_at: '2026-06-17T10:00:02Z' },
    ]
    vi.stubGlobal('fetch', mockFetch(200, entries))

    const result = await listAuditLog(INSTANCE_ID)
    expect(result).toHaveLength(2)
    expect(result[0].event_type).toBe('state_transition')
    expect(result[1].block_id).toBe('step_a')

    const { url } = getCall()
    expect(url).toContain(`/api/v1/instances/${INSTANCE_ID}/audit`)
  })
})

// --- instanceStreamPath ------------------------------------------------------

describe('instanceStreamPath', () => {
  it('returns canonical SSE path', () => {
    const path = instanceStreamPath(INSTANCE_ID)
    expect(path).toBe(`/api/v1/instances/${INSTANCE_ID}/stream`)
  })

  it('appends poll_ms when provided', () => {
    const path = instanceStreamPath(INSTANCE_ID, 1000)
    expect(path).toBe(`/api/v1/instances/${INSTANCE_ID}/stream?poll_ms=1000`)
  })
})

// --- fetchArtifactBytes ------------------------------------------------------

describe('fetchArtifactBytes', () => {
  it('calls the artifact key URL with auth headers', async () => {
    const fakeResp = new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResp))

    const resp = await fetchArtifactBytes(`${INSTANCE_ID}/art1`)
    expect(resp.status).toBe(200)

    const { url } = getCall()
    expect(url).toContain(`/api/v1/artifacts/${INSTANCE_ID}/art1`)
  })

  it('appends content_type param when provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
    await fetchArtifactBytes(`${INSTANCE_ID}/art2`, 'image/png')
    const { url } = getCall()
    expect(url).toContain('content_type=image%2Fpng')
  })
})
