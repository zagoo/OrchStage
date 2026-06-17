/**
 * Canvas Pinia store — cross-component state for the interactive DAG canvas.
 * Owns: selected sequence, loaded definition, overlay instance, live execution
 * nodes, editable model, dirty flag.
 *
 * DESIGN_REFERENCE §dag-sequences.md, §instances-core.md
 */
import { defineStore } from 'pinia'
import { shallowRef, ref, computed } from 'vue'
import type { SequenceDefinition, BlockDefinition } from '@/api/types/sequences'
import type { ExecutionNode, NodeState } from '@/api/types/instances'
import type { EditableSequence } from '@/api/types/canvas'

// ---------------------------------------------------------------------------

export const useCanvasStore = defineStore('canvas', () => {
  // --- Selected sequence and version ----------------------------------------
  const selectedSequenceId = ref<string | null>(null)
  const selectedInstanceId = ref<string | null>(null)

  // --- Loaded data ------------------------------------------------------------
  const loadedSequence = shallowRef<SequenceDefinition | null>(null)
  const executionNodes = shallowRef<ExecutionNode[]>([])

  // --- Editable model ---------------------------------------------------------
  const editable = shallowRef<EditableSequence | null>(null)

  /** Map of block_id → NodeState for fast lookup in the canvas. */
  const nodeStateMap = computed((): Record<string, NodeState> => {
    const map: Record<string, NodeState> = {}
    for (const n of executionNodes.value) {
      map[n.block_id] = n.state as NodeState
    }
    return map
  })

  // --- Actions ----------------------------------------------------------------

  function loadSequence(seq: SequenceDefinition) {
    loadedSequence.value = seq
    selectedSequenceId.value = seq.id
    editable.value = {
      definition: JSON.parse(JSON.stringify(seq)) as SequenceDefinition,
      dirty: false,
      blockErrors: {},
    }
    // Clear live overlay when a new sequence is loaded
    executionNodes.value = []
    selectedInstanceId.value = null
  }

  function updateLiveNodes(nodes: ExecutionNode[]) {
    executionNodes.value = nodes
  }

  function setSelectedInstance(instanceId: string | null) {
    selectedInstanceId.value = instanceId
    if (!instanceId) {
      executionNodes.value = []
    }
  }

  function markDirty() {
    if (editable.value) {
      editable.value = { ...editable.value, dirty: true }
    }
  }

  function updateEditableBlocks(blocks: BlockDefinition[]) {
    if (!editable.value) return
    editable.value = {
      ...editable.value,
      definition: { ...editable.value.definition, blocks },
      dirty: true,
    }
  }

  function resetDirty() {
    if (editable.value) {
      editable.value = { ...editable.value, dirty: false }
    }
  }

  function clearCanvas() {
    loadedSequence.value = null
    editable.value = null
    executionNodes.value = []
    selectedSequenceId.value = null
    selectedInstanceId.value = null
  }

  return {
    selectedSequenceId,
    selectedInstanceId,
    loadedSequence,
    executionNodes,
    editable,
    nodeStateMap,
    loadSequence,
    updateLiveNodes,
    setSelectedInstance,
    markDirty,
    updateEditableBlocks,
    resetDirty,
    clearCanvas,
  }
})
