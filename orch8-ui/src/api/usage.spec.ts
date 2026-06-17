/**
 * Unit tests for the usage API module.
 * Stubs global fetch; asserts correct method, path, and query construction.
 * DESIGN_REFERENCE §Usage (observability.md §GET /usage)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import { getUsage } from './usage'
import type { UsageResponse } from './types/observability'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  })
}

function makeUsageResponse(overrides: Partial<UsageResponse> = {}): UsageResponse {
  return {
    tenant: 'acme',
    start: '2026-05-18T00:00:00Z',
    end: '2026-06-17T00:00:00Z',
    usage: [
      {
        kind: 'llm_call',
        model: 'gpt-4o',
        events: 42,
        input_tokens: 100_000,
        output_tokens: 25_000,
        cost_usd: 0.5,
      },
    ],
    total_cost_usd: 0.5,
    cost_is_estimate: true,
    ...overrides,
  }
}

beforeEach(() => {
  setHttpConfig({ baseUrl: '', apiKey: 'test-key', tenantId: 't_acme' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- getUsage ----------------------------------------------------------------

describe('getUsage', () => {
  it('GET /api/v1/usage returns UsageResponse', async () => {
    const data = makeUsageResponse()
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await getUsage({})
    expect(result.tenant).toBe('acme')
    expect(result.usage).toHaveLength(1)
    expect(result.cost_is_estimate).toBe(true)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/usage')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('sends start and end query params as RFC 3339 strings (BR-USG-2)', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makeUsageResponse()))

    const start = '2026-05-18T00:00:00Z'
    const end = '2026-06-17T00:00:00Z'
    await getUsage({ start, end })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain(`start=${encodeURIComponent(start)}`)
    expect(url).toContain(`end=${encodeURIComponent(end)}`)
  })

  it('sends tenant query param for admin callers (BR-USG-1)', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makeUsageResponse({ tenant: 'other' })))

    await getUsage({ tenant: 'other' })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('tenant=other')
    const result = await getUsage({ tenant: 'other' })
    // would not throw; tenant filtering is server-side
    expect(result.tenant).toBe('other')
  })

  it('handles null cost_usd for unknown models (BR-USG-4)', async () => {
    const data = makeUsageResponse({
      usage: [
        { kind: 'llm_call', model: 'totally-unknown', events: 3, input_tokens: 1000, output_tokens: 200, cost_usd: null },
      ],
      total_cost_usd: 0,
    })
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await getUsage({})
    expect(result.usage[0].cost_usd).toBeNull()
    expect(result.total_cost_usd).toBe(0)
  })

  it('throws ApiError on 400 when no tenant is resolvable', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'usage requires a tenant (X-Tenant-Id header or ?tenant=)' }))
    await expect(getUsage({})).rejects.toMatchObject({ status: 400 })
  })

  it('passes abort signal through', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makeUsageResponse()))

    const controller = new AbortController()
    await getUsage({}, controller.signal)

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })
})
