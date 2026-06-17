/**
 * Unit tests for the cluster API module.
 * Stubs global fetch and asserts correct method, path, and body.
 * DESIGN_REFERENCE §Cluster Nodes — ops-resilience.md §3
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import { listClusterNodes, drainNode } from './cluster'
import type { ClusterNode } from './types/ops'

// --- helpers -----------------------------------------------------------------

function makeNode(status: ClusterNode['status'] = 'active'): ClusterNode {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'orch8-0',
    status,
    registered_at: '2024-09-01T08:00:00Z',
    last_heartbeat_at: '2024-09-01T12:05:30Z',
    drain: false,
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

function mockFetch200Empty() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(''),
  })
}

// --- setup -------------------------------------------------------------------

beforeEach(() => {
  setHttpConfig({ baseUrl: '', apiKey: 'test-key', tenantId: null })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- listClusterNodes --------------------------------------------------------

describe('listClusterNodes', () => {
  it('GET /api/v1/cluster/nodes returns array', async () => {
    const data = [makeNode()]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listClusterNodes()
    expect(result).toEqual(data)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/cluster/nodes')
    expect((init.method as string | undefined)?.toUpperCase() ?? 'GET').toBe('GET')
  })

  it('is not tenant-scoped — no tenant_id in URL', async () => {
    // Cluster nodes are operator-level; they must NOT be filtered by tenant.
    vi.stubGlobal('fetch', mockFetch(200, [makeNode()]))
    await listClusterNodes()
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).not.toContain('tenant_id')
  })

  it('returns nodes with all status values', async () => {
    const data: ClusterNode[] = [
      makeNode('active'),
      { ...makeNode('draining'), id: 'uuid-2', name: 'orch8-1', drain: true },
      { ...makeNode('stopped'), id: 'uuid-3', name: 'orch8-2' },
    ]
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listClusterNodes()
    expect(result.map((n) => n.status)).toEqual(['active', 'draining', 'stopped'])
  })

  it('throws ApiError 500 on storage error', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { error: 'internal server error' }))
    await expect(listClusterNodes()).rejects.toMatchObject({ status: 500 })
  })
})

// --- drainNode ---------------------------------------------------------------

describe('drainNode', () => {
  it('POST /api/v1/cluster/nodes/{id}/drain with no body', async () => {
    vi.stubGlobal('fetch', mockFetch200Empty())

    await drainNode('550e8400-e29b-41d4-a716-446655440000')

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/cluster/nodes/550e8400-e29b-41d4-a716-446655440000/drain')
    expect((init.method as string).toUpperCase()).toBe('POST')
    // Drain takes no payload — body must be absent.
    expect(init.body).toBeUndefined()
  })

  it('URL-encodes the node ID', async () => {
    vi.stubGlobal('fetch', mockFetch200Empty())
    await drainNode('node/1')
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('/api/v1/cluster/nodes/node%2F1/drain')
  })

  it('throws ApiError 404 when node not found', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: node unknown-id' }))
    await expect(drainNode('unknown-id')).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError 500 on storage error', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { error: 'internal server error' }))
    await expect(drainNode('550e8400-e29b-41d4-a716-446655440000')).rejects.toMatchObject({
      status: 500,
    })
  })

  it('succeeds for nodes in any status (drain is idempotent at the API level)', async () => {
    // The API sets drain=true; re-draining an already-draining node is not an error.
    vi.stubGlobal('fetch', mockFetch200Empty())
    await expect(drainNode('550e8400-e29b-41d4-a716-446655440000')).resolves.not.toThrow()
  })
})
