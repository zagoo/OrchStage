/**
 * Unit tests for mobile API module.
 * Stubs global fetch and asserts correct method, path, query, body construction.
 * DESIGN_REFERENCE §Mobile Sync (inventory.md 2.21, mobile-sync.md)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  getMobileStatus,
  listDevices,
  registerDevice,
  listMobileApprovals,
  resolveApproval,
  createMobileCommand,
  syncMobile,
} from './mobile'
import type {
  MobileDevice,
  MobileApprovalRequest,
  MobileInstanceStatus,
  ListDevicesResponse,
  ListApprovalsResponse,
  ListStatusResponse,
  SyncResponse,
} from './types/mobile'

// --- helpers -----------------------------------------------------------------

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(status === 204 || body === null ? '' : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  })
}

function makeDevice(deviceId = 'device-abc'): MobileDevice {
  return {
    device_id: deviceId,
    tenant_id: 't_acme',
    push_token: null,
    platform: 'ios',
    app_version: '2.3.1',
    active: true,
    last_sync_at: '2026-06-17 10:30:00',
    registered_at: '2026-06-01 09:00:00',
  }
}

function makeApproval(id = 'approval-001'): MobileApprovalRequest {
  return {
    id,
    device_id: 'device-abc',
    tenant_id: 't_acme',
    instance_id: 'inst-001',
    block_id: 'step-approve',
    sequence_name: 'expense-flow',
    prompt: 'Approve the request?',
    choices: JSON.stringify(['approve', 'reject']),
    store_as: 'decision',
    timeout_secs: 86400,
    metadata: null,
    state: 'pending',
    resolution: null,
    created_at: '2026-06-17 10:00:00',
    resolved_at: null,
  }
}

function makeStatus(): MobileInstanceStatus {
  return {
    device_id: 'device-abc',
    instance_id: 'inst-001',
    sequence_name: 'order-flow',
    state: 'running',
    current_step: 'step-process',
    handler: 'http_call',
    context_summary: JSON.stringify({ order_id: 'ORD-1' }),
    steps: JSON.stringify([{ block_id: 'step-process', state: 'running' }]),
    updated_at: '2026-06-17 10:30:00',
  }
}

// --- setup -------------------------------------------------------------------

beforeEach(() => {
  setHttpConfig({ baseUrl: '', apiKey: 'test-key', tenantId: 't_acme' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- getMobileStatus ---------------------------------------------------------

describe('getMobileStatus', () => {
  it('GET /api/v1/mobile/status returns status list', async () => {
    const payload: ListStatusResponse = { items: [makeStatus()], total: 1 }
    vi.stubGlobal('fetch', mockFetch(200, payload))

    const result = await getMobileStatus()
    expect(result.items).toHaveLength(1)
    expect(result.items[0].device_id).toBe('device-abc')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/mobile/status')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('passes device_id filter as query param', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { items: [], total: 0 }))
    await getMobileStatus({ device_id: 'device-abc', limit: 50 })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('device_id=device-abc')
    expect(url).toContain('limit=50')
  })

  it('throws ApiError on 404 when mobile sync is disabled', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found' }))
    await expect(getMobileStatus()).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError on 401 unauthorized', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'unauthorized' }))
    await expect(getMobileStatus()).rejects.toMatchObject({ status: 401 })
  })
})

// --- listDevices -------------------------------------------------------------

describe('listDevices', () => {
  it('GET /api/v1/mobile/devices returns device list', async () => {
    const payload: ListDevicesResponse = { items: [makeDevice()], total: 1 }
    vi.stubGlobal('fetch', mockFetch(200, payload))

    const result = await listDevices()
    expect(result.items).toHaveLength(1)
    expect(result.items[0].device_id).toBe('device-abc')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/mobile/devices')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('passes limit query param', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { items: [], total: 0 }))
    await listDevices({ limit: 25 })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('limit=25')
  })

  it('throws ApiError on 404 when mobile sync is disabled', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found' }))
    await expect(listDevices()).rejects.toMatchObject({ status: 404 })
  })
})

// --- registerDevice ----------------------------------------------------------

describe('registerDevice', () => {
  it('POST /api/v1/mobile/devices/register with correct body', async () => {
    vi.stubGlobal('fetch', mockFetch(201, null))

    await registerDevice({ device_id: 'device-abc', platform: 'ios', app_version: '2.3.1' })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/mobile/devices/register')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.device_id).toBe('device-abc')
    expect(body.platform).toBe('ios')
    expect(body.app_version).toBe('2.3.1')
  })

  it('includes push_token when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(201, null))

    await registerDevice({
      device_id: 'device-abc',
      platform: 'android',
      push_token: 'fcm-token-xyz',
    })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.push_token).toBe('fcm-token-xyz')
  })

  it('throws ApiError on 500 storage failure', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { error: 'internal server error' }))
    await expect(registerDevice({ device_id: 'd', platform: 'ios' })).rejects.toMatchObject({ status: 500 })
  })
})

// --- listMobileApprovals -----------------------------------------------------

describe('listMobileApprovals', () => {
  it('GET /api/v1/mobile/approvals returns approval list', async () => {
    const payload: ListApprovalsResponse = { items: [makeApproval()], total: 1 }
    vi.stubGlobal('fetch', mockFetch(200, payload))

    const result = await listMobileApprovals()
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('approval-001')
    expect(result.items[0].state).toBe('pending')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/mobile/approvals')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('passes state filter as query param', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { items: [], total: 0 }))
    await listMobileApprovals({ state: 'resolved', limit: 10 })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('state=resolved')
    expect(url).toContain('limit=10')
  })

  it('throws ApiError on 404 when mobile sync is disabled', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found' }))
    await expect(listMobileApprovals()).rejects.toMatchObject({ status: 404 })
  })
})

// --- resolveApproval ---------------------------------------------------------

describe('resolveApproval', () => {
  it('POST /api/v1/mobile/approvals/{id}/resolve with URL-encoded id', async () => {
    vi.stubGlobal('fetch', mockFetch(200, null))

    await resolveApproval('approval-001', { output: { decision: 'approve' } })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/mobile/approvals/approval-001/resolve')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect((body.output as Record<string, unknown>).decision).toBe('approve')
  })

  it('URL-encodes special characters in id', async () => {
    vi.stubGlobal('fetch', mockFetch(200, null))
    await resolveApproval('a/b', { output: 'yes' })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/mobile/approvals/a%2Fb/resolve')
  })

  it('throws ApiError 404 when approval not found or already resolved', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: approval approval-001 not found or already resolved' }))
    await expect(resolveApproval('approval-001', { output: 'yes' })).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError 404 on cross-tenant resolution attempt', async () => {
    // Cross-tenant resolution returns 404 to avoid enumeration (not 403)
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: approval x not found or already resolved' }))
    await expect(resolveApproval('x', { output: 'no' })).rejects.toMatchObject({ status: 404 })
  })
})

// --- createMobileCommand -----------------------------------------------------

describe('createMobileCommand', () => {
  it('POST /api/v1/mobile/commands with correct body', async () => {
    vi.stubGlobal('fetch', mockFetch(201, null))

    await createMobileCommand({
      device_id: 'device-abc',
      command_type: 'pause',
      payload: { reason: 'maintenance' },
    })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/mobile/commands')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.device_id).toBe('device-abc')
    expect(body.command_type).toBe('pause')
    expect((body.payload as Record<string, unknown>).reason).toBe('maintenance')
  })

  it('throws ApiError 404 when device not found or cross-tenant', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: device device-xyz not found' }))
    await expect(
      createMobileCommand({ device_id: 'device-xyz', command_type: 'ping', payload: {} }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

// --- syncMobile --------------------------------------------------------------

describe('syncMobile', () => {
  it('POST /api/v1/mobile/sync returns commands and interval', async () => {
    const response: SyncResponse = {
      commands: [{ id: 'cmd-001', type: 'complete_step', payload: { block_id: 'step-a' } }],
      sync_interval_secs: 5,
    }
    vi.stubGlobal('fetch', mockFetch(200, response))

    const result = await syncMobile({ device_id: 'device-abc' })
    expect(result.commands).toHaveLength(1)
    expect(result.commands[0].type).toBe('complete_step')
    expect(result.sync_interval_secs).toBe(5)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/mobile/sync')
    expect((init.method as string).toUpperCase()).toBe('POST')
  })

  it('includes status_updates, command_acks in body', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { commands: [], sync_interval_secs: 30 }))

    await syncMobile({
      device_id: 'device-abc',
      status_updates: [{ instance_id: 'inst-1', state: 'running', timestamp: '2026-06-17T10:00:00Z' }],
      command_acks: ['cmd-old-001'],
    })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.device_id).toBe('device-abc')
    expect(Array.isArray(body.status_updates)).toBe(true)
    expect(Array.isArray(body.command_acks)).toBe(true)
    expect((body.command_acks as string[])[0]).toBe('cmd-old-001')
  })

  it('throws ApiError 400 when sync arrays exceed 500 items', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: sync arrays must each contain at most 500 items' }))
    await expect(syncMobile({ device_id: 'device-abc', command_acks: [] })).rejects.toMatchObject({ status: 400 })
  })

  it('returns idle interval (30) when no commands pending', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { commands: [], sync_interval_secs: 30 }))
    const result = await syncMobile({ device_id: 'device-abc' })
    expect(result.sync_interval_secs).toBe(30)
    expect(result.commands).toHaveLength(0)
  })
})
