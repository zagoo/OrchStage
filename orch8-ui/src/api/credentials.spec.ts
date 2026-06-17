/**
 * Unit tests for the Credentials API module.
 * Stubs global fetch; asserts correct method, path, query, and body construction.
 * DESIGN_REFERENCE §Credentials (resources.md)
 *
 * SECURITY: Verifies that secret fields (value, refresh_token) are sent on write
 * requests but are NEVER present in response objects (CredentialResponse has no
 * value field by design).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  listCredentials,
  createCredential,
  getCredential,
  updateCredential,
  deleteCredential,
} from './credentials'
import type { CredentialResponse } from './types/credentials'

// --- helpers -----------------------------------------------------------------

function makeCred(id = 'stripe-prod'): CredentialResponse {
  return {
    id,
    tenant_id: 't_acme',
    name: 'Stripe Production API Key',
    kind: 'api_key',
    enabled: true,
    expires_at: null,
    refresh_url: null,
    has_refresh_token: false,
    description: 'Stripe live mode secret key',
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

// --- listCredentials ---------------------------------------------------------

describe('listCredentials', () => {
  it('GET /api/v1/credentials returns array of metadata', async () => {
    vi.stubGlobal('fetch', mockFetch(200, [makeCred()]))

    const result = await listCredentials()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('stripe-prod')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/credentials')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('response does NOT contain secret value field (write-only guarantee)', async () => {
    const cred = makeCred()
    vi.stubGlobal('fetch', mockFetch(200, [cred]))

    const result = await listCredentials()
    // CredentialResponse has no value or refresh_token fields
    expect(result[0]).not.toHaveProperty('value')
    expect(result[0]).not.toHaveProperty('refresh_token')
    // has_refresh_token boolean is present (safe flag, not the secret)
    expect(result[0]).toHaveProperty('has_refresh_token')
  })

  it('passes tenant_id and limit as query params', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listCredentials({ tenant_id: 't_acme', limit: 50 })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('tenant_id=t_acme')
    expect(url).toContain('limit=50')
  })

  it('throws ApiError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'unauthorized' }))
    await expect(listCredentials()).rejects.toMatchObject({ status: 401 })
  })
})

// --- createCredential --------------------------------------------------------

describe('createCredential', () => {
  it('POST /api/v1/credentials sends id, name, kind, and value', async () => {
    const cred = makeCred()
    vi.stubGlobal('fetch', mockFetch(201, cred))

    const result = await createCredential({
      id: 'stripe-prod',
      name: 'Stripe Production API Key',
      kind: 'api_key',
      value: '{"token":"sk_live_abc123"}',
      tenant_id: 't_acme',
    })

    expect(result.id).toBe('stripe-prod')
    // Response must not contain the secret
    expect(result).not.toHaveProperty('value')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/credentials')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.id).toBe('stripe-prod')
    expect(body.name).toBe('Stripe Production API Key')
    expect(body.value).toBe('{"token":"sk_live_abc123"}') // write-only; sent in request
    expect(body.tenant_id).toBe('t_acme')
  })

  it('sends refresh_token for oauth2 credentials (required when refresh_url is set)', async () => {
    const oauthCred: CredentialResponse = { ...makeCred('gh-oauth'), kind: 'oauth2', has_refresh_token: true }
    vi.stubGlobal('fetch', mockFetch(201, oauthCred))

    await createCredential({
      id: 'gh-oauth',
      name: 'GitHub OAuth',
      kind: 'oauth2',
      value: '{"access_token":"gho_abc"}',
      refresh_url: 'https://github.com/login/oauth/access_token',
      refresh_token: 'ghr_abc123',
    })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.refresh_token).toBe('ghr_abc123')
    expect(body.refresh_url).toBe('https://github.com/login/oauth/access_token')
  })

  it('throws ApiError on 409 (duplicate id)', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { error: 'already exists: credential stripe-prod' }))
    await expect(
      createCredential({ id: 'stripe-prod', name: 'Dup', value: '{"token":"x"}' }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('throws ApiError on 400 (invalid id character set)', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: id contains invalid characters' }))
    await expect(
      createCredential({ id: 'my cred!', name: 'Bad', value: '{"token":"x"}' }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

// --- getCredential -----------------------------------------------------------

describe('getCredential', () => {
  it('GET /api/v1/credentials/{id} returns metadata', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makeCred()))

    const result = await getCredential('stripe-prod')
    expect(result.id).toBe('stripe-prod')
    expect(result).not.toHaveProperty('value')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/credentials/stripe-prod')
  })

  it('throws ApiError on 404 (not found or cross-tenant — existence masked)', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: credential' }))
    await expect(getCredential('no-such')).rejects.toMatchObject({ status: 404 })
  })
})

// --- updateCredential --------------------------------------------------------

describe('updateCredential', () => {
  it('PATCH /api/v1/credentials/{id} with updated name', async () => {
    const updated = { ...makeCred(), name: 'Stripe Staging' }
    vi.stubGlobal('fetch', mockFetch(200, updated))

    const result = await updateCredential('stripe-prod', { name: 'Stripe Staging' })
    expect(result.name).toBe('Stripe Staging')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/credentials/stripe-prod')
    expect((init.method as string).toUpperCase()).toBe('PATCH')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.name).toBe('Stripe Staging')
  })

  it('sends new value for secret rotation (write-only — not echoed in response)', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makeCred()))

    await updateCredential('stripe-prod', { value: '{"token":"sk_live_NEW"}' })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.value).toBe('{"token":"sk_live_NEW"}')
  })

  it('can toggle enabled flag', async () => {
    const disabled = { ...makeCred(), enabled: false }
    vi.stubGlobal('fetch', mockFetch(200, disabled))

    const result = await updateCredential('stripe-prod', { enabled: false })
    expect(result.enabled).toBe(false)
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: credential' }))
    await expect(updateCredential('missing', { name: 'X' })).rejects.toMatchObject({ status: 404 })
  })
})

// --- deleteCredential --------------------------------------------------------

describe('deleteCredential', () => {
  it('DELETE /api/v1/credentials/{id} succeeds with 204', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deleteCredential('stripe-prod')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/credentials/stripe-prod')
    expect((init.method as string).toUpperCase()).toBe('DELETE')
  })

  it('URL-encodes ids with dots (valid in credential id charset)', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deleteCredential('stripe.prod')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    // encodeURIComponent('stripe.prod') === 'stripe.prod' (dot is not encoded)
    expect(url).toContain('/api/v1/credentials/stripe.prod')
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: credential' }))
    await expect(deleteCredential('no-such')).rejects.toMatchObject({ status: 404 })
  })
})
