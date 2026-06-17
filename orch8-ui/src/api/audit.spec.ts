/**
 * Unit tests for the audit API module.
 * Stubs global fetch; asserts correct method, path, and URL encoding.
 * DESIGN_REFERENCE §Audit (observability.md / instances-advanced.md §GET /api/v1/instances/{id}/audit)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import { listInstanceAuditLog } from './audit'
import type { AuditLogEntry } from './types/observability'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  })
}

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 'entry-uuid-1',
    instance_id: 'inst-uuid-1',
    tenant_id: 'acme',
    event_type: 'step_completed',
    block_id: 'step-1',
    details: { duration_ms: 120 },
    created_at: '2026-06-17T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  setHttpConfig({ baseUrl: '', apiKey: 'test-key', tenantId: 't_acme' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- listInstanceAuditLog ----------------------------------------------------

describe('listInstanceAuditLog', () => {
  it('GET /api/v1/instances/{id}/audit returns array (newest-first, max 200)', async () => {
    const data = [makeEntry(), makeEntry({ id: 'entry-uuid-2', event_type: 'state_transition' })]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listInstanceAuditLog('inst-uuid-1')
    expect(result).toHaveLength(2)
    expect(result[0].event_type).toBe('step_completed')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/instances/inst-uuid-1/audit')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('URL-encodes instance ID with special characters', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listInstanceAuditLog('inst/with-slash')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/instances/inst%2Fwith-slash/audit')
  })

  it('returns empty array when instance has no audit entries', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    const result = await listInstanceAuditLog('inst-uuid-empty')
    expect(result).toEqual([])
  })

  it('handles state_transition entries with from_state and to_state', async () => {
    const entry = makeEntry({
      event_type: 'state_transition',
      block_id: undefined,
      from_state: 'running',
      to_state: 'completed',
    })
    vi.stubGlobal('fetch', mockFetch(200, [entry]))

    const result = await listInstanceAuditLog('inst-uuid-1')
    expect(result[0].from_state).toBe('running')
    expect(result[0].to_state).toBe('completed')
    expect(result[0].block_id).toBeUndefined()
  })

  it('throws ApiError on 404 when instance does not exist', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: instance missing' }))
    await expect(listInstanceAuditLog('missing-id')).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError on 401 when API key is missing', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'unauthorized' }))
    await expect(listInstanceAuditLog('inst-uuid-1')).rejects.toMatchObject({ status: 401 })
  })

  it('passes abort signal through', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    const ctrl = new AbortController()
    await listInstanceAuditLog('inst-uuid-1', ctrl.signal)

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBe(ctrl.signal)
  })
})
