/**
 * Canvas Pinia store — cross-component state for the interactive DAG canvas.
 *
 * `editable.definition.blocks` is the SINGLE SOURCE OF TRUTH. Every structural
 * mutation routes through a pure treeOps function, replaces the blocks array,
 * re-validates, and flips `dirty`. The view re-derives nodes/edges from this
 * state (FlowCanvasView.rebuildGraph) — the graph never diverges from the tree.
 *
 * DESIGN_REFERENCE §dag-sequences.md, §instances-core.md
 */
import { defineStore } from 'pinia'
import { shallowRef, ref, computed } from 'vue'
import type { SequenceDefinition, BlockDefinition, BlockType } from '@/api/types/sequences'
import type { ExecutionNode, NodeState } from '@/api/types/instances'
import type { EditableSequence } from '@/api/types/canvas'
import {
  insertStep,
  deleteBlock,
  reorderSibling,
  moveBlock,
  updateBlockConfig,
  updateBlockById,
  renameBlock,
  addContainerSlot as addContainerSlotOp,
  mapContainers,
  makeStep,
  makeBlockOfType,
  findBlock,
  genBlockId,
  validateSequence,
  type MoveTarget,
  type AddableSlot,
} from '@/components/canvas/treeOps'

export const useCanvasStore = defineStore('canvas', () => {
  // --- Selected sequence and version ----------------------------------------
  const selectedSequenceId = ref<string | null>(null)
  const selectedInstanceId = ref<string | null>(null)

  // --- Loaded data ------------------------------------------------------------
  const loadedSequence = shallowRef<SequenceDefinition | null>(null)
  const executionNodes = shallowRef<ExecutionNode[]>([])

  // --- Editable model (single source of truth) --------------------------------
  const editable = shallowRef<EditableSequence | null>(null)
  /** Sequence-level validation messages (not tied to a single block). */
  const validationErrors = ref<string[]>([])

  /** Map of block_id → NodeState for fast lookup in the canvas. */
  const nodeStateMap = computed((): Record<string, NodeState> => {
    const map: Record<string, NodeState> = {}
    for (const n of executionNodes.value) {
      map[n.block_id] = n.state as NodeState
    }
    return map
  })

  const blocks = computed<BlockDefinition[]>(() => editable.value?.definition.blocks ?? [])
  const blockErrors = computed<Record<string, string>>(() => editable.value?.blockErrors ?? {})
  const isDirty = computed(() => editable.value?.dirty ?? false)
  const isValid = computed(
    () => Object.keys(blockErrors.value).length === 0 && validationErrors.value.length === 0,
  )

  // --- Loading ----------------------------------------------------------------

  function loadSequence(seq: SequenceDefinition) {
    loadedSequence.value = seq
    selectedSequenceId.value = seq.id
    const definition = JSON.parse(JSON.stringify(seq)) as SequenceDefinition
    const v = validateSequence(definition.blocks)
    editable.value = { definition, dirty: false, blockErrors: v.blockErrors }
    validationErrors.value = v.errors
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

  // --- Core mutation path -----------------------------------------------------

  /** Replace the canonical block tree, re-validate, and mark dirty. */
  function applyBlocks(newBlocks: BlockDefinition[]) {
    if (!editable.value) return
    const v = validateSequence(newBlocks)
    editable.value = {
      ...editable.value,
      definition: { ...editable.value.definition, blocks: newBlocks },
      dirty: true,
      blockErrors: v.blockErrors,
    }
    validationErrors.value = v.errors
  }

  // --- Structural mutators (route to pure treeOps) ----------------------------

  /** Insert a new step after `afterId` (null → append at root). */
  function addStep(afterId: string | null) {
    if (!editable.value) return
    applyBlocks(insertStep(editable.value.definition.blocks, afterId))
  }

  /** Append a new step into a specific container (used to seed empty branches). */
  function addStepInto(parentId: string, key: string) {
    if (!editable.value) return
    const cur = editable.value.definition.blocks
    const fresh = makeStep(genBlockId(cur))
    applyBlocks(
      updateBlockById(cur, parentId, (parent) =>
        mapContainers(parent, (k, list) => (k === key ? [...list, fresh] : list)),
      ),
    )
  }

  function removeBlock(id: string) {
    if (!editable.value) return
    applyBlocks(deleteBlock(editable.value.definition.blocks, id))
  }

  function reorder(id: string, dir: 'up' | 'down') {
    if (!editable.value) return
    applyBlocks(reorderSibling(editable.value.definition.blocks, id, dir))
  }

  function move(id: string, target: MoveTarget) {
    if (!editable.value) return
    applyBlocks(moveBlock(editable.value.definition.blocks, id, target))
  }

  function updateConfig(id: string, patch: Record<string, unknown>) {
    if (!editable.value) return
    applyBlocks(updateBlockConfig(editable.value.definition.blocks, id, patch))
  }

  /**
   * Convert a block to a different type in place (same id). Type-specific config is
   * replaced with fresh defaults for the new type (see treeOps.makeBlockOfType);
   * composites that need a non-empty body get one tree-unique seed step.
   */
  function changeBlockType(id: string, newType: BlockType) {
    if (!editable.value) return
    const blocks = editable.value.definition.blocks
    const existing = findBlock(blocks, id)
    if (!existing || existing.type === newType) return
    const seed = makeStep(genBlockId(blocks, 'step'))
    const replacement = makeBlockOfType(newType, id, seed)
    applyBlocks(updateBlockById(blocks, id, () => replacement))
  }

  /**
   * Add a container slot (a parallel/race branch, a router default, or a try_catch
   * finally) that the block type supports but doesn't yet have. The new empty slot
   * is then populated with the usual addStepInto.
   */
  function addContainerSlot(id: string, slot: AddableSlot) {
    if (!editable.value) return
    applyBlocks(addContainerSlotOp(editable.value.definition.blocks, id, slot))
  }

  /**
   * Rename a block's id (e.g. the editable Block ID field). Uniqueness is
   * pre-checked by the caller; applyBlocks still re-validates so a slipped-through
   * duplicate surfaces as a blockError rather than corrupting the tree.
   */
  function changeBlockId(oldId: string, newId: string) {
    if (!editable.value) return
    const trimmed = newId.trim()
    if (!trimmed || trimmed === oldId) return
    applyBlocks(renameBlock(editable.value.definition.blocks, oldId, trimmed))
  }

  /**
   * Adopt a just-persisted definition as the new clean baseline after a Save. The
   * server may have assigned a fresh id + version (production fork) or kept them
   * (in-place overwrite), so re-seat both loadedSequence and the editable model on
   * exactly what now lives on the server and clear `dirty`.
   */
  function commitSaved(def: SequenceDefinition) {
    loadedSequence.value = def
    selectedSequenceId.value = def.id
    const v = validateSequence(def.blocks)
    editable.value = {
      definition: JSON.parse(JSON.stringify(def)) as SequenceDefinition,
      dirty: false,
      blockErrors: v.blockErrors,
    }
    validationErrors.value = v.errors
  }

  // --- Backwards-compatible helpers -------------------------------------------

  function markDirty() {
    if (editable.value) {
      editable.value = { ...editable.value, dirty: true }
    }
  }

  /** Replace blocks wholesale (kept for compatibility; routes through applyBlocks). */
  function updateEditableBlocks(newBlocks: BlockDefinition[]) {
    applyBlocks(newBlocks)
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
    validationErrors.value = []
  }

  return {
    selectedSequenceId,
    selectedInstanceId,
    loadedSequence,
    executionNodes,
    editable,
    validationErrors,
    nodeStateMap,
    blocks,
    blockErrors,
    isDirty,
    isValid,
    loadSequence,
    updateLiveNodes,
    setSelectedInstance,
    addStep,
    addStepInto,
    removeBlock,
    reorder,
    move,
    updateConfig,
    changeBlockType,
    changeBlockId,
    addContainerSlot,
    commitSaved,
    markDirty,
    updateEditableBlocks,
    resetDirty,
    clearCanvas,
  }
})
