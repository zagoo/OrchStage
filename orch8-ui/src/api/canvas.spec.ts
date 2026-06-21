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
  persistSequenceEdit,
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

// --- persistSequenceEdit (status-aware Save) ---------------------------------
// Mirrors the live server contract: POST keys on `sequences.id`, so reusing an id
// → 409; there is no PUT/upsert. Overwrite = DELETE then re-POST same id+version;
// production forks a NEW version with a FRESH id.

describe('persistSequenceEdit', () => {
  function seqResponse(status: number, body: unknown) {
    return {
      ok: status < 400,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(status === 204 ? '' : JSON.stringify(body)),
      json: () => Promise.resolve(body),
    }
  }
  function mockFetchSeq(...responses: Array<{ status: number; body?: unknown }>) {
    const fn = vi.fn()
    for (const r of responses) fn.mockResolvedValueOnce(seqResponse(r.status, r.body))
    return fn
  }

  it('OVERWRITES a draft in place: DELETE then POST at the SAME id + version', async () => {
    const def = makeSeqDef({ status: 'draft', version: 3, id: 'keep-me' })
    const fetchMock = mockFetchSeq({ status: 204 }, { status: 201, body: { id: 'keep-me' } })
    vi.stubGlobal('fetch', fetchMock)

    const res = await persistSequenceEdit(def, def)

    expect(res.mode).toBe('overwrite')
    expect(res.saved.version).toBe(3) // version NOT bumped

    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>
    expect(calls).toHaveLength(2)
    expect(calls[0][0]).toContain('/api/v1/sequences/keep-me')
    expect((calls[0][1].method as string).toUpperCase()).toBe('DELETE')
    expect((calls[1][1].method as string).toUpperCase()).toBe('POST')
    const sent = JSON.parse(calls[1][1].body as string) as Record<string, unknown>
    expect(sent.id).toBe('keep-me')
    expect(sent.version).toBe(3)
  })

  it.each(['staging', 'unpublished'] as const)('overwrites a %s sequence in place too', async (status) => {
    const def = makeSeqDef({ status, version: 1, id: 'x' })
    vi.stubGlobal('fetch', mockFetchSeq({ status: 204 }, { status: 201, body: { id: 'x' } }))
    const res = await persistSequenceEdit(def, def)
    expect(res.mode).toBe('overwrite')
  })

  it('FORKS production: a single POST with a FRESH id + version+1 (no DELETE, original preserved)', async () => {
    const def = makeSeqDef({ status: 'production', version: 5, id: 'prod-original' })
    const fetchMock = mockFetchSeq({ status: 201, body: { id: 'server-echo' } })
    vi.stubGlobal('fetch', fetchMock)

    const res = await persistSequenceEdit(def, def)

    expect(res.mode).toBe('new-version')
    expect(res.saved.version).toBe(6)
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>
    expect(calls).toHaveLength(1) // production NEVER overwrites → no DELETE
    expect((calls[0][1].method as string).toUpperCase()).toBe('POST')
    const sent = JSON.parse(calls[0][1].body as string) as Record<string, unknown>
    expect(sent.version).toBe(6)
    expect(sent.id).not.toBe('prod-original') // fresh uuid avoids the 409 PK conflict
    expect(typeof sent.id).toBe('string')
  })

  it('restores the original when an overwrite re-create fails (no data loss)', async () => {
    const original = makeSeqDef({ status: 'draft', version: 2, id: 'y' })
    const edited = { ...original, blocks: [...original.blocks] }
    const fetchMock = mockFetchSeq(
      { status: 204 }, // DELETE old row
      { status: 500, body: { error: 'boom' } }, // re-create fails
      { status: 201, body: { id: 'y' } }, // restore original
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(persistSequenceEdit(edited, original)).rejects.toMatchObject({ status: 500 })

    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>
    expect(calls).toHaveLength(3) // DELETE, failed POST, restore POST
    expect((calls[2][1].method as string).toUpperCase()).toBe('POST')
    const restored = JSON.parse(calls[2][1].body as string) as Record<string, unknown>
    expect(restored.id).toBe('y') // the original is put back
    expect(restored.version).toBe(2)
  })

  it('mode:"overwrite" overrides the production default → overwrites in place (no fork)', async () => {
    const def = makeSeqDef({ status: 'production', version: 4, id: 'prod-keep' })
    const fetchMock = mockFetchSeq({ status: 204 }, { status: 201, body: { id: 'prod-keep' } })
    vi.stubGlobal('fetch', fetchMock)

    const res = await persistSequenceEdit(def, def, { mode: 'overwrite' })

    expect(res.mode).toBe('overwrite')
    expect(res.saved.version).toBe(4) // NOT bumped
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>
    expect((calls[0][1].method as string).toUpperCase()).toBe('DELETE')
    expect(calls[0][0]).toContain('/api/v1/sequences/prod-keep')
    const sent = JSON.parse(calls[1][1].body as string) as Record<string, unknown>
    expect(sent.id).toBe('prod-keep') // same id reused after the delete freed it
    expect(sent.version).toBe(4)
  })

  it('mode:"new-version" overrides the non-production default → forks a fresh id', async () => {
    const def = makeSeqDef({ status: 'draft', version: 1, id: 'draft-x' })
    const fetchMock = mockFetchSeq({ status: 201, body: { id: 'echo' } })
    vi.stubGlobal('fetch', fetchMock)

    const res = await persistSequenceEdit(def, def, { mode: 'new-version' })

    expect(res.mode).toBe('new-version')
    expect(res.saved.version).toBe(2)
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>
    expect(calls).toHaveLength(1) // no DELETE
    const sent = JSON.parse(calls[0][1].body as string) as Record<string, unknown>
    expect(sent.id).not.toBe('draft-x')
  })
})
