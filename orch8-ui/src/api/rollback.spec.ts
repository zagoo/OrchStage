/**
 * Unit tests for the rollback API module.
 * Stubs global fetch and asserts correct method, path, query, and body.
 * DESIGN_REFERENCE §Rollback Policies — ops-resilience.md §2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  createRollbackPolicy,
  listRollbackPolicies,
  getRollbackPolicy,
  deleteRollbackPolicy,
} from './rollback'
import type { RollbackPolicy, CreateRollbackPolicyRequest } from './types/ops'

// --- helpers -----------------------------------------------------------------

function makePolicy(sequenceName = 'checkout-flow'): RollbackPolicy {
  return {
    id: 42,
    tenant_id: 'acme',
    sequence_name: sequenceName,
    error_rate_threshold: 0.05,
    time_window_secs: 300,
    enabled: true,
    cooldown_secs: 3600,
    confirmation_window_secs: 60,
    webhook_url: null,
    created_at: '2024-09-01T12:00:00Z',
    updated_at: '2024-09-01T12:00:00Z',
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

// --- createRollbackPolicy ----------------------------------------------------

describe('createRollbackPolicy', () => {
  it('POST /api/v1/rollback-policies with required fields', async () => {
    const policy = makePolicy()
    vi.stubGlobal('fetch', mockFetch(201, policy))

    const body: CreateRollbackPolicyRequest = {
      sequence_name: 'checkout-flow',
      error_rate_threshold: 0.05,
      time_window_secs: 300,
    }
    const result = await createRollbackPolicy(body)
    expect(result.sequence_name).toBe('checkout-flow')
    expect(result.error_rate_threshold).toBe(0.05)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/rollback-policies')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const sent = JSON.parse(init.body as string) as Record<string, unknown>
    expect(sent.sequence_name).toBe('checkout-flow')
    expect(sent.error_rate_threshold).toBe(0.05)
    expect(sent.time_window_secs).toBe(300)
  })

  it('sends optional fields when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(201, makePolicy()))

    await createRollbackPolicy({
      sequence_name: 'checkout-flow',
      error_rate_threshold: 0.1,
      time_window_secs: 600,
      cooldown_secs: 7200,
      confirmation_window_secs: 0,
      webhook_url: 'https://hooks.example.com/alerts',
    })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const sent = JSON.parse(init.body as string) as Record<string, unknown>
    expect(sent.cooldown_secs).toBe(7200)
    expect(sent.confirmation_window_secs).toBe(0)
    expect(sent.webhook_url).toBe('https://hooks.example.com/alerts')
  })

  it('throws ApiError 400 when sequence_name is empty', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: sequence_name must not be empty' }))
    await expect(
      createRollbackPolicy({ sequence_name: '', error_rate_threshold: 0.05, time_window_secs: 300 }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError 400 when error_rate_threshold is out of range', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: error_rate_threshold must be in [0.0, 1.0]' }))
    await expect(
      createRollbackPolicy({ sequence_name: 'test', error_rate_threshold: 1.5, time_window_secs: 300 }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError 400 when webhook_url scheme is not http/https', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: webhook_url must use http or https' }))
    await expect(
      createRollbackPolicy({
        sequence_name: 'test',
        error_rate_threshold: 0.05,
        time_window_secs: 300,
        webhook_url: 'ftp://invalid.com',
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

// --- listRollbackPolicies ----------------------------------------------------

describe('listRollbackPolicies', () => {
  it('GET /api/v1/rollback-policies returns array (max 100 rows)', async () => {
    const data = [makePolicy()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listRollbackPolicies()
    expect(result).toEqual(data)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/rollback-policies')
    expect((init.method as string | undefined)?.toUpperCase() ?? 'GET').toBe('GET')
  })

  it('passes tenant_id query param when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))
    await listRollbackPolicies({ tenant_id: 'acme' })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('tenant_id=acme')
  })

  it('does not add query params when called without options', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))
    await listRollbackPolicies()
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).not.toContain('tenant_id')
  })
})

// --- getRollbackPolicy -------------------------------------------------------

describe('getRollbackPolicy', () => {
  it('GET /api/v1/rollback-policies/{name} with URL-encoded sequence name', async () => {
    const policy = makePolicy()
    vi.stubGlobal('fetch', mockFetch(200, policy))

    const result = await getRollbackPolicy('checkout-flow')
    expect(result.sequence_name).toBe('checkout-flow')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/rollback-policies/checkout-flow')
  })

  it('URL-encodes sequence name with special characters', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makePolicy('my flow/v2')))
    await getRollbackPolicy('my flow/v2')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/rollback-policies/my%20flow%2Fv2')
  })

  it('passes tenant_id query param when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makePolicy()))
    await getRollbackPolicy('checkout-flow', 'acme')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('tenant_id=acme')
  })

  it('throws ApiError 500 when policy not found (server uses Internal for not-found in this handler)', async () => {
    // Note: the Rust handler returns ApiError::Internal for not-found per the reference doc.
    vi.stubGlobal('fetch', mockFetch(500, { error: 'internal server error' }))
    await expect(getRollbackPolicy('nonexistent')).rejects.toMatchObject({ status: 500 })
  })
})

// --- deleteRollbackPolicy ----------------------------------------------------

describe('deleteRollbackPolicy', () => {
  it('DELETE /api/v1/rollback-policies/{name} returns 204', async () => {
    vi.stubGlobal('fetch', mockFetch204())

    await deleteRollbackPolicy('checkout-flow', 'acme')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/rollback-policies/checkout-flow')
    expect((init.method as string).toUpperCase()).toBe('DELETE')
    expect(url).toContain('tenant_id=acme')
  })

  it('does not append tenant_id when not provided', async () => {
    vi.stubGlobal('fetch', mockFetch204())
    await deleteRollbackPolicy('checkout-flow')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).not.toContain('tenant_id')
  })

  it('URL-encodes sequence name for delete', async () => {
    vi.stubGlobal('fetch', mockFetch204())
    await deleteRollbackPolicy('my flow/v2')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/rollback-policies/my%20flow%2Fv2')
  })

  it('throws ApiError 500 on DB error', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { error: 'internal server error' }))
    await expect(deleteRollbackPolicy('checkout-flow')).rejects.toMatchObject({ status: 500 })
  })
})
