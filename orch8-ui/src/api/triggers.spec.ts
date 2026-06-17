/**
 * Unit tests for triggers API module.
 * Stubs global fetch and asserts correct method, path, query, body construction.
 * DESIGN_REFERENCE §Triggers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  listTriggers,
  createTrigger,
  getTrigger,
  deleteTrigger,
  fireTrigger,
} from './triggers'
import type { TriggerDef, FireTriggerResponse } from './types/triggers'

// --- helpers -----------------------------------------------------------------

function makeTrigger(slug = 'on-push'): TriggerDef {
  return {
    slug,
    sequence_name: 'ci-pipeline',
    version: null,
    tenant_id: 't_acme',
    namespace: 'default',
    enabled: true,
    secret: null,
    trigger_type: 'webhook',
    config: null,
    created_at: '2026-06-17T10:00:00Z',
    updated_at: '2026-06-17T10:00:00Z',
  }
}

function mockFetch(status: number, body: unknown, headers?: Record<string, string>) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
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

// --- listTriggers ------------------------------------------------------------

describe('listTriggers', () => {
  it('GET /api/v1/triggers returns array', async () => {
    const data = [makeTrigger()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listTriggers()
    expect(result).toEqual(data)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/triggers')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('passes tenant_id and limit as query params', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listTriggers({ tenant_id: 't_acme', limit: 50 })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('tenant_id=t_acme')
    expect(url).toContain('limit=50')
  })

  it('throws ApiError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'unauthorized' }))

    await expect(listTriggers()).rejects.toMatchObject({ status: 401 })
  })
})

// --- createTrigger -----------------------------------------------------------

describe('createTrigger', () => {
  it('POST /api/v1/triggers with correct body', async () => {
    const trigger = makeTrigger()
    vi.stubGlobal('fetch', mockFetch(201, trigger))

    const result = await createTrigger({
      slug: 'on-push',
      sequence_name: 'ci-pipeline',
      tenant_id: 't_acme',
    })

    expect(result.slug).toBe('on-push')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/triggers')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.slug).toBe('on-push')
    expect(body.sequence_name).toBe('ci-pipeline')
    expect(body.tenant_id).toBe('t_acme')
  })

  it('throws ApiError on 409 conflict (duplicate slug)', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { error: 'already exists: slug on-push' }))

    await expect(
      createTrigger({ slug: 'on-push', sequence_name: 'ci-pipeline', tenant_id: 't_acme' }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('throws ApiError on 400 validation failure', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: slug is empty' }))

    await expect(
      createTrigger({ slug: '', sequence_name: 'ci-pipeline', tenant_id: 't_acme' }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

// --- getTrigger --------------------------------------------------------------

describe('getTrigger', () => {
  it('GET /api/v1/triggers/{slug} with URL-encoded slug', async () => {
    const trigger = makeTrigger('my-trigger')
    vi.stubGlobal('fetch', mockFetch(200, trigger))

    const result = await getTrigger('my-trigger')
    expect(result.slug).toBe('my-trigger')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/triggers/my-trigger')
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: trigger no-such-slug' }))

    await expect(getTrigger('no-such-slug')).rejects.toMatchObject({ status: 404 })
  })

  it('URL-encodes slugs with special characters', async () => {
    const trigger = { ...makeTrigger(), slug: 'a/b' }
    vi.stubGlobal('fetch', mockFetch(200, trigger))

    await getTrigger('a/b')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/triggers/a%2Fb')
  })
})

// --- deleteTrigger -----------------------------------------------------------

describe('deleteTrigger', () => {
  it('DELETE /api/v1/triggers/{slug}', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deleteTrigger('on-push')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/triggers/on-push')
    expect((init.method as string).toUpperCase()).toBe('DELETE')
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: trigger missing' }))

    await expect(deleteTrigger('missing')).rejects.toMatchObject({ status: 404 })
  })
})

// --- fireTrigger -------------------------------------------------------------

describe('fireTrigger', () => {
  it('POST /api/v1/triggers/{slug}/fire with payload', async () => {
    const fireRes: FireTriggerResponse = {
      instance_id: '019xxxx-0000-7000-0000-000000000001',
      trigger: 'on-push',
      sequence_name: 'ci-pipeline',
    }
    vi.stubGlobal('fetch', mockFetch(201, fireRes))

    const result = await fireTrigger('on-push', { ref: 'main' })
    expect(result.instance_id).toBe(fireRes.instance_id)
    expect(result.trigger).toBe('on-push')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/triggers/on-push/fire')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.ref).toBe('main')
  })

  it('sends X-Trigger-Secret header when provided', async () => {
    const fireRes: FireTriggerResponse = {
      instance_id: '019xxxx-0000-7000-0000-000000000002',
      trigger: 'on-push',
      sequence_name: 'ci-pipeline',
    }
    vi.stubGlobal('fetch', mockFetch(201, fireRes))

    await fireTrigger('on-push', {}, 'my-secret')

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers as HeadersInit)
    expect(headers.get('X-Trigger-Secret')).toBe('my-secret')
  })

  it('does NOT send X-Trigger-Secret when not provided', async () => {
    const fireRes: FireTriggerResponse = {
      instance_id: '019xxxx-0000-7000-0000-000000000003',
      trigger: 'on-push',
      sequence_name: 'ci-pipeline',
    }
    vi.stubGlobal('fetch', mockFetch(201, fireRes))

    await fireTrigger('on-push', {})

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers as HeadersInit)
    expect(headers.get('X-Trigger-Secret')).toBeNull()
  })

  it('returns 400 when trigger is disabled', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: "trigger 'on-push' is disabled" }))

    await expect(fireTrigger('on-push', {})).rejects.toMatchObject({ status: 400 })
  })

  it('returns 401 when secret mismatches', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'unauthorized' }))

    await expect(fireTrigger('on-push', {}, 'wrong-secret')).rejects.toMatchObject({ status: 401 })
  })
})
