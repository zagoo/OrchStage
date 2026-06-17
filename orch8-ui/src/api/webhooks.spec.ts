/**
 * Unit tests for the webhooks API module (outbox endpoints).
 * Stubs global fetch and asserts correct method, path, query, and body.
 * DESIGN_REFERENCE §Webhook Outbox — ops-resilience.md §5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import { listWebhookOutbox, redeliverOutbox, discardOutbox } from './webhooks'
import type { WebhookOutboxEntry, RedeliverResponse } from './types/ops'

// --- helpers -----------------------------------------------------------------

function makeEntry(id = '550e8400-e29b-41d4-a716-446655440002'): WebhookOutboxEntry {
  return {
    id,
    url: 'https://hooks.example.com/events',
    event_type: 'instance.failed',
    instance_id: '550e8400-e29b-41d4-a716-446655440001',
    payload: { event: 'instance.failed', data: {} },
    attempts: 4,
    last_error: '502 Bad Gateway',
    created_at: '2024-09-01T12:00:00Z',
  }
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

function mockFetch204() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 204,
    headers: new Headers({ 'content-length': '0' }),
    text: () => Promise.resolve(''),
  })
}

// --- setup -------------------------------------------------------------------

beforeEach(() => {
  setHttpConfig({ baseUrl: '', apiKey: 'test-key', tenantId: 'acme' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- listWebhookOutbox -------------------------------------------------------

describe('listWebhookOutbox', () => {
  it('GET /api/v1/webhooks/outbox returns array (newest first)', async () => {
    const data = [makeEntry()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listWebhookOutbox()
    expect(result).toEqual(data)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/webhooks/outbox')
    expect((init.method as string | undefined)?.toUpperCase() ?? 'GET').toBe('GET')
  })

  it('passes limit query param when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))
    await listWebhookOutbox({ limit: 50 })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('limit=50')
  })

  it('returns empty array when outbox is clear', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))
    const result = await listWebhookOutbox()
    expect(result).toEqual([])
  })

  it('throws ApiError 500 on storage error', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { error: 'internal server error' }))
    await expect(listWebhookOutbox()).rejects.toMatchObject({ status: 500 })
  })
})

// --- redeliverOutbox ---------------------------------------------------------

describe('redeliverOutbox', () => {
  it('POST /api/v1/webhooks/outbox/{id}/redeliver returns redelivered=true on success', async () => {
    const res: RedeliverResponse = { redelivered: true }
    vi.stubGlobal('fetch', mockFetch(200, res))

    const result = await redeliverOutbox('550e8400-e29b-41d4-a716-446655440002')
    expect(result.redelivered).toBe(true)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/webhooks/outbox/550e8400-e29b-41d4-a716-446655440002/redeliver')
    expect((init.method as string).toUpperCase()).toBe('POST')
    // No request body — redeliver takes no payload.
    expect(init.body).toBeUndefined()
  })

  it('URL-encodes the delivery ID', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { redelivered: true }))
    // In practice IDs are UUIDs and don't need encoding, but the function must
    // use encodeURIComponent defensively.
    await redeliverOutbox('my/id')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/webhooks/outbox/my%2Fid/redeliver')
  })

  it('throws ApiError 404 when entry not found', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: outbox entry' }))
    await expect(redeliverOutbox('nonexistent')).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError 502 when redeliver attempt itself fails (row is kept)', async () => {
    // 502 means the HTTP call to the destination failed; the outbox row is kept.
    vi.stubGlobal('fetch', mockFetch(502, { error: 'bad gateway: POST https://hooks.example.com failed: connection refused' }))
    await expect(redeliverOutbox('550e8400-e29b-41d4-a716-446655440002')).rejects.toMatchObject({ status: 502 })
  })
})

// --- discardOutbox -----------------------------------------------------------

describe('discardOutbox', () => {
  it('DELETE /api/v1/webhooks/outbox/{id} returns 204', async () => {
    vi.stubGlobal('fetch', mockFetch204())

    await discardOutbox('550e8400-e29b-41d4-a716-446655440002')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/webhooks/outbox/550e8400-e29b-41d4-a716-446655440002')
    expect((init.method as string).toUpperCase()).toBe('DELETE')
  })

  it('URL-encodes the delivery ID for delete', async () => {
    vi.stubGlobal('fetch', mockFetch204())
    await discardOutbox('my/id')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/webhooks/outbox/my%2Fid')
    // Must NOT contain the /redeliver suffix.
    expect(url).not.toContain('redeliver')
  })

  it('throws ApiError 500 on storage error', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { error: 'internal server error' }))
    await expect(discardOutbox('550e8400-e29b-41d4-a716-446655440002')).rejects.toMatchObject({
      status: 500,
    })
  })
})
