/**
 * Unit tests for the API Keys module.
 * Stubs global fetch; asserts method, path, query, body, and error handling.
 * DESIGN_REFERENCE §API-key management endpoints (auth-rbac.md §8, inventory.md §2.14)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import { listApiKeys, createApiKey, revokeApiKey } from './apiKeys'
import type { ApiKeyInfo, CreatedApiKey } from './types/apiKeys'

// --- helpers -----------------------------------------------------------------

function makeApiKeyInfo(id = 'ak_abc123', revoked = false): ApiKeyInfo {
  return {
    id,
    tenant_id: 'acme',
    name: 'CI deploy key',
    created_at: '2026-06-17T10:00:00Z',
    last_used_at: '2026-06-17T11:00:00Z',
    expires_at: null,
    revoked,
  }
}

function makeCreatedKey(): CreatedApiKey {
  return {
    id: 'ak_newkey123',
    tenant_id: 'acme',
    name: 'New key',
    secret: 'sk_aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344',
    created_at: '2026-06-17T12:00:00Z',
    expires_at: null,
  }
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(status === 204 ? '' : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  })
}

// --- setup -------------------------------------------------------------------

beforeEach(() => {
  setHttpConfig({ baseUrl: '', apiKey: 'root-key', tenantId: null })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- listApiKeys -------------------------------------------------------------

describe('listApiKeys', () => {
  it('GET /api-keys with tenant_id query param', async () => {
    const data = [makeApiKeyInfo()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listApiKeys({ tenant_id: 'acme' })
    expect(result).toEqual(data)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api-keys')
    expect(url).toContain('tenant_id=acme')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('throws ApiError 403 when called with a per-tenant key (server enforces)', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { error: 'forbidden: API key management requires the root API key' }))

    await expect(listApiKeys({ tenant_id: 'acme' })).rejects.toMatchObject({ status: 403 })
  })

  it('throws ApiError 400 when tenant_id is empty (server rejects)', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: tenant_id query parameter is required' }))

    await expect(listApiKeys({ tenant_id: '' })).rejects.toMatchObject({ status: 400 })
  })

  it('does not include secret or key_hash in list response shape', async () => {
    const info = makeApiKeyInfo()
    vi.stubGlobal('fetch', mockFetch(200, [info]))

    const [key] = await listApiKeys({ tenant_id: 'acme' })
    // Business rule: secret must never be in list responses (api_key.rs: secret-never-in-list)
    expect(key).not.toHaveProperty('secret')
    expect(key).not.toHaveProperty('key_hash')
    expect(key.id).toMatch(/^ak_/)
  })

  it('returns revoked keys in the list', async () => {
    const revoked = makeApiKeyInfo('ak_revoked', true)
    vi.stubGlobal('fetch', mockFetch(200, [revoked]))

    const result = await listApiKeys({ tenant_id: 'acme' })
    expect(result[0].revoked).toBe(true)
  })
})

// --- createApiKey ------------------------------------------------------------

describe('createApiKey', () => {
  it('POST /api-keys with correct body', async () => {
    const created = makeCreatedKey()
    vi.stubGlobal('fetch', mockFetch(201, created))

    const result = await createApiKey({ tenant_id: 'acme', name: 'New key' })

    expect(result.id).toMatch(/^ak_/)
    // Critical business rule: secret returned once — must be present in the create response
    expect(result.secret).toMatch(/^sk_/)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api-keys')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.tenant_id).toBe('acme')
    expect(body.name).toBe('New key')
  })

  it('sends optional expires_at when provided', async () => {
    const created = { ...makeCreatedKey(), expires_at: '2027-01-01T00:00:00Z' }
    vi.stubGlobal('fetch', mockFetch(201, created))

    await createApiKey({ tenant_id: 'acme', name: 'Expiring key', expires_at: '2027-01-01T00:00:00Z' })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.expires_at).toBe('2027-01-01T00:00:00Z')
  })

  it('throws ApiError 403 when called with a per-tenant key', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { error: 'forbidden: API key management requires the root API key' }))

    await expect(createApiKey({ tenant_id: 'acme' })).rejects.toMatchObject({ status: 403 })
  })

  it('throws ApiError 400 when tenant_id is empty (business rule: non-empty required)', async () => {
    // Business rule: tenant_id must be non-empty (auth-rbac.md §8.1)
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: tenant_id is required' }))

    await expect(createApiKey({ tenant_id: '' })).rejects.toMatchObject({ status: 400 })
  })
})

// --- revokeApiKey ------------------------------------------------------------

describe('revokeApiKey', () => {
  it('DELETE /api-keys/{id} with URL-encoded id', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await revokeApiKey('ak_abc123')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api-keys/ak_abc123')
    expect((init.method as string).toUpperCase()).toBe('DELETE')
  })

  it('throws ApiError 404 when key does not exist', async () => {
    // Business rule: 404 returned for nonexistent id (auth-rbac.md §8.3)
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: api key ak_missing' }))

    await expect(revokeApiKey('ak_missing')).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError 403 when called with per-tenant key', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { error: 'forbidden: API key management requires the root API key' }))

    await expect(revokeApiKey('ak_abc123')).rejects.toMatchObject({ status: 403 })
  })

  it('URL-encodes the id in the path', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await revokeApiKey('ak_test/special')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api-keys/ak_test%2Fspecial')
  })
})
