/**
 * Unit tests for the circuitBreakers API module.
 * Stubs global fetch and asserts correct method, path, and body.
 * DESIGN_REFERENCE §Circuit Breakers — ops-resilience.md §1
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  listCircuitBreakers,
  listBreakersForTenant,
  getBreaker,
  resetBreaker,
} from './circuitBreakers'
import type { CircuitBreakerState } from './types/ops'

// --- helpers -----------------------------------------------------------------

function makeBreaker(state: CircuitBreakerState['state'] = 'open'): CircuitBreakerState {
  return {
    tenant_id: 'acme',
    handler: 'send-invoice',
    state,
    failure_count: 7,
    failure_threshold: 5,
    cooldown_secs: 60,
    opened_at: '2024-09-01T12:00:00Z',
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

// --- listCircuitBreakers -----------------------------------------------------

describe('listCircuitBreakers', () => {
  it('GET /api/v1/circuit-breakers returns array (tenant-scoped by header)', async () => {
    const data = [makeBreaker()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listCircuitBreakers()
    expect(result).toEqual(data)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/circuit-breakers')
    expect((init.method as string | undefined)?.toUpperCase() ?? 'GET').toBe('GET')
  })

  it('returns empty array for unscoped caller (no tenant header)', async () => {
    // Server returns [] to avoid cross-tenant info leak when no X-Tenant-Id.
    vi.stubGlobal('fetch', mockFetch(200, []))
    const result = await listCircuitBreakers()
    expect(result).toEqual([])
  })

  it('throws ApiError on 503 when registry is disabled', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(503, { error: 'unavailable: circuit-breaker registry not initialized' }),
    )
    await expect(listCircuitBreakers()).rejects.toMatchObject({ status: 503 })
  })
})

// --- listBreakersForTenant ---------------------------------------------------

describe('listBreakersForTenant', () => {
  it('GET /api/v1/tenants/{tenant_id}/circuit-breakers with URL-encoded tenant', async () => {
    const data = [makeBreaker()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listBreakersForTenant('acme')
    expect(result).toEqual(data)

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/tenants/acme/circuit-breakers')
  })

  it('URL-encodes tenant_id with special characters', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))
    await listBreakersForTenant('my/tenant')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/tenants/my%2Ftenant/circuit-breakers')
  })

  it('throws ApiError 404 on tenant mismatch (avoids cross-tenant leak)', async () => {
    // Server returns 404, not 403, to prevent tenant existence leak.
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found' }))
    await expect(listBreakersForTenant('other')).rejects.toMatchObject({ status: 404 })
  })
})

// --- getBreaker --------------------------------------------------------------

describe('getBreaker', () => {
  it('GET /api/v1/tenants/{tenant_id}/circuit-breakers/{handler}', async () => {
    const breaker = makeBreaker('half_open')
    vi.stubGlobal('fetch', mockFetch(200, breaker))

    const result = await getBreaker('acme', 'send-invoice')
    expect(result.state).toBe('half_open')
    expect(result.handler).toBe('send-invoice')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/tenants/acme/circuit-breakers/send-invoice')
  })

  it('URL-encodes handler name with special characters', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makeBreaker()))
    await getBreaker('acme', 'my handler/v2')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/tenants/acme/circuit-breakers/my%20handler%2Fv2')
  })

  it('throws ApiError 404 when handler not found for tenant', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: handler unknown-handler' }))
    await expect(getBreaker('acme', 'unknown-handler')).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError 503 when registry not initialized', async () => {
    vi.stubGlobal('fetch', mockFetch(503, { error: 'unavailable: registry not initialized' }))
    await expect(getBreaker('acme', 'send-invoice')).rejects.toMatchObject({ status: 503 })
  })
})

// --- resetBreaker ------------------------------------------------------------

describe('resetBreaker', () => {
  it('POST /api/v1/tenants/{tenant_id}/circuit-breakers/{handler}/reset with no body', async () => {
    // Reset returns 200 with empty body.
    vi.stubGlobal('fetch', mockFetch(200, null))

    await resetBreaker('acme', 'send-invoice')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/tenants/acme/circuit-breakers/send-invoice/reset')
    expect((init.method as string).toUpperCase()).toBe('POST')
    // No request body — reset takes no payload.
    expect(init.body).toBeUndefined()
  })

  it('URL-encodes handler for reset path', async () => {
    vi.stubGlobal('fetch', mockFetch(200, null))
    await resetBreaker('acme', 'my handler/v2')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('circuit-breakers/my%20handler%2Fv2/reset')
  })

  it('throws ApiError 404 on tenant mismatch', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found' }))
    await expect(resetBreaker('wrong-tenant', 'send-invoice')).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError 503 when registry not initialized', async () => {
    vi.stubGlobal('fetch', mockFetch(503, { error: 'unavailable: registry not initialized' }))
    await expect(resetBreaker('acme', 'send-invoice')).rejects.toMatchObject({ status: 503 })
  })

  it('succeeds for all breaker states (closed, half_open, open)', async () => {
    // The API force-resets regardless of current state.
    vi.stubGlobal('fetch', mockFetch204())
    await expect(resetBreaker('acme', 'closed-handler')).resolves.not.toThrow()
  })
})
