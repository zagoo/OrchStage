/**
 * Unit tests for useCanvasStore.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCanvasStore } from './canvas'
import { collectIds, findBlock } from '@/components/canvas/treeOps'
import type { SequenceDefinition, BlockDefinition } from '@/api/types/sequences'
import type { ExecutionNode } from '@/api/types/instances'

function makeSeq(id = 'seq-1'): SequenceDefinition {
  return {
    id,
    name: 'Test Sequence',
    version: 1,
    status: 'production',
    tenant_id: 'tenant-a',
    namespace: 'default',
    description: null,
    deprecated: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    blocks: [],
    tags: [],
    metadata: null,
  } as unknown as SequenceDefinition
}

function makeBlock(id: string): BlockDefinition {
  return {
    id,
    type: 'step',
    name: `Block ${id}`,
  } as unknown as BlockDefinition
}

function makeExecutionNode(blockId: string, state: string): ExecutionNode {
  return {
    block_id: blockId,
    state,
    started_at: null,
    completed_at: null,
  } as unknown as ExecutionNode
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useCanvasStore', () => {
  describe('initial state', () => {
    it('all refs are null/empty', () => {
      const store = useCanvasStore()
      expect(store.selectedSequenceId).toBeNull()
      expect(store.selectedInstanceId).toBeNull()
      expect(store.loadedSequence).toBeNull()
      expect(store.executionNodes).toEqual([])
      expect(store.editable).toBeNull()
      expect(store.nodeStateMap).toEqual({})
    })
  })

  describe('loadSequence()', () => {
    it('sets loadedSequence, selectedSequenceId, and initializes editable', () => {
      const store = useCanvasStore()
      const seq = makeSeq('s1')
      store.loadSequence(seq)

      expect(store.loadedSequence).toEqual(seq)
      expect(store.selectedSequenceId).toBe('s1')
      expect(store.editable).not.toBeNull()
      expect(store.editable!.dirty).toBe(false)
      expect(store.editable!.definition.id).toBe('s1')
    })

    it('editable definition is a deep copy, not a reference', () => {
      const store = useCanvasStore()
      const seq = makeSeq('s1')
      seq.blocks = [makeBlock('b1')]
      store.loadSequence(seq)

      // Mutate original
      seq.blocks.push(makeBlock('b2'))
      // editable should not be affected
      expect(store.editable!.definition.blocks).toHaveLength(1)
    })

    it('clears executionNodes and selectedInstanceId on load', () => {
      const store = useCanvasStore()
      store.updateLiveNodes([makeExecutionNode('b1', 'completed')])
      store.setSelectedInstance('inst-xyz')

      store.loadSequence(makeSeq())

      expect(store.executionNodes).toHaveLength(0)
      expect(store.selectedInstanceId).toBeNull()
    })
  })

  describe('updateLiveNodes()', () => {
    it('replaces execution nodes', () => {
      const store = useCanvasStore()
      store.loadSequence(makeSeq())
      const nodes = [makeExecutionNode('b1', 'running'), makeExecutionNode('b2', 'completed')]
      store.updateLiveNodes(nodes)
      expect(store.executionNodes).toHaveLength(2)
    })
  })

  describe('nodeStateMap getter', () => {
    it('maps block_id to NodeState', () => {
      const store = useCanvasStore()
      store.loadSequence(makeSeq())
      store.updateLiveNodes([
        makeExecutionNode('block-a', 'running'),
        makeExecutionNode('block-b', 'completed'),
      ])
      const map = store.nodeStateMap
      expect(map['block-a']).toBe('running')
      expect(map['block-b']).toBe('completed')
      expect(map['unknown']).toBeUndefined()
    })

    it('returns empty map when no nodes', () => {
      const store = useCanvasStore()
      expect(store.nodeStateMap).toEqual({})
    })
  })

  describe('setSelectedInstance()', () => {
    it('sets selectedInstanceId', () => {
      const store = useCanvasStore()
      store.setSelectedInstance('inst-1')
      expect(store.selectedInstanceId).toBe('inst-1')
    })

    it('clears executionNodes when called with null', () => {
      const store = useCanvasStore()
      store.loadSequence(makeSeq())
      store.updateLiveNodes([makeExecutionNode('b1', 'running')])
      store.setSelectedInstance(null)
      expect(store.executionNodes).toHaveLength(0)
      expect(store.selectedInstanceId).toBeNull()
    })

    it('does NOT clear executionNodes when called with a non-null id', () => {
      const store = useCanvasStore()
      store.loadSequence(makeSeq())
      store.updateLiveNodes([makeExecutionNode('b1', 'running')])
      store.setSelectedInstance('inst-2')
      expect(store.executionNodes).toHaveLength(1)
    })
  })

  describe('markDirty()', () => {
    it('sets editable.dirty to true', () => {
      const store = useCanvasStore()
      store.loadSequence(makeSeq())
      expect(store.editable!.dirty).toBe(false)
      store.markDirty()
      expect(store.editable!.dirty).toBe(true)
    })

    it('is a no-op when editable is null', () => {
      const store = useCanvasStore()
      expect(() => store.markDirty()).not.toThrow()
    })
  })

  describe('updateEditableBlocks()', () => {
    it('updates blocks in editable definition and marks dirty', () => {
      const store = useCanvasStore()
      store.loadSequence(makeSeq())
      const newBlocks = [makeBlock('b1'), makeBlock('b2')]
      store.updateEditableBlocks(newBlocks)

      expect(store.editable!.definition.blocks).toEqual(newBlocks)
      expect(store.editable!.dirty).toBe(true)
    })

    it('is a no-op when editable is null', () => {
      const store = useCanvasStore()
      expect(() => store.updateEditableBlocks([makeBlock('b1')])).not.toThrow()
    })
  })

  describe('resetDirty()', () => {
    it('sets editable.dirty back to false', () => {
      const store = useCanvasStore()
      store.loadSequence(makeSeq())
      store.markDirty()
      expect(store.editable!.dirty).toBe(true)
      store.resetDirty()
      expect(store.editable!.dirty).toBe(false)
    })

    it('is a no-op when editable is null', () => {
      const store = useCanvasStore()
      expect(() => store.resetDirty()).not.toThrow()
    })
  })

  describe('clearCanvas()', () => {
    it('resets all state to null/empty', () => {
      const store = useCanvasStore()
      store.loadSequence(makeSeq('s1'))
      store.updateLiveNodes([makeExecutionNode('b1', 'running')])
      store.setSelectedInstance('inst-1')

      store.clearCanvas()

      expect(store.loadedSequence).toBeNull()
      expect(store.editable).toBeNull()
      expect(store.executionNodes).toHaveLength(0)
      expect(store.selectedSequenceId).toBeNull()
      expect(store.selectedInstanceId).toBeNull()
    })
  })

  describe('structure mutators (single source of truth)', () => {
    const realStep = (id: string, handler = 'log'): BlockDefinition =>
      ({ type: 'step', id, handler, params: {}, cancellable: false }) as BlockDefinition

    function loadWith(...ids: string[]) {
      const store = useCanvasStore()
      const seq = makeSeq('s1')
      seq.blocks = ids.map((i) => realStep(i))
      store.loadSequence(seq)
      return store
    }

    it('addStep appends a valid step and marks dirty', () => {
      const store = loadWith('a')
      expect(store.isDirty).toBe(false)
      store.addStep('a')
      expect(store.blocks).toHaveLength(2)
      expect(store.isDirty).toBe(true)
      expect(store.isValid).toBe(true)
      expect((store.blocks[1] as { handler: string }).handler).toBe('log')
    })

    it('removeBlock deletes by id', () => {
      const store = loadWith('a', 'b')
      store.removeBlock('a')
      expect(store.blocks.map((b) => b.id)).toEqual(['b'])
      expect(store.isDirty).toBe(true)
    })

    it('reorder swaps siblings', () => {
      const store = loadWith('a', 'b')
      store.reorder('b', 'up')
      expect(store.blocks.map((b) => b.id)).toEqual(['b', 'a'])
    })

    it('updateConfig merges a patch and re-validates', () => {
      const store = loadWith('a')
      store.updateConfig('a', { handler: 'http' })
      expect((store.blocks[0] as { handler: string }).handler).toBe('http')
      expect(store.isDirty).toBe(true)
      expect(store.isValid).toBe(true)
    })

    it('changeBlockType converts a block in place, preserving id and staying valid', () => {
      const store = loadWith('a')
      store.changeBlockType('a', 'loop')
      const b = store.blocks[0] as { type: string; id: string }
      expect(b.type).toBe('loop')
      expect(b.id).toBe('a')
      expect(store.isDirty).toBe(true)
      // loop is seeded with a body step, so the converted tree validates cleanly
      expect(store.isValid).toBe(true)
    })

    it('changeBlockType is a no-op when the type is unchanged', () => {
      const store = loadWith('a')
      store.changeBlockType('a', 'step')
      expect(store.isDirty).toBe(false)
    })

    // --- changeBlockId (editable Block ID) ---

    it('changeBlockId renames a block, marks dirty, and stays valid', () => {
      const store = loadWith('a', 'b')
      store.changeBlockId('a', 'a_renamed')
      expect(store.blocks.map((x) => x.id)).toEqual(['a_renamed', 'b'])
      expect(store.isDirty).toBe(true)
      expect(store.isValid).toBe(true)
    })

    it('changeBlockId is a no-op for an empty or unchanged id', () => {
      const store = loadWith('a')
      store.changeBlockId('a', 'a')
      store.changeBlockId('a', '   ')
      expect(store.isDirty).toBe(false)
      expect(store.blocks[0].id).toBe('a')
    })

    it('changeBlockId to a colliding id is guarded by re-validation (duplicate blockError)', () => {
      const store = loadWith('a', 'b')
      store.changeBlockId('a', 'b') // would duplicate sibling 'b'
      expect(store.isValid).toBe(false)
      expect(store.blockErrors['b']).toMatch(/Duplicate/)
    })

    // --- Conversion edge cases: old subtree must be strictly wiped (no orphans) ---

    it('converting a composite with nested children to step wipes ALL descendants', () => {
      const store = useCanvasStore()
      const seq = makeSeq('s1')
      seq.blocks = [
        {
          type: 'router',
          id: 'r',
          routes: [{ condition: 'c1', blocks: [realStep('child1'), realStep('child2')] }],
          default: [realStep('child3')],
        } as BlockDefinition,
      ]
      store.loadSequence(seq)
      expect(collectIds(store.blocks).sort()).toEqual(['child1', 'child2', 'child3', 'r'])

      store.changeBlockType('r', 'step')

      // r is now a leaf step; every former descendant is gone from the tree
      expect(collectIds(store.blocks)).toEqual(['r'])
      expect(findBlock(store.blocks, 'child1')).toBeNull()
      expect(findBlock(store.blocks, 'child2')).toBeNull()
      expect(findBlock(store.blocks, 'child3')).toBeNull()
      expect((store.blocks[0] as { type: string }).type).toBe('step')
      expect(store.isValid).toBe(true)
    })

    it('converting a DEEPLY-nested composite wipes only its subtree, keeping siblings', () => {
      const store = useCanvasStore()
      const seq = makeSeq('s1')
      seq.blocks = [
        realStep('a'),
        {
          type: 'parallel',
          id: 'p',
          branches: [
            [
              {
                type: 'loop',
                id: 'lp',
                condition: 'x',
                body: [realStep('inner')],
                max_iterations: 3,
                continue_on_error: false,
              } as BlockDefinition,
            ],
          ],
        } as BlockDefinition,
      ]
      store.loadSequence(seq)
      expect(collectIds(store.blocks).sort()).toEqual(['a', 'inner', 'lp', 'p'])

      store.changeBlockType('lp', 'step') // loop (with body 'inner') → step, nested in parallel branch

      const ids = collectIds(store.blocks).sort()
      expect(ids).toEqual(['a', 'lp', 'p']) // 'inner' wiped; siblings 'a' & 'p' intact
      expect(findBlock(store.blocks, 'inner')).toBeNull()
      expect((findBlock(store.blocks, 'lp') as { type: string }).type).toBe('step')
      expect(store.isValid).toBe(true)
    })

    it('step → composite → step round-trip wipes the seeded node and restores clean ids', () => {
      const store = loadWith('a', 'b')
      store.changeBlockType('a', 'loop') // seeds exactly one body step with a generated id
      const seedIds = collectIds(store.blocks).filter((id) => id !== 'a' && id !== 'b')
      expect(seedIds).toHaveLength(1)

      store.changeBlockType('a', 'step') // back to a leaf step — seed must be gone
      expect(collectIds(store.blocks).sort()).toEqual(['a', 'b'])
      expect(findBlock(store.blocks, seedIds[0])).toBeNull()
      expect((store.blocks[0] as { type: string }).type).toBe('step')
      expect(store.isValid).toBe(true)
    })

    it('move relocates a block into a container', () => {
      const store = useCanvasStore()
      const seq = makeSeq('s1')
      seq.blocks = [
        realStep('a'),
        { type: 'parallel', id: 'p', branches: [[realStep('x')]] } as BlockDefinition,
      ]
      store.loadSequence(seq)
      store.move('a', { parentId: 'p', key: 'branch:0', index: 0 })
      expect(store.blocks.map((b) => b.id)).toEqual(['p'])
    })

    it('addStepInto seeds a specific container', () => {
      const store = useCanvasStore()
      const seq = makeSeq('s1')
      seq.blocks = [{ type: 'cancellation_scope', id: 'cs', blocks: [] } as BlockDefinition]
      store.loadSequence(seq)
      store.addStepInto('cs', 'scope')
      expect(store.isDirty).toBe(true)
      expect(store.isValid).toBe(true)
    })

    it('surfaces validation errors via blockErrors and isValid', () => {
      const store = useCanvasStore()
      const seq = makeSeq('s1')
      seq.blocks = [{ type: 'step', id: 'bad', handler: '', cancellable: false } as BlockDefinition]
      store.loadSequence(seq)
      expect(store.isValid).toBe(false)
      expect(store.blockErrors['bad']).toMatch(/handler/)
    })

    it('mutators are no-ops without a loaded sequence', () => {
      const store = useCanvasStore()
      expect(() => store.addStep(null)).not.toThrow()
      expect(store.blocks).toEqual([])
    })
  })

  describe('commitSaved() — adopt a just-persisted definition as the clean baseline', () => {
    const realStep = (id: string): BlockDefinition =>
      ({ type: 'step', id, handler: 'log', params: {}, cancellable: false }) as BlockDefinition

    it('re-seats loaded + editable on a forked (new id + version) definition and clears dirty', () => {
      const store = useCanvasStore()
      const seq = makeSeq('old-id')
      seq.blocks = [realStep('a')]
      store.loadSequence(seq)
      store.addStep('a') // dirty
      expect(store.isDirty).toBe(true)

      const saved = { ...seq, id: 'new-id', version: 2, blocks: [...store.blocks] } as SequenceDefinition
      store.commitSaved(saved)

      expect(store.isDirty).toBe(false)
      expect(store.loadedSequence!.id).toBe('new-id')
      expect(store.selectedSequenceId).toBe('new-id')
      expect(store.editable!.definition.id).toBe('new-id')
      expect(store.editable!.definition.version).toBe(2)
    })

    it('editable becomes a deep copy of the saved def (mutating saved does not leak in)', () => {
      const store = useCanvasStore()
      store.loadSequence(makeSeq('s1'))
      const saved = makeSeq('s1')
      saved.blocks = [realStep('a')]
      store.commitSaved(saved)
      saved.blocks.push(realStep('b'))
      expect(store.editable!.definition.blocks).toHaveLength(1)
    })
  })
})
