/**
 * Unit tests for the Resource Pools API module.
 * Stubs global fetch; asserts correct method, path, query, and body construction.
 * DESIGN_REFERENCE §Resource Pools (resources.md)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  listPools,
  createPool,
  getPool,
  deletePool,
  listPoolResources,
  addPoolResource,
  updatePoolResource,
  deletePoolResource,
} from './pools'
import type { ResourcePool, PoolResource } from './types/pools'

// --- helpers -----------------------------------------------------------------

const POOL_ID = '01932f4c-6b2a-7c3d-8e4f-5a6b7c8d9e0f'
const RESOURCE_ID = '01932f4c-7c3d-8e4f-9b0a-1b2c3d4e5f6a'

function makePool(id = POOL_ID): ResourcePool {
  return {
    id,
    tenant_id: 't_acme',
    name: 'Email Sender Pool',
    strategy: 'round_robin',
    round_robin_index: 0,
    created_at: '2026-06-17T10:00:00Z',
    updated_at: '2026-06-17T10:00:00Z',
  }
}

function makeResource(id = RESOURCE_ID): PoolResource {
  return {
    id,
    pool_id: POOL_ID,
    resource_key: 'sender@company.com',
    name: 'Primary Sender',
    weight: 2,
    enabled: true,
    daily_cap: 500,
    daily_usage: 0,
    daily_usage_date: null,
    warmup_start: null,
    warmup_days: 0,
    warmup_start_cap: 0,
    created_at: '2026-06-17T10:00:00Z',
  }
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(JSON.stringify(body)),
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

// --- listPools ---------------------------------------------------------------

describe('listPools', () => {
  it('GET /api/v1/pools returns array', async () => {
    vi.stubGlobal('fetch', mockFetch(200, [makePool()]))

    const result = await listPools()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(POOL_ID)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/pools')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('passes tenant_id as query param', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listPools({ tenant_id: 't_acme' })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('tenant_id=t_acme')
  })

  it('throws ApiError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'unauthorized' }))
    await expect(listPools()).rejects.toMatchObject({ status: 401 })
  })
})

// --- createPool --------------------------------------------------------------

describe('createPool', () => {
  it('POST /api/v1/pools with name and strategy', async () => {
    const pool = makePool()
    vi.stubGlobal('fetch', mockFetch(201, pool))

    const result = await createPool({ tenant_id: 't_acme', name: 'Email Sender Pool', strategy: 'round_robin' })
    expect(result.id).toBe(POOL_ID)
    expect(result.strategy).toBe('round_robin')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/pools')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.name).toBe('Email Sender Pool')
    expect(body.tenant_id).toBe('t_acme')
    expect(body.strategy).toBe('round_robin')
  })

  it('throws ApiError on 403 when tenant_id mismatches header', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { error: 'forbidden: tenant mismatch' }))
    await expect(createPool({ tenant_id: 'other', name: 'Pool' })).rejects.toMatchObject({ status: 403 })
  })
})

// --- getPool -----------------------------------------------------------------

describe('getPool', () => {
  it('GET /api/v1/pools/{id} returns pool', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makePool()))

    const result = await getPool(POOL_ID)
    expect(result.id).toBe(POOL_ID)

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain(`/api/v1/pools/${POOL_ID}`)
  })

  it('throws ApiError on 404 (not found or cross-tenant)', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: pool' }))
    await expect(getPool('no-such-id')).rejects.toMatchObject({ status: 404 })
  })
})

// --- deletePool --------------------------------------------------------------

describe('deletePool', () => {
  it('DELETE /api/v1/pools/{id} succeeds with 204', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deletePool(POOL_ID)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/v1/pools/${POOL_ID}`)
    expect((init.method as string).toUpperCase()).toBe('DELETE')
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: pool' }))
    await expect(deletePool('missing')).rejects.toMatchObject({ status: 404 })
  })
})

// --- listPoolResources -------------------------------------------------------

describe('listPoolResources', () => {
  it('GET /api/v1/pools/{pool_id}/resources returns array', async () => {
    vi.stubGlobal('fetch', mockFetch(200, [makeResource()]))

    const result = await listPoolResources(POOL_ID)
    expect(result).toHaveLength(1)
    expect(result[0].resource_key).toBe('sender@company.com')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain(`/api/v1/pools/${POOL_ID}/resources`)
  })

  it('throws ApiError on 404 when pool does not exist', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: pool' }))
    await expect(listPoolResources('no-pool')).rejects.toMatchObject({ status: 404 })
  })
})

// --- addPoolResource ---------------------------------------------------------

describe('addPoolResource', () => {
  it('POST /api/v1/pools/{pool_id}/resources with required fields', async () => {
    const resource = makeResource()
    vi.stubGlobal('fetch', mockFetch(201, resource))

    const result = await addPoolResource(POOL_ID, {
      resource_key: 'sender@company.com',
      name: 'Primary Sender',
      weight: 2,
      daily_cap: 500,
    })
    expect(result.id).toBe(RESOURCE_ID)
    expect(result.enabled).toBe(true) // server always sets enabled=true on create

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/v1/pools/${POOL_ID}/resources`)
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.resource_key).toBe('sender@company.com')
    expect(body.weight).toBe(2)
    expect(body.daily_cap).toBe(500)
  })

  it('throws ApiError on 400 when weight is 0 (business rule: weight >= 1)', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: weight must be >= 1' }))
    await expect(
      addPoolResource(POOL_ID, { resource_key: 'key', name: 'Name', weight: 0 }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError on 400 when resource_key is empty', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: resource_key is empty' }))
    await expect(
      addPoolResource(POOL_ID, { resource_key: '', name: 'Name' }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

// --- updatePoolResource ------------------------------------------------------

describe('updatePoolResource', () => {
  it('PUT /api/v1/pools/{pool_id}/resources/{resource_id} with partial fields', async () => {
    const updated = { ...makeResource(), name: 'Updated Sender', weight: 5 }
    vi.stubGlobal('fetch', mockFetch(200, updated))

    const result = await updatePoolResource(POOL_ID, RESOURCE_ID, { name: 'Updated Sender', weight: 5 })
    expect(result.name).toBe('Updated Sender')
    expect(result.weight).toBe(5)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/v1/pools/${POOL_ID}/resources/${RESOURCE_ID}`)
    expect((init.method as string).toUpperCase()).toBe('PUT')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.name).toBe('Updated Sender')
    expect(body.weight).toBe(5)
  })

  it('throws ApiError on 404 when resource or pool not found', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: resource' }))
    await expect(updatePoolResource(POOL_ID, 'no-resource', {})).rejects.toMatchObject({ status: 404 })
  })
})

// --- deletePoolResource ------------------------------------------------------

describe('deletePoolResource', () => {
  it('DELETE /api/v1/pools/{pool_id}/resources/{resource_id} succeeds with 204', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deletePoolResource(POOL_ID, RESOURCE_ID)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/v1/pools/${POOL_ID}/resources/${RESOURCE_ID}`)
    expect((init.method as string).toUpperCase()).toBe('DELETE')
  })

  it('throws ApiError on 404 when pool is not found (pool access checked first)', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: pool' }))
    await expect(deletePoolResource('no-pool', RESOURCE_ID)).rejects.toMatchObject({ status: 404 })
  })
})
