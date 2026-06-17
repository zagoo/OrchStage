/**
 * Unit tests for useCanvasStore.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCanvasStore } from './canvas'
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
})
