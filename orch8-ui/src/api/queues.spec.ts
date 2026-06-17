/**
 * Unit tests for queues API module.
 * Stubs global fetch and asserts correct method, path, query, body construction.
 * DESIGN_REFERENCE §Queue Dispatch Config, §Queue Routing Rules
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  setDispatch,
  listDispatch,
  deleteDispatch,
  createRoutingRule,
  listRoutingRules,
  getRoutingRule,
  deleteRoutingRule,
} from './queues'
import type { QueueDispatchConfig, QueueRoutingRule } from './types/queues'

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

function makeDispatch(queueName = 'bulk-email'): QueueDispatchConfig {
  return {
    tenant_id: 'acme',
    queue_name: queueName,
    mode: 'poll',
    push_url: null,
    created_at: '2026-06-17T10:00:00Z',
    updated_at: '2026-06-17T10:00:00Z',
  }
}

function makeRule(id = 'rule-uuid-1'): QueueRoutingRule {
  return {
    id,
    tenant_id: 'acme',
    handler_name: 'send-email',
    match_queue: null,
    queue_override: 'bulk-email',
    priority: 10,
    enabled: true,
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

// --- setDispatch -------------------------------------------------------------

describe('setDispatch', () => {
  it('POST /api/v1/queues/dispatch creates poll config', async () => {
    const cfg = makeDispatch()
    vi.stubGlobal('fetch', mockFetch(200, cfg))

    const result = await setDispatch({ tenant_id: 'acme', queue_name: 'bulk-email', mode: 'poll' })
    expect(result.mode).toBe('poll')
    expect(result.queue_name).toBe('bulk-email')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/queues/dispatch')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.mode).toBe('poll')
    expect(body.tenant_id).toBe('acme')
    expect(body.queue_name).toBe('bulk-email')
  })

  it('POST /api/v1/queues/dispatch creates push config with URL', async () => {
    const cfg: QueueDispatchConfig = {
      ...makeDispatch(),
      mode: 'push',
      push_url: 'https://worker.example.com/tasks',
    }
    vi.stubGlobal('fetch', mockFetch(200, cfg))

    const result = await setDispatch({
      tenant_id: 'acme',
      queue_name: 'bulk-email',
      mode: 'push',
      push_url: 'https://worker.example.com/tasks',
    })
    expect(result.mode).toBe('push')
    expect(result.push_url).toBe('https://worker.example.com/tasks')
  })

  it('throws ApiError on 400 when queue_name is empty', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: queue_name is empty' }))
    await expect(
      setDispatch({ tenant_id: 'acme', queue_name: '', mode: 'poll' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError on 400 when push mode lacks push_url', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: push_url required for push mode' }))
    await expect(
      setDispatch({ tenant_id: 'acme', queue_name: 'q', mode: 'push' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('response never includes secret field — write-only', async () => {
    const cfg = makeDispatch()
    vi.stubGlobal('fetch', mockFetch(200, cfg))

    const result = await setDispatch({
      tenant_id: 'acme',
      queue_name: 'bulk-email',
      mode: 'poll',
      secret: 'my-hmac-secret',
    })
    // secret is not echoed in response (business rule §queue dispatch)
    expect('secret' in result ? (result as unknown as Record<string, unknown>).secret : undefined).toBeUndefined()
  })
})

// --- listDispatch ------------------------------------------------------------

describe('listDispatch', () => {
  it('GET /api/v1/queues/dispatch returns array', async () => {
    const data = [makeDispatch()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listDispatch()
    expect(result).toHaveLength(1)
    expect(result[0].queue_name).toBe('bulk-email')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/queues/dispatch')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('GET /api/v1/queues/dispatch — wrapped { items } payload', async () => {
    const data = { items: [makeDispatch()] }
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listDispatch()
    expect(result).toHaveLength(1)
  })

  it('passes tenant_id as query param', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listDispatch({ tenant_id: 'acme' })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('tenant_id=acme')
  })

  it('throws ApiError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'unauthorized' }))
    await expect(listDispatch()).rejects.toMatchObject({ status: 401 })
  })
})

// --- deleteDispatch ----------------------------------------------------------

describe('deleteDispatch', () => {
  it('DELETE /api/v1/queues/dispatch/{tenant_id}/{queue_name}', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deleteDispatch('acme', 'bulk-email')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/queues/dispatch/acme/bulk-email')
    expect((init.method as string).toUpperCase()).toBe('DELETE')
  })

  it('URL-encodes tenant_id and queue_name', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deleteDispatch('acme/prod', 'my queue')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('acme%2Fprod')
    expect(url).toContain('my%20queue')
  })
})

// --- createRoutingRule -------------------------------------------------------

describe('createRoutingRule', () => {
  it('POST /api/v1/routing-rules with correct body', async () => {
    const rule = makeRule()
    vi.stubGlobal('fetch', mockFetch(201, rule))

    const result = await createRoutingRule({
      tenant_id: 'acme',
      handler_name: 'send-email',
      queue_override: 'bulk-email',
      priority: 10,
    })
    expect(result.id).toBe('rule-uuid-1')
    expect(result.handler_name).toBe('send-email')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/routing-rules')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.handler_name).toBe('send-email')
    expect(body.queue_override).toBe('bulk-email')
    expect(body.priority).toBe(10)
  })

  it('throws ApiError on 400 when handler_name is empty', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: handler_name is empty' }))
    await expect(
      createRoutingRule({ tenant_id: 'acme', handler_name: '', queue_override: 'q' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError on 400 when queue_override is empty', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: queue_override is empty' }))
    await expect(
      createRoutingRule({ tenant_id: 'acme', handler_name: 'send-email', queue_override: '' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError on 403 tenant mismatch', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { error: 'forbidden: tenant mismatch' }))
    await expect(
      createRoutingRule({ tenant_id: 'other', handler_name: 'h', queue_override: 'q' }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('sends match_queue when provided', async () => {
    const rule = { ...makeRule(), match_queue: 'source-queue' }
    vi.stubGlobal('fetch', mockFetch(201, rule))

    await createRoutingRule({
      tenant_id: 'acme',
      handler_name: 'send-email',
      queue_override: 'bulk-email',
      match_queue: 'source-queue',
    })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.match_queue).toBe('source-queue')
  })
})

// --- listRoutingRules --------------------------------------------------------

describe('listRoutingRules', () => {
  it('GET /api/v1/routing-rules returns array', async () => {
    const data = [makeRule()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listRoutingRules()
    expect(result).toHaveLength(1)
    expect(result[0].handler_name).toBe('send-email')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/routing-rules')
  })

  it('passes tenant_id and handler_name as query params', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listRoutingRules({ tenant_id: 'acme', handler_name: 'send-email' })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('tenant_id=acme')
    expect(url).toContain('handler_name=send-email')
  })
})

// --- getRoutingRule ----------------------------------------------------------

describe('getRoutingRule', () => {
  it('GET /api/v1/routing-rules/{id}', async () => {
    const rule = makeRule()
    vi.stubGlobal('fetch', mockFetch(200, rule))

    const result = await getRoutingRule('rule-uuid-1')
    expect(result.id).toBe('rule-uuid-1')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/routing-rules/rule-uuid-1')
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: routing rule' }))
    await expect(getRoutingRule('missing')).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError on 403 cross-tenant access', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { error: 'forbidden: cross-tenant access denied' }))
    await expect(getRoutingRule('other-tenant-rule')).rejects.toMatchObject({ status: 403 })
  })
})

// --- deleteRoutingRule -------------------------------------------------------

describe('deleteRoutingRule', () => {
  it('DELETE /api/v1/routing-rules/{id}', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deleteRoutingRule('rule-uuid-1')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/routing-rules/rule-uuid-1')
    expect((init.method as string).toUpperCase()).toBe('DELETE')
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: routing rule missing' }))
    await expect(deleteRoutingRule('missing')).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError on 403 cross-tenant', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { error: 'forbidden: cross-tenant delete denied' }))
    await expect(deleteRoutingRule('other-tenant-rule')).rejects.toMatchObject({ status: 403 })
  })
})
