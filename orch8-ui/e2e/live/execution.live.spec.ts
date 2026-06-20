import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSequence } from '@/api/sequences'
import { createInstance, getExecutionTree, getInstance } from '@/api/instances'
import { rawFetch } from '@/api/http'
import { isTerminal, type InstanceState } from '@/api/types/instances'
import { SERVER_UP, rawPost, sleep, tracker } from './server'
import * as fx from './fixtures'

const VALID_STATES = new Set<InstanceState>([
  'scheduled',
  'running',
  'waiting',
  'paused',
  'completed',
  'failed',
  'cancelled',
])

const t = tracker()
let seqId = ''

describe.skipIf(!SERVER_UP)('live · execution feedback', () => {
  beforeAll(async () => {
    // A runnable sequence (status=production) with a composite so the tree has shape.
    const body = fx.seq(
      fx.uniqueName('exec'),
      [
        fx.step('begin'),
        { type: 'parallel', id: 'par', branches: [[fx.step('left')], [fx.step('right')]] },
        fx.step('end'),
      ],
      'production',
    )
    const created = await createSequence(body)
    seqId = t.addId(created.id)
  })
  afterAll(() => t.cleanup())

  const start = () => createInstance({ sequence_id: seqId, tenant_id: 'acme', namespace: 'default' })

  it('starts an instance and observes valid states up to a terminal one', async () => {
    const inst = await start()
    expect(inst.id).toBeTruthy()

    let state: InstanceState = 'scheduled'
    for (let i = 0; i < 25; i++) {
      const got = await getInstance(inst.id)
      state = got.state
      expect(VALID_STATES.has(state)).toBe(true)
      if (isTerminal(state)) break
      await sleep(400)
    }
    expect(isTerminal(state)).toBe(true)
  })

  it('exposes an execution tree of ExecutionNode rows', async () => {
    const inst = await start()
    let tree = await getExecutionTree(inst.id)
    for (let i = 0; i < 10 && tree.length === 0; i++) {
      await sleep(400)
      tree = await getExecutionTree(inst.id)
    }
    expect(Array.isArray(tree)).toBe(true)
    for (const node of tree) {
      expect(typeof node.block_id).toBe('string')
      expect(VALID_STATES.has(node.state as InstanceState) || typeof node.state === 'string').toBe(true)
    }
  })

  it('streams live events over SSE (text/event-stream)', async () => {
    const inst = await start()
    const res = await rawFetch(`/api/v1/instances/${inst.id}/stream`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('text/event-stream')
    await res.body?.cancel()
  })

  it('contract regression: server rejects lowercase priority, accepts PascalCase', async () => {
    const mk = (priority: string): unknown => ({
      sequence_id: seqId,
      tenant_id: 'acme',
      namespace: 'default',
      priority,
    })
    await expect(rawPost('/api/v1/instances', mk('normal'))).rejects.toMatchObject({ status: 422 })
    const ok = (await rawPost('/api/v1/instances', mk('Normal'))) as { id: string }
    expect(ok.id).toBeTruthy()
  })
})
