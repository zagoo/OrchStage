/**
 * Unit tests for the telemetry API module.
 * Stubs global fetch; asserts correct method, path, body, and query params.
 * DESIGN_REFERENCE §Telemetry (observability.md)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import { ingestTelemetry, ingestTelemetryError, getDashboard } from './telemetry'
import type { IngestTelemetryRequest, IngestErrorRequest, DashboardResponse } from './types/observability'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  })
}

function mockFetch202() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(''),
    json: () => Promise.resolve(undefined),
  })
}

function makeDevice() {
  return {
    device_id: 'device-abc123',
    os_name: 'iOS',
    os_version: '18.0',
    app_version: '2.4.1',
    sdk_version: '1.0.0',
  }
}

function makeTelemetryRequest(eventCount = 1): IngestTelemetryRequest {
  return {
    events: Array.from({ length: eventCount }, (_, i) => ({
      event_type: 'screen_view',
      payload: JSON.stringify({ screen: 'home', idx: i }),
      timestamp: '2026-06-17T10:30:00Z',
      device: makeDevice(),
    })),
    tenant_id: 'acme',
  }
}

function makeErrorRequest(): IngestErrorRequest {
  return {
    error_type: 'NullPointerException',
    message: 'Attempted to read property of null',
    stack_trace: 'at com.example.Foo.bar(Foo.java:42)',
    device: makeDevice(),
    tenant_id: 'acme',
    instance_id: '3f7a1b2c-0000-0000-0000-000000000001',
    sequence_name: 'onboarding-flow',
  }
}

beforeEach(() => {
  setHttpConfig({ baseUrl: '', apiKey: 'test-key', tenantId: 't_acme' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- ingestTelemetry ---------------------------------------------------------

describe('ingestTelemetry', () => {
  it('POST /api/v1/telemetry/mobile returns accepted count (202)', async () => {
    vi.stubGlobal('fetch', mockFetch(202, { accepted: 1 }))

    const result = await ingestTelemetry(makeTelemetryRequest())
    expect(result.accepted).toBe(1)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/telemetry/mobile')
    expect((init.method as string).toUpperCase()).toBe('POST')
  })

  it('sends events array and tenant_id in body (BR-TEL-3)', async () => {
    vi.stubGlobal('fetch', mockFetch(202, { accepted: 2 }))

    const req = makeTelemetryRequest(2)
    await ingestTelemetry(req)

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(Array.isArray(body.events)).toBe(true)
    expect((body.events as unknown[]).length).toBe(2)
    expect(body.tenant_id).toBe('acme')
  })

  it('throws ApiError 413 when batch exceeds 500 items (BR-TEL-1)', async () => {
    vi.stubGlobal('fetch', mockFetch(413, { error: 'batch size 501 exceeds maximum of 500' }))
    await expect(ingestTelemetry(makeTelemetryRequest(501))).rejects.toMatchObject({ status: 413 })
  })

  it('passes abort signal', async () => {
    vi.stubGlobal('fetch', mockFetch(202, { accepted: 1 }))

    const ctrl = new AbortController()
    await ingestTelemetry(makeTelemetryRequest(), ctrl.signal)

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBe(ctrl.signal)
  })
})

// --- ingestTelemetryError ----------------------------------------------------

describe('ingestTelemetryError', () => {
  it('POST /api/v1/telemetry/mobile/errors returns 202 with no body (BR-TEL-4)', async () => {
    vi.stubGlobal('fetch', mockFetch202())

    await expect(ingestTelemetryError(makeErrorRequest())).resolves.toBeUndefined()

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/telemetry/mobile/errors')
    expect((init.method as string).toUpperCase()).toBe('POST')
  })

  it('sends sequence_name to trigger auto-rollback check (BR-TEL-4)', async () => {
    vi.stubGlobal('fetch', mockFetch202())

    const req = makeErrorRequest()
    await ingestTelemetryError(req)

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.sequence_name).toBe('onboarding-flow')
    expect(body.error_type).toBe('NullPointerException')
  })

  it('sends null sequence_name when absent (no rollback check)', async () => {
    vi.stubGlobal('fetch', mockFetch202())

    const req: IngestErrorRequest = { ...makeErrorRequest(), sequence_name: null }
    await ingestTelemetryError(req)

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.sequence_name).toBeNull()
  })

  it('throws ApiError 500 on db failure', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { error: 'internal server error' }))
    await expect(ingestTelemetryError(makeErrorRequest())).rejects.toMatchObject({ status: 500 })
  })
})

// --- getDashboard ------------------------------------------------------------

describe('getDashboard', () => {
  const mockDashboard: DashboardResponse = {
    rows: [
      { dimension: 'iOS 18.0', count: 1200, percentage: 60.0 },
      { dimension: 'Android 14', count: 600, percentage: 30.0 },
    ],
  }

  it('GET /api/v1/telemetry/mobile/dashboard returns rows (BR-TEL-9)', async () => {
    vi.stubGlobal('fetch', mockFetch(200, mockDashboard))

    const result = await getDashboard({ query_type: 'device_os_breakdown' })
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].dimension).toBe('iOS 18.0')
    expect(result.rows[0].percentage).toBe(60.0)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/telemetry/mobile/dashboard')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('sends query_type as query param', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { rows: [] }))

    await getDashboard({ query_type: 'error_rate_per_sequence' })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('query_type=error_rate_per_sequence')
  })

  it('sends start_time and end_time when provided (BR-TEL-9)', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { rows: [] }))

    await getDashboard({
      query_type: 'sync_completed_versions',
      start_time: '2026-06-10T00:00:00Z',
      end_time: '2026-06-17T00:00:00Z',
    })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('start_time=')
    expect(url).toContain('end_time=')
  })

  it('handles all four query_type values without error', async () => {
    const types = ['sync_completed_versions', 'error_rate_per_sequence', 'top_failing_steps', 'device_os_breakdown'] as const
    for (const qt of types) {
      vi.stubGlobal('fetch', mockFetch(200, { rows: [] }))
      await expect(getDashboard({ query_type: qt })).resolves.toEqual({ rows: [] })
      vi.restoreAllMocks()
    }
  })

  it('throws ApiError 400 on invalid query_type', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid query_type' }))
    // @ts-expect-error intentional bad value for test
    await expect(getDashboard({ query_type: 'bogus' })).rejects.toMatchObject({ status: 400 })
  })

  it('passes abort signal', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { rows: [] }))

    const ctrl = new AbortController()
    await getDashboard({ query_type: 'top_failing_steps' }, ctrl.signal)

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBe(ctrl.signal)
  })
})
