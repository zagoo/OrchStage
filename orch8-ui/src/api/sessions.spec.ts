/**
 * Unit tests for the sessions API module.
 * Stubs global fetch and asserts correct method, path, query, and body.
 * DESIGN_REFERENCE §Sessions (human-sessions-stream.md §2, inventory.md §2.9)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  createSession,
  getSession,
  getSessionByKey,
  updateSessionData,
  updateSessionState,
  listSessionInstances,
} from './sessions'
import type { Session, TaskInstance } from './types/sessions'

// --- helpers -----------------------------------------------------------------

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: '018f4e3a-0000-7000-8000-000000000010',
    tenant_id: 'acme-corp',
    session_key: 'user:42:checkout',
    data: { cart_items: 3 },
    state: 'active',
    created_at: '2026-06-17T10:00:00Z',
    updated_at: '2026-06-17T10:00:00Z',
    expires_at: '2026-06-18T10:00:00Z',
    ...overrides,
  }
}

function makeInstance(): TaskInstance {
  return {
    id: '018f4e3a-0000-7000-8000-000000000020',
    sequence_id: '018f4e39-0000-7000-8000-000000000002',
    tenant_id: 'acme-corp',
    namespace: 'default',
    state: 'running',
    next_fire_at: null,
    priority: 'normal',
    timezone: 'UTC',
    metadata: {},
    context: {},
    session_id: '018f4e3a-0000-7000-8000-000000000010',
    created_at: '2026-06-17T10:00:00Z',
    updated_at: '2026-06-17T10:00:00Z',
  }
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(status === 204 ? '' : JSON.stringify(body)),
  })
}

// --- setup -------------------------------------------------------------------

beforeEach(() => {
  setHttpConfig({ baseUrl: '', apiKey: 'test-key', tenantId: 'acme-corp' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- createSession -----------------------------------------------------------

describe('createSession', () => {
  it('POST /api/v1/sessions returns Session on 201', async () => {
    const session = makeSession()
    vi.stubGlobal('fetch', mockFetch(201, session))

    const result = await createSession({
      tenant_id: 'acme-corp',
      session_key: 'user:42:checkout',
      data: { cart_items: 3 },
    })

    expect(result.id).toBe(session.id)
    expect(result.state).toBe('active') // always active at creation
    expect(result.session_key).toBe('user:42:checkout')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sessions')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.tenant_id).toBe('acme-corp')
    expect(body.session_key).toBe('user:42:checkout')
  })

  it('sends expires_at when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(201, makeSession()))

    await createSession({
      tenant_id: 'acme-corp',
      session_key: 'ephemeral-session',
      expires_at: '2026-06-18T10:00:00Z',
    })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.expires_at).toBe('2026-06-18T10:00:00Z')
  })

  it('throws ApiError on 400 when session_key is empty or > 512 chars', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(400, { error: 'invalid argument: session_key must be between 1 and 512 characters' }),
    )

    await expect(
      createSession({ tenant_id: 'acme-corp', session_key: '' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError on 409 when session key already exists for tenant', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { error: 'already exists: session key user:42:checkout' }))

    await expect(
      createSession({ tenant_id: 'acme-corp', session_key: 'user:42:checkout' }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('throws ApiError on 403 when body tenant_id contradicts X-Tenant-Id header', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { error: 'forbidden: tenant mismatch' }))

    await expect(
      createSession({ tenant_id: 'other-tenant', session_key: 'some-key' }),
    ).rejects.toMatchObject({ status: 403 })
  })
})

// --- getSession -------------------------------------------------------------

describe('getSession', () => {
  it('GET /api/v1/sessions/{id} returns Session', async () => {
    const session = makeSession()
    vi.stubGlobal('fetch', mockFetch(200, session))

    const result = await getSession('018f4e3a-0000-7000-8000-000000000010')
    expect(result.id).toBe(session.id)
    expect(result.state).toBe('active')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sessions/018f4e3a-0000-7000-8000-000000000010')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('throws ApiError on 404 when session not found or cross-tenant access', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: session xyz' }))

    await expect(getSession('nonexistent-id')).rejects.toMatchObject({ status: 404 })
  })
})

// --- getSessionByKey ---------------------------------------------------------

describe('getSessionByKey', () => {
  it('GET /api/v1/sessions/by-key/{tenant_id}/{key} returns Session', async () => {
    const session = makeSession()
    vi.stubGlobal('fetch', mockFetch(200, session))

    const result = await getSessionByKey('acme-corp', 'user:42:checkout')
    expect(result.session_key).toBe('user:42:checkout')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/sessions/by-key/acme-corp/user%3A42%3Acheckout')
  })

  it('URL-encodes tenant_id and key in path segments', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makeSession()))

    await getSessionByKey('my tenant', 'key/with/slashes')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('my%20tenant')
    expect(url).toContain('key%2Fwith%2Fslashes')
  })

  it('throws ApiError on 400 when tenant_id exceeds 128 chars', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: tenant_id exceeds maximum length of 128' }))

    const longTenant = 'a'.repeat(129)
    await expect(getSessionByKey(longTenant, 'some-key')).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError on 404 for cross-tenant access (returns 404, not 403)', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: session' }))

    // DESIGN_REFERENCE §Auth: cross-tenant reads return 404 to avoid leaking existence
    await expect(getSessionByKey('other-tenant', 'key')).rejects.toMatchObject({ status: 404 })
  })
})

// --- updateSessionData -------------------------------------------------------

describe('updateSessionData', () => {
  it('PATCH /api/v1/sessions/{id}/data sends full replacement body', async () => {
    vi.stubGlobal('fetch', mockFetch(200, null))

    await updateSessionData('018f4e3a-0000-7000-8000-000000000010', {
      data: { new_field: 'new_value' },
    })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sessions/018f4e3a-0000-7000-8000-000000000010/data')
    expect((init.method as string).toUpperCase()).toBe('PATCH')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    // DESIGN_REFERENCE §Sessions §2.5: full replacement, not merge
    expect(body.data).toEqual({ new_field: 'new_value' })
  })

  it('throws ApiError on 404 when session not found', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: session xyz' }))

    await expect(
      updateSessionData('nonexistent', { data: {} }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

// --- updateSessionState ------------------------------------------------------

describe('updateSessionState', () => {
  it('PATCH /api/v1/sessions/{id}/state sends state body', async () => {
    vi.stubGlobal('fetch', mockFetch(200, null))

    await updateSessionState('018f4e3a-0000-7000-8000-000000000010', { state: 'paused' })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sessions/018f4e3a-0000-7000-8000-000000000010/state')
    expect((init.method as string).toUpperCase()).toBe('PATCH')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.state).toBe('paused')
  })

  it('can transition to completed (terminal state)', async () => {
    vi.stubGlobal('fetch', mockFetch(200, null))

    // DESIGN_REFERENCE §Sessions §2.6: no API-layer transition guard
    await updateSessionState('018f4e3a-0000-7000-8000-000000000010', { state: 'completed' })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.state).toBe('completed')
  })

  it('throws ApiError on 404 when session not found', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: session xyz' }))

    await expect(
      updateSessionState('nonexistent', { state: 'paused' }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError on 400 for unknown state value', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: unknown state' }))

    // TypeScript prevents this at compile time, but the server rejects unknown values
    await expect(
      updateSessionState('some-id', { state: 'unknown' as unknown as 'paused' }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

// --- listSessionInstances ----------------------------------------------------

describe('listSessionInstances', () => {
  it('GET /api/v1/sessions/{id}/instances returns TaskInstance[]', async () => {
    const instances = [makeInstance()]
    vi.stubGlobal('fetch', mockFetch(200, instances))

    const result = await listSessionInstances('018f4e3a-0000-7000-8000-000000000010')
    expect(result).toHaveLength(1)
    expect(result[0].session_id).toBe('018f4e3a-0000-7000-8000-000000000010')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/sessions/018f4e3a-0000-7000-8000-000000000010/instances')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('returns empty array when session has no linked instances', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    const result = await listSessionInstances('018f4e3a-0000-7000-8000-000000000010')
    expect(result).toHaveLength(0)
  })

  it('throws ApiError on 404 when session not found', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: session xyz' }))

    await expect(listSessionInstances('nonexistent')).rejects.toMatchObject({ status: 404 })
  })
})
