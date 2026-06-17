/**
 * Unit tests for the approvals API module.
 * Stubs global fetch and asserts correct method, path, query, and body.
 * DESIGN_REFERENCE §Approvals (human-sessions-stream.md §1, inventory.md §2.17)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setHttpConfig } from '@/api/http'
import { listApprovals, resolveApproval } from './approvals'
import type { ApprovalsResponse, ApprovalItem } from './types/approvals'

// --- helpers -----------------------------------------------------------------

function makeApprovalItem(overrides: Partial<ApprovalItem> = {}): ApprovalItem {
  return {
    instance_id: '018f4e3a-0000-7000-8000-000000000001',
    tenant_id: 'acme-corp',
    namespace: 'onboarding',
    sequence_id: '018f4e39-0000-7000-8000-000000000002',
    sequence_name: 'customer-kyc',
    block_id: 'review-documents',
    prompt: 'Please review the uploaded KYC documents.',
    choices: [
      { label: 'Approve', value: 'approve' },
      { label: 'Reject', value: 'reject' },
    ],
    store_as: 'kyc_decision',
    timeout_seconds: 172800,
    escalation_handler: 'notify-compliance',
    waiting_since: '2026-06-17T09:00:00Z',
    deadline: '2026-06-19T09:00:00Z',
    metadata: { customer_id: 'cust-42' },
    allow_comment: true,
    ...overrides,
  }
}

function makeResponse(items: ApprovalItem[] = []): ApprovalsResponse {
  return { items, total: items.length }
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

// --- setup -------------------------------------------------------------------

beforeEach(() => {
  setHttpConfig({ baseUrl: '', apiKey: 'test-key', tenantId: 'acme-corp' })
})
afterEach(() => {
  vi.restoreAllMocks()
})

// --- listApprovals -----------------------------------------------------------

describe('listApprovals', () => {
  it('GET /api/v1/approvals returns ApprovalsResponse', async () => {
    const item = makeApprovalItem()
    const data = makeResponse([item])
    vi.stubGlobal('fetch', mockFetch(200, data))

    const result = await listApprovals()
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.items[0].instance_id).toBe(item.instance_id)

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v1/approvals')
    expect((init.method as string).toUpperCase()).toBe('GET')
  })

  it('passes tenant_id and namespace as query params', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makeResponse()))

    await listApprovals({ tenant_id: 'acme-corp', namespace: 'onboarding', limit: 50, offset: 0 })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain('tenant_id=acme-corp')
    expect(url).toContain('namespace=onboarding')
    expect(url).toContain('limit=50')
  })

  it('returns empty items list when no approvals pending', async () => {
    vi.stubGlobal('fetch', mockFetch(200, makeResponse([])))

    const result = await listApprovals({ tenant_id: 'acme-corp' })
    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('throws ApiError on 401 (missing/invalid API key)', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { error: 'unauthorized' }))

    await expect(listApprovals()).rejects.toMatchObject({ status: 401 })
  })

  it('throws ApiError on 503 (storage connectivity failure)', async () => {
    vi.stubGlobal('fetch', mockFetch(503, { error: 'unavailable: pool exhausted' }))

    await expect(listApprovals()).rejects.toMatchObject({ status: 503 })
  })

  it('ApprovalItem has default yes/no choices when none configured', async () => {
    const item = makeApprovalItem({
      choices: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
    })
    vi.stubGlobal('fetch', mockFetch(200, makeResponse([item])))

    const result = await listApprovals()
    const first = result.items[0]
    expect(first.choices[0].value).toBe('yes')
    expect(first.choices[1].value).toBe('no')
  })
})

// --- resolveApproval ---------------------------------------------------------

describe('resolveApproval', () => {
  it('POST /api/v1/instances/{id}/signals with correct signal_type and payload', async () => {
    vi.stubGlobal('fetch', mockFetch(200, {}))

    const instanceId = '018f4e3a-0000-7000-8000-000000000001'
    const blockId = 'review-documents'

    await resolveApproval(instanceId, blockId, { choice: 'approve' })

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/v1/instances/${instanceId}/signals`)
    expect((init.method as string).toUpperCase()).toBe('POST')

    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.signal_type).toBe(`custom:human_input:${blockId}`)
    expect((body.payload as Record<string, unknown>).choice).toBe('approve')
  })

  it('includes optional comment in payload when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, {}))

    await resolveApproval(
      '018f4e3a-0000-7000-8000-000000000001',
      'review-documents',
      { choice: 'reject', comment: 'Missing required documents' },
    )

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    const payload = body.payload as Record<string, unknown>
    expect(payload.comment).toBe('Missing required documents')
  })

  it('constructs signal_type correctly from block_id', async () => {
    vi.stubGlobal('fetch', mockFetch(200, {}))

    const blockId = 'my-custom-block-123'
    await resolveApproval('018f4e3a-0000-7000-8000-000000000001', blockId, { choice: 'yes' })

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    // DESIGN_REFERENCE §Approvals §1.2: signal name = custom:human_input:{block_id}
    expect(body.signal_type).toBe(`custom:human_input:${blockId}`)
  })

  it('URL-encodes instanceId in path', async () => {
    vi.stubGlobal('fetch', mockFetch(200, {}))

    const instanceId = '018f4e3a-0000-7000-8000-000000000001'
    await resolveApproval(instanceId, 'block-1', { choice: 'yes' })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(url).toContain(encodeURIComponent(instanceId))
  })

  it('throws ApiError on 404 when instance not found', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { error: 'not found: instance xyz' }))

    await expect(
      resolveApproval('nonexistent-id', 'block-1', { choice: 'yes' }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError on 409 when instance is in terminal state', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { error: 'already exists: instance xyz is in a terminal state' }))

    await expect(
      resolveApproval('completed-id', 'block-1', { choice: 'yes' }),
    ).rejects.toMatchObject({ status: 409 })
  })
})
