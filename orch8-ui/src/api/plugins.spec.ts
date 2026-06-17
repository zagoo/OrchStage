/**
 * Unit tests for the Plugins API module.
 * Stubs global fetch; asserts correct method, path, query, and body construction.
 * DESIGN_REFERENCE §Plugins (resources.md)
 *
 * Unlike credentials, plugin definitions contain no secret material.
 * Full PluginDef is returned on all read/write operations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import {
  listPlugins,
  createPlugin,
  getPlugin,
  updatePlugin,
  deletePlugin,
} from './plugins'
import type { PluginDef } from './types/plugins'

// --- helpers -----------------------------------------------------------------

function makePlugin(name = 'my-wasm-plugin'): PluginDef {
  return {
    name,
    plugin_type: 'wasm',
    source: '/opt/plugins/my-wasm-plugin.wasm',
    tenant_id: 't_acme',
    enabled: true,
    config: { timeout_ms: 5000 },
    description: 'Custom data transform plugin',
    created_at: '2026-06-17T10:00:00Z',
    updated_at: '2026-06-17T10:00:00Z',
  }
}

function makeGrpcPlugin(name = 'grpc-enricher'): PluginDef {
  return {
    name,
    plugin_type: 'grpc',
    source: 'enricher.internal:9090/Enricher.Enrich',
    tenant_id: 't_acme',
    enabled: true,
    config: null,
    description: null,
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

// --- listPlugins -------------------------------------------------------------

describe('listPlugins', () => {
  it('GET /api/v1/plugins returns array', async () => {
    vi.stubGlobal('fetch', mockFetch(200, [makePlugin(), makeGrpcPlugin()]))

    const result = await listPlugins()
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('my-wasm-plugin')
    expect(result[1].plugin_type).toBe('grpc')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/plugins')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('passes tenant_id as query param', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))

    await listPlugins({ tenant_id: 't_acme' })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('tenant_id=t_acme')
  })

  it('throws ApiError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'unauthorized' }))
    await expect(listPlugins()).rejects.toMatchObject({ status: 401 })
  })
})

// --- createPlugin ------------------------------------------------------------

describe('createPlugin', () => {
  it('POST /api/v1/plugins registers a WASM plugin', async () => {
    const plugin = makePlugin()
    vi.stubGlobal('fetch', mockFetch(201, plugin))

    const result = await createPlugin({
      name: 'my-wasm-plugin',
      plugin_type: 'wasm',
      source: '/opt/plugins/my-wasm-plugin.wasm',
      tenant_id: 't_acme',
      config: { timeout_ms: 5000 },
    })

    expect(result.name).toBe('my-wasm-plugin')
    expect(result.plugin_type).toBe('wasm')
    expect(result.enabled).toBe(true) // always true on create

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/plugins')
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.name).toBe('my-wasm-plugin')
    expect(body.plugin_type).toBe('wasm')
    expect(body.source).toBe('/opt/plugins/my-wasm-plugin.wasm')
    expect((body.config as Record<string, unknown>).timeout_ms).toBe(5000)
  })

  it('POST /api/v1/plugins registers a gRPC plugin', async () => {
    const plugin = makeGrpcPlugin()
    vi.stubGlobal('fetch', mockFetch(201, plugin))

    const result = await createPlugin({
      name: 'grpc-enricher',
      plugin_type: 'grpc',
      source: 'enricher.internal:9090/Enricher.Enrich',
    })

    expect(result.plugin_type).toBe('grpc')
    expect(result.source).toBe('enricher.internal:9090/Enricher.Enrich')
  })

  it('throws ApiError on 409 (duplicate name)', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { error: 'already exists: plugin my-wasm-plugin' }))
    await expect(
      createPlugin({ name: 'my-wasm-plugin', plugin_type: 'wasm', source: '/path' }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('throws ApiError on 400 (empty name)', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: name is empty' }))
    await expect(
      createPlugin({ name: '', plugin_type: 'wasm', source: '/path' }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws ApiError on 400 (source exceeds 2048 chars)', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: 'invalid argument: source exceeds 2048 chars' }))
    const longSource = 'x'.repeat(2049)
    await expect(
      createPlugin({ name: 'plugin', plugin_type: 'wasm', source: longSource }),
    ).rejects.toMatchObject({ status: 400 })
  })
})

// --- getPlugin ---------------------------------------------------------------

describe('getPlugin', () => {
  it('GET /api/v1/plugins/{name} returns full plugin def', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makePlugin()))

    const result = await getPlugin('my-wasm-plugin')
    expect(result.name).toBe('my-wasm-plugin')
    expect(result.source).toBe('/opt/plugins/my-wasm-plugin.wasm')

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/plugins/my-wasm-plugin')
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: plugin no-such' }))
    await expect(getPlugin('no-such')).rejects.toMatchObject({ status: 404 })
  })
})

// --- updatePlugin ------------------------------------------------------------

describe('updatePlugin', () => {
  it('PATCH /api/v1/plugins/{name} updates source', async () => {
    const updated = { ...makePlugin(), source: '/opt/plugins/v2.wasm' }
    vi.stubGlobal('fetch', mockFetch(200, updated))

    const result = await updatePlugin('my-wasm-plugin', { source: '/opt/plugins/v2.wasm' })
    expect(result.source).toBe('/opt/plugins/v2.wasm')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/plugins/my-wasm-plugin')
    expect((init.method as string).toUpperCase()).toBe('PATCH')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.source).toBe('/opt/plugins/v2.wasm')
  })

  it('PATCH does NOT include name or plugin_type (immutable via PATCH)', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makePlugin()))

    await updatePlugin('my-wasm-plugin', { enabled: false })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).not.toHaveProperty('name')
    expect(body).not.toHaveProperty('plugin_type')
  })

  it('can toggle enabled flag', async () => {
    const disabled = { ...makePlugin(), enabled: false }
    vi.stubGlobal('fetch', mockFetch(200, disabled))

    const result = await updatePlugin('my-wasm-plugin', { enabled: false })
    expect(result.enabled).toBe(false)
  })

  it('can replace config (full replacement, not merge)', async () => {
    const updated = { ...makePlugin(), config: { timeout_ms: 9999 } }
    vi.stubGlobal('fetch', mockFetch(200, updated))

    const result = await updatePlugin('my-wasm-plugin', { config: { timeout_ms: 9999 } })
    expect((result.config as Record<string, unknown>).timeout_ms).toBe(9999)
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: plugin missing' }))
    await expect(updatePlugin('missing', { source: '/new' })).rejects.toMatchObject({ status: 404 })
  })
})

// --- deletePlugin ------------------------------------------------------------

describe('deletePlugin', () => {
  it('DELETE /api/v1/plugins/{name} succeeds with 204', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deletePlugin('my-wasm-plugin')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/plugins/my-wasm-plugin')
    expect((init.method as string).toUpperCase()).toBe('DELETE')
  })

  it('URL-encodes plugin names with hyphens', async () => {
    vi.stubGlobal('fetch', mockFetch(204, null))

    await deletePlugin('my-wasm-plugin')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/plugins/my-wasm-plugin')
  })

  it('throws ApiError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: plugin no-such' }))
    await expect(deletePlugin('no-such')).rejects.toMatchObject({ status: 404 })
  })
})
