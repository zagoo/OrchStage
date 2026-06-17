/**
 * Unit tests for the canvas API module.
 * Covers: listSequencesForPicker, listInstancesForSequence, fetchExecutionTree,
 *         saveSequenceVersion, exportSequenceAsJson.
 * Stubs global fetch; asserts correct method, path, query, body construction.
 *
 * Business intent encoded:
 * - listSequencesForPicker must default to limit=200 (canvas needs enough rows)
 * - listInstancesForSequence must filter by sequence_id and cap at 100
 * - fetchExecutionTree must call GET /instances/{id}/tree
 * - saveSequenceVersion must POST /sequences with the correct body
 * - exportSequenceAsJson is a pure client-side operation (no fetch)
 *
 * DESIGN_REFERENCE §dag-sequences.md §9, §instances-core.md
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  listSequencesForPicker,
  listInstancesForSequence,
  fetchExecutionTree,
  saveSequenceVersion,
  exportSequenceAsJson,
} from './canvas'
import type { SequenceDefinition } from './types/sequences'
import type { ExecutionNode } from './types/instances'

// --- helpers -----------------------------------------------------------------

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  })
}

function makeSeqDef(overrides: Partial<SequenceDefinition> = {}): SequenceDefinition {
  return {
    id: '01912e4d-0000-7000-0000-000000000001',
    tenant_id: 't_acme',
    namespace: 'default',
    name: 'my-workflow',
    version: 1,
    deprecated: false,
    status: 'production',
    blocks: [
      { type: 'step', id: 'step1', handler: 'log', cancellable: true },
    ],
    created_at: '2026-06-17T00:00:00Z',
    ...overrides,
  }
}

function makeExecNode(blockId: string): ExecutionNode {
  return {
    id: '01912e4d-0000-7000-0000-000000000010',
    instance_id: '01912e4d-0000-7000-0000-000000000099',
    block_id: blockId,
    parent_id: null,
    block_type: 'step',
    branch_index: null,
    state: 'completed',
    started_at: '2026-06-17T10:00:00Z',
    completed_at: '2026-06-17T10:00:05Z',
  }
}

// --- setup -------------------------------------------------------------------

beforeEach(() => {
  setHttpConfig({ baseUrl: '', apiKey: 'test-key', tenantId: 't_acme' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- listSequencesForPicker --------------------------------------------------

describe('listSequencesForPicker', () => {
  it('calls GET /api/v1/sequences with default limit=200', async () => {
    const pageResponse = { items: [makeSeqDef()], has_more: false }
    vi.stubGlobal('fetch', mockFetch(200, pageResponse))

    await listSequencesForPicker()

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sequences')
    expect(url).toContain('limit=200')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('merges caller-supplied query params over defaults', async () => {
    const pageResponse = { items: [], has_more: false }
    vi.stubGlobal('fetch', mockFetch(200, pageResponse))

    await listSequencesForPicker({ tenant_id: 'acme', namespace: 'orders', limit: 50 })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    // caller limit=50 should override default 200
    expect(url).toContain('limit=50')
    expect(url).toContain('tenant_id=acme')
    expect(url).toContain('namespace=orders')
  })

  it('returns paginated response with items', async () => {
    const seq = makeSeqDef()
    const pageResponse = { items: [seq], has_more: false }
    vi.stubGlobal('fetch', mockFetch(200, pageResponse))

    const result = await listSequencesForPicker()
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe(seq.id)
  })

  it('throws ApiError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'unauthorized' }))
    await expect(listSequencesForPicker()).rejects.toMatchObject({ status: 401 })
  })
})

// --- listInstancesForSequence ------------------------------------------------

describe('listInstancesForSequence', () => {
  it('calls GET /api/v1/instances with sequence_id and limit=100', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listInstancesForSequence('seq-uuid-001')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/instances')
    expect(url).toContain('sequence_id=seq-uuid-001')
    expect(url).toContain('limit=100')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('returns empty array when no instances exist', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    const result = await listInstancesForSequence('seq-uuid-001')
    expect(result).toEqual([])
  })

  it('caller can override limit', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listInstancesForSequence('seq-uuid-001', { limit: 10 })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('limit=10')
  })

  it('throws ApiError on 403 (wrong tenant)', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { error: 'forbidden: tenant mismatch' }))
    await expect(listInstancesForSequence('seq-uuid-001')).rejects.toMatchObject({ status: 403 })
  })
})

// --- fetchExecutionTree ------------------------------------------------------

describe('fetchExecutionTree', () => {
  it('calls GET /api/v1/instances/{id}/tree', async () => {
    const nodes = [makeExecNode('step1')]
    vi.stubGlobal('fetch', mockFetch(200, nodes))

    const instanceId = '01912e4d-0000-7000-0000-000000000099'
    const result = await fetchExecutionTree(instanceId)

    expect(result).toHaveLength(1)
    expect(result[0].block_id).toBe('step1')
    expect(result[0].state).toBe('completed')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain(`/api/v1/instances/${instanceId}/tree`)
  })

  it('returns empty array when instance has no execution nodes yet', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    const result = await fetchExecutionTree('01912e4d-0000-7000-0000-000000000099')
    expect(result).toEqual([])
  })

  it('throws ApiError on 404 (instance not found)', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: instance xyz' }))
    await expect(fetchExecutionTree('no-such-id')).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError on 503 (stream limiter exhausted)', async () => {
    vi.stubGlobal('fetch', mockFetch(503, { error: 'unavailable: pool exhausted' }))
    await expect(fetchExecutionTree('01912e4d-0000-7000-0000-000000000099')).rejects.toMatchObject({
      status: 503,
    })
  })

  it('URL-encodes instance id with special characters', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    // Edge case: id contains characters that need encoding
    await fetchExecutionTree('instance/123')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('instance%2F123')
  })
})

// --- saveSequenceVersion -----------------------------------------------------

describe('saveSequenceVersion', () => {
  it('POST /api/v1/sequences with correct body', async () => {
    const response = { id: '01912e4d-0000-7000-0000-000000000002', warnings: [] }
    vi.stubGlobal('fetch', mockFetch(201, response))

    const def = makeSeqDef()
    const body = { ...def, version: 2, created_at: '2026-06-17T12:00:00Z' }

    const result = await saveSequenceVersion(body)
    expect(result.id).toBe(response.id)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sequences')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>
    expect(sentBody.version).toBe(2)
    expect(sentBody.name).toBe('my-workflow')
    expect(sentBody.tenant_id).toBe('t_acme')
  })

  it('returns warnings from 201 response', async () => {
    const response = { id: '01912e4d-0000-7000-0000-000000000002', warnings: ['Unknown handler: my-handler'] }
    vi.stubGlobal('fetch', mockFetch(201, response))

    const def = makeSeqDef()
    const result = await saveSequenceVersion({ ...def, version: 2, created_at: '2026-06-17T12:00:00Z' })

    expect(result.warnings).toEqual(['Unknown handler: my-handler'])
  })

  it('throws ApiError on 400 (duplicate block ids)', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: duplicate block id step1' }))

    const def = makeSeqDef()
    await expect(
      saveSequenceVersion({ ...def, version: 2, created_at: '2026-06-17T12:00:00Z' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError on 409 (sequence already exists)', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { error: 'already exists: sequence my-workflow' }))

    const def = makeSeqDef()
    await expect(
      saveSequenceVersion({ ...def, version: 2, created_at: '2026-06-17T12:00:00Z' }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('throws ApiError on 422 (bad input_schema)', async () => {
    vi.stubGlobal('fetch', mockFetch(422, { error: 'unprocessable entity: input_schema is not valid JSON Schema' }))

    const def = makeSeqDef({ input_schema: 'not-an-object' as unknown })
    await expect(
      saveSequenceVersion({ ...def, version: 2, created_at: '2026-06-17T12:00:00Z' }),
    ).rejects.toMatchObject({ status: 422 })
  })
})

// --- exportSequenceAsJson ----------------------------------------------------

describe('exportSequenceAsJson', () => {
  it('creates a blob download link without HTTP calls', () => {
    // Mock DOM APIs used by exportSequenceAsJson
    const createObjectURL = vi.fn(() => 'blob:http://localhost/test-url')
    const revokeObjectURL = vi.fn()
    const click = vi.fn()
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement)

    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.stubGlobal('fetch', vi.fn()) // should NOT be called

    const seq = makeSeqDef({ name: 'export-test', version: 3 })
    exportSequenceAsJson(seq)

    expect(fetch).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledOnce()

    createElement.mockRestore()
    vi.unstubAllGlobals()
  })
})
