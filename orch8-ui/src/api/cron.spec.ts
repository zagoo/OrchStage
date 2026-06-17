/**
 * Unit tests for cron API module.
 * Stubs global fetch and asserts correct method, path, query, body construction.
 * DESIGN_REFERENCE §Cron Schedules
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  listCron,
  createCron,
  getCron,
  getCronNextFires,
  updateCron,
  deleteCron,
} from './cron'
import type { CronSchedule, CreateCronResponse, NextFiresResponse } from './types/cron'

// --- helpers -----------------------------------------------------------------

const SCHEDULE_ID = '019f0000-0000-7000-8000-000000000001'
const SEQUENCE_ID = '018e0000-0000-7000-8000-000000000001'

function makeSchedule(id = SCHEDULE_ID): CronSchedule {
  return {
    id,
    tenant_id: 't_acme',
    namespace: 'default',
    sequence_id: SEQUENCE_ID,
    cron_expr: '0 9 * * MON-FRI',
    timezone: 'UTC',
    enabled: true,
    metadata: {},
    overlap_policy: 'allow',
    skipped_fires: 0,
    last_skipped_at: null,
    last_triggered_at: null,
    next_fire_at: '2026-06-18T09:00:00Z',
    created_at: '2026-06-17T10:00:00Z',
    updated_at: '2026-06-17T10:00:00Z',
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

// --- listCron ----------------------------------------------------------------

describe('listCron', () => {
  it('GET /api/v1/cron returns array', async () => {
    const data = [makeSchedule()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listCron()
    expect(result).toEqual(data)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/cron')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('passes tenant_id and limit', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listCron({ tenant_id: 't_acme', limit: 25 })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('tenant_id=t_acme')
    expect(url).toContain('limit=25')
  })
})

// --- createCron --------------------------------------------------------------

describe('createCron', () => {
  it('POST /api/v1/cron returns minimal id + next_fire_at response', async () => {
    const res: CreateCronResponse = { id: SCHEDULE_ID, next_fire_at: '2026-06-18T09:00:00Z' }
    vi.stubGlobal('fetch', mockFetch(201, res))

    const result = await createCron({
      tenant_id: 't_acme',
      namespace: 'default',
      sequence_id: SEQUENCE_ID,
      cron_expr: '0 9 * * MON-FRI',
    })

    expect(result.id).toBe(SCHEDULE_ID)
    expect(result.next_fire_at).toBe('2026-06-18T09:00:00Z')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/cron')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.cron_expr).toBe('0 9 * * MON-FRI')
    expect(body.sequence_id).toBe(SEQUENCE_ID)
    expect(body.tenant_id).toBe('t_acme')
  })

  it('throws ApiError on 400 invalid cron expression', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid cron expression: bad' }))

    await expect(
      createCron({ tenant_id: 't_acme', namespace: 'default', sequence_id: SEQUENCE_ID, cron_expr: 'bad' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('sends optional timezone and overlap_policy', async () => {
    const res: CreateCronResponse = { id: SCHEDULE_ID, next_fire_at: null }
    vi.stubGlobal('fetch', mockFetch(201, res))

    await createCron({
      tenant_id: 't_acme',
      namespace: 'default',
      sequence_id: SEQUENCE_ID,
      cron_expr: '*/5 * * * *',
      timezone: 'America/New_York',
      overlap_policy: 'skip',
      enabled: false,
    })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.timezone).toBe('America/New_York')
    expect(body.overlap_policy).toBe('skip')
    expect(body.enabled).toBe(false)
  })
})

// --- getCron -----------------------------------------------------------------

describe('getCron', () => {
  it('GET /api/v1/cron/{id} returns full schedule', async () => {
    const schedule = makeSchedule()
    vi.stubGlobal('fetch', mockFetch(200, schedule))

    const result = await getCron(SCHEDULE_ID)
    expect(result.id).toBe(SCHEDULE_ID)
    expect(result.cron_expr).toBe('0 9 * * MON-FRI')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain(`/api/v1/cron/${SCHEDULE_ID}`)
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: cron schedule missing' }))

    await expect(getCron('nonexistent')).rejects.toMatchObject({ status: 404 })
  })
})

// --- getCronNextFires --------------------------------------------------------

describe('getCronNextFires', () => {
  it('GET /api/v1/cron/{id}/next-fires returns fires array', async () => {
    const res: NextFiresResponse = {
      timezone: 'UTC',
      fires: ['2026-06-18T09:00:00Z', '2026-06-19T09:00:00Z'],
    }
    vi.stubGlobal('fetch', mockFetch(200, res))

    const result = await getCronNextFires(SCHEDULE_ID, { n: 2 })
    expect(result.fires).toHaveLength(2)
    expect(result.timezone).toBe('UTC')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain(`/api/v1/cron/${SCHEDULE_ID}/next-fires`)
    expect(url).toContain('n=2')
  })

  it('works without query params (n defaults server-side)', async () => {
    const res: NextFiresResponse = { timezone: 'UTC', fires: [] }
    vi.stubGlobal('fetch', mockFetch(200, res))

    await getCronNextFires(SCHEDULE_ID)

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/next-fires')
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found' }))

    await expect(getCronNextFires('missing')).rejects.toMatchObject({ status: 404 })
  })
})

// --- updateCron --------------------------------------------------------------

describe('updateCron', () => {
  it('PUT /api/v1/cron/{id} with patch fields', async () => {
    const updated = { ...makeSchedule(), enabled: false }
    vi.stubGlobal('fetch', mockFetch(200, updated))

    const result = await updateCron(SCHEDULE_ID, { enabled: false })
    expect(result.enabled).toBe(false)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/v1/cron/${SCHEDULE_ID}`)
    expect((init.method as string).toUpperCase()).toBe('PUT')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.enabled).toBe(false)
  })

  it('accepts all updatable fields', async () => {
    const updated = makeSchedule()
    vi.stubGlobal('fetch', mockFetch(200, updated))

    await updateCron(SCHEDULE_ID, {
      cron_expr: '*/10 * * * *',
      timezone: 'Europe/Berlin',
      enabled: true,
      metadata: { env: 'prod' },
      overlap_policy: 'cancel_previous',
    })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.cron_expr).toBe('*/10 * * * *')
    expect(body.overlap_policy).toBe('cancel_previous')
  })

  it('throws ApiError on 400 invalid cron', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid cron expression: x' }))

    await expect(updateCron(SCHEDULE_ID, { cron_expr: 'x' })).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found' }))

    await expect(updateCron('nonexistent', { enabled: false })).rejects.toMatchObject({ status: 404 })
  })
})

// --- deleteCron --------------------------------------------------------------

describe('deleteCron', () => {
  it('DELETE /api/v1/cron/{id}', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deleteCron(SCHEDULE_ID)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/v1/cron/${SCHEDULE_ID}`)
    expect((init.method as string).toUpperCase()).toBe('DELETE')
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found' }))

    await expect(deleteCron('missing')).rejects.toMatchObject({ status: 404 })
  })
})
