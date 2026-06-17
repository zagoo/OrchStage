/**
 * Unit tests for sequences API module.
 * Stubs global fetch and asserts correct method, path, query, and body.
 * DESIGN_REFERENCE §Sequences (dag-sequences.md §9)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  listSequences,
  listSequencesArray,
  getSequence,
  getSequenceByName,
  listSequenceVersions,
  createSequence,
  deleteSequence,
  deprecateSequence,
  setSequenceStatus,
  promoteSequence,
  unpublishSequence,
} from './sequences'
import type { SequenceDefinition, CreateSequenceRequest } from './types/sequences'

// --- helpers -----------------------------------------------------------------

function makeSeq(overrides: Partial<SequenceDefinition> = {}): SequenceDefinition {
  return {
    id: '019xxxx-0000-7000-0000-000000000001',
    tenant_id: 't_acme',
    namespace: 'default',
    name: 'my-workflow',
    version: 1,
    deprecated: false,
    status: 'production',
    blocks: [{ type: 'step', id: 'step_1', handler: 'noop', cancellable: true }],
    created_at: '2026-06-17T10:00:00Z',
    ...overrides,
  }
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(status === 204 ? '' : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  })
}

// --- setup -------------------------------------------------------------------

beforeEach(() => {
  setHttpConfig({ baseUrl: '', apiKey: 'test-key', tenantId: 't_acme' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- listSequences (§9.4) ----------------------------------------------------

describe('listSequences', () => {
  it('GET /api/v1/sequences returns paginated wrapper', async () => {
    const payload = { items: [makeSeq()], has_more: false }
    vi.stubGlobal('fetch', mockFetch(200, payload))

    const result = await listSequences()
    expect(result.items).toHaveLength(1)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sequences')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('sends namespace and offset query params', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { items: [] }))

    await listSequences({ namespace: 'prod', offset: 50, limit: 25 })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('namespace=prod')
    expect(url).toContain('offset=50')
    expect(url).toContain('limit=25')
  })

  it('throws ApiError on 401 unauthorized', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'unauthorized' }))

    await expect(listSequences()).rejects.toMatchObject({ status: 401 })
  })
})

// --- listSequencesArray (§9.5) -----------------------------------------------

describe('listSequencesArray', () => {
  it('GET /api/v1/sequences.json returns flat array', async () => {
    const payload = [makeSeq()]
    vi.stubGlobal('fetch', mockFetch(200, payload))

    const result = await listSequencesArray()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('my-workflow')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/sequences.json')
  })

  it('normalises an object with items array', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { items: [makeSeq()] }))

    const result = await listSequencesArray()
    expect(result).toHaveLength(1)
  })
})

// --- getSequence (§9.2) ------------------------------------------------------

describe('getSequence', () => {
  it('GET /api/v1/sequences/{id} returns SequenceDefinition', async () => {
    const seq = makeSeq()
    vi.stubGlobal('fetch', mockFetch(200, seq))

    const result = await getSequence(seq.id)
    expect(result.id).toBe(seq.id)
    expect(result.name).toBe('my-workflow')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain(`/api/v1/sequences/${seq.id}`)
  })

  it('throws ApiError 404 when sequence not found', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: sequence abc' }))

    await expect(getSequence('abc')).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError 403 on tenant isolation violation', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { error: 'forbidden: tenant isolation' }))

    await expect(getSequence('abc')).rejects.toMatchObject({ status: 403 })
  })
})

// --- getSequenceByName (§9.3) ------------------------------------------------

describe('getSequenceByName', () => {
  it('GET /api/v1/sequences/by-name with query params', async () => {
    const seq = makeSeq()
    vi.stubGlobal('fetch', mockFetch(200, seq))

    const result = await getSequenceByName({
      tenant_id: 't_acme',
      namespace: 'default',
      name: 'my-workflow',
    })
    expect(result.name).toBe('my-workflow')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/sequences/by-name')
    expect(url).toContain('tenant_id=t_acme')
    expect(url).toContain('name=my-workflow')
  })

  it('throws ApiError 404 when not found', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: sequence no-such' }))

    await expect(
      getSequenceByName({ tenant_id: 't_acme', namespace: 'default', name: 'no-such' }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

// --- listSequenceVersions (§9.6) ---------------------------------------------

describe('listSequenceVersions', () => {
  it('GET /api/v1/sequences/versions returns all versions', async () => {
    const versions = [makeSeq({ version: 1 }), makeSeq({ version: 2 })]
    vi.stubGlobal('fetch', mockFetch(200, versions))

    const result = await listSequenceVersions({
      tenant_id: 't_acme',
      namespace: 'default',
      name: 'my-workflow',
    })
    expect(result).toHaveLength(2)

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/sequences/versions')
    expect(url).toContain('name=my-workflow')
  })
})

// --- createSequence (§9.1) ---------------------------------------------------

describe('createSequence', () => {
  it('POST /api/v1/sequences with correct body returns 201', async () => {
    const response = { id: '019xxxx-0000-7000-0000-000000000001', warnings: [] }
    vi.stubGlobal('fetch', mockFetch(201, response))

    const body: CreateSequenceRequest = {
      id: '019xxxx-0000-7000-0000-000000000001',
      tenant_id: 't_acme',
      namespace: 'default',
      name: 'my-workflow',
      version: 1,
      blocks: [{ type: 'step', id: 'step_1', handler: 'noop', cancellable: true }],
      created_at: '2026-06-17T10:00:00Z',
    }

    const result = await createSequence(body)
    expect(result.id).toBe(body.id)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sequences')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const sent = JSON.parse(init.body as string) as Record<string, unknown>
    expect(sent.name).toBe('my-workflow')
    expect(sent.namespace).toBe('default')
  })

  it('throws ApiError 409 on duplicate sequence', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { error: 'already exists: sequence my-workflow' }))

    await expect(
      createSequence({
        id: '019xxxx-0000-7000-0000-000000000001',
        tenant_id: 't_acme',
        namespace: 'default',
        name: 'my-workflow',
        version: 1,
        blocks: [{ type: 'step', id: 's1', handler: 'noop', cancellable: true }],
        created_at: '2026-06-17T10:00:00Z',
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('throws ApiError 400 on validation failure (empty block handler)', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: step handler must be non-empty' }))

    await expect(
      createSequence({
        id: '019xxxx-0000-7000-0000-000000000001',
        tenant_id: 't_acme',
        namespace: 'default',
        name: 'bad-seq',
        version: 1,
        blocks: [{ type: 'step', id: 's1', handler: '', cancellable: true }],
        created_at: '2026-06-17T10:00:00Z',
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError 422 on malformed input_schema', async () => {
    vi.stubGlobal('fetch', mockFetch(422, { error: 'unprocessable entity: invalid json schema' }))

    await expect(
      createSequence({
        id: '019xxxx-0000-7000-0000-000000000001',
        tenant_id: 't_acme',
        namespace: 'default',
        name: 'schema-seq',
        version: 1,
        blocks: [{ type: 'step', id: 's1', handler: 'noop', cancellable: true }],
        input_schema: 'not-an-object',
        created_at: '2026-06-17T10:00:00Z',
      }),
    ).rejects.toMatchObject({ status: 422 })
  })
})

// --- deleteSequence (§9.7) ---------------------------------------------------

describe('deleteSequence', () => {
  it('DELETE /api/v1/sequences/{id} returns 204', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deleteSequence('019xxxx-0000-7000-0000-000000000001')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sequences/019xxxx-0000-7000-0000-000000000001')
    expect((init.method as string).toUpperCase()).toBe('DELETE')
  })

  it('throws ApiError 409 when active instances reference the sequence', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { error: 'conflict: active instances reference this sequence' }))

    await expect(deleteSequence('abc')).rejects.toMatchObject({ status: 409 })
  })

  it('throws ApiError 404 when sequence not found', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: sequence abc' }))

    await expect(deleteSequence('abc')).rejects.toMatchObject({ status: 404 })
  })
})

// --- deprecateSequence (§9.8) ------------------------------------------------

describe('deprecateSequence', () => {
  it('POST /api/v1/sequences/{id}/deprecate returns 204', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deprecateSequence('019xxxx-0000-7000-0000-000000000001')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sequences/019xxxx-0000-7000-0000-000000000001/deprecate')
    expect((init.method as string).toUpperCase()).toBe('POST')
  })
})

// --- setSequenceStatus (§9.9) ------------------------------------------------

describe('setSequenceStatus', () => {
  it('POST /api/v1/sequences/{id}/status with status body', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await setSequenceStatus('abc', { status: 'staging' })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sequences/abc/status')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.status).toBe('staging')
  })

  it('throws ApiError 400 on invalid transition', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: invalid transition from production to draft' }))

    // production → draft is not a valid transition
    await expect(setSequenceStatus('abc', { status: 'draft' })).rejects.toMatchObject({ status: 400 })
  })

  it('sets status to unpublished (also deprecates internally)', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await setSequenceStatus('abc', { status: 'unpublished' })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.status).toBe('unpublished')
  })
})

// --- promoteSequence (§9.11) -------------------------------------------------

describe('promoteSequence', () => {
  it('POST /api/v1/sequences/{name}/promote returns new version', async () => {
    const res = { id: '019xxxx-0000-7000-0000-000000000002', version: 2 }
    vi.stubGlobal('fetch', mockFetch(201, res))

    const result = await promoteSequence('my-workflow')
    expect(result.version).toBe(2)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sequences/my-workflow/promote')
    expect((init.method as string).toUpperCase()).toBe('POST')
  })

  it('throws ApiError 400 when source is not in staging', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: sequence must be in staging to promote' }))

    await expect(promoteSequence('my-workflow')).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError 404 when no versions exist for name', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: sequence no-such-workflow' }))

    await expect(promoteSequence('no-such-workflow')).rejects.toMatchObject({ status: 404 })
  })
})

// --- unpublishSequence (§9.10) -----------------------------------------------

describe('unpublishSequence', () => {
  it('POST /api/v1/sequences/{name}/unpublish with delete=false', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await unpublishSequence('my-workflow', { delete: false })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sequences/my-workflow/unpublish')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.delete).toBe(false)
  })

  it('POST with delete=true hard-deletes all versions after deprecating', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await unpublishSequence('my-workflow', { delete: true })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.delete).toBe(true)
  })
})
