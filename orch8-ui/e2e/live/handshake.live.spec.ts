import { describe, expect, it } from 'vitest'
import { http } from '@/api/http'
import { listSequences } from '@/api/sequences'
import { listInstances } from '@/api/instances'
import { SERVER_UP, SERVER_URL, TENANT } from './server'

describe.skipIf(!SERVER_UP)('live · connection handshake', () => {
  it('GET /health/ready returns ok (the connection-store probe path)', async () => {
    // The store's check() hits bare /health/ready (no /api/v1 prefix) — exactly this.
    const res = await fetch(`${SERVER_URL}/health/ready`)
    expect(res.ok).toBe(true)
  })

  it('lists sequences through the real typed client', async () => {
    const page = await listSequences({ tenant_id: TENANT })
    expect(Array.isArray(page.items)).toBe(true)
  })

  it('lists instances through the real typed client', async () => {
    const items = await listInstances()
    expect(Array.isArray(items)).toBe(true)
  })

  it('serves a versioned OpenAPI document with the expected surface', async () => {
    const spec = await http.get<{ openapi: string; paths: Record<string, unknown> }>(
      '/api-docs/openapi.json',
    )
    expect(spec.openapi).toMatch(/^3\./)
    expect(Object.keys(spec.paths).length).toBeGreaterThan(40)
  })
})
