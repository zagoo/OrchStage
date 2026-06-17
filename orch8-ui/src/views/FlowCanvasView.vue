<script setup lang="ts">
/**
 * Interactive DAG Flow Canvas (product requirement 2.4 — centerpiece view).
 *
 * Features:
 *   - Sequence + version picker: load any sequence definition as a DAG.
 *   - Instance picker: overlay live execution state (polling GET /instances/{id}/tree).
 *   - Vue Flow canvas: BlockNode custom nodes, auto-layout, zoom/pan, MiniMap, Controls, Background.
 *   - NodeDetailPanel drawer: block config + live state when instance overlaid.
 *   - Edge editing: connect/remove edges, drag nodes; validate acyclicity before save.
 *   - Save: POST /sequences to create a new version. Export JSON download.
 *   - Keyboard: Esc closes drawer, Ctrl+Shift+F fits view.
 *
 * DESIGN_REFERENCE §dag-sequences.md, §instances-core.md
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick, markRaw } from 'vue'
import {
  VueFlow,
  useVueFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseEvent,
  type NodeComponent,
  MarkerType,
} from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'

// Import Vue Flow CSS (required)
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

import {
  Network,
  RefreshCw,
  AlertCircle,
} from 'lucide-vue-next'

import { useUiStore } from '@/stores/ui'
import { useCanvasStore } from '@/stores/canvas'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'

import { saveSequenceVersion, fetchExecutionTree } from '@/api/canvas'
import { exportSequenceAsJson } from '@/api/canvas'
import { errorMessage } from '@/api/errors'

import { computeLayout, buildEdges, isAcyclicEdge } from '@/components/canvas/dagLayout'
import type { CanvasNodeData } from '@/api/types/canvas'
import type { SequenceDefinition } from '@/api/types/sequences'
import type { ExecutionNode } from '@/api/types/instances'

import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

import BlockNode from '@/components/canvas/BlockNode.vue'
import SequencePicker from '@/components/canvas/SequencePicker.vue'
import InstancePicker from '@/components/canvas/InstancePicker.vue'
import CanvasToolbar from '@/components/canvas/CanvasToolbar.vue'
import NodeDetailPanel from '@/components/canvas/NodeDetailPanel.vue'

// ---- stores / composables ---------------------------------------------------

const ui = useUiStore()
const canvas = useCanvasStore()

// ---- Vue Flow setup ---------------------------------------------------------

const { fitView } = useVueFlow()

// SFC DefineComponent isn't structurally a Vue Flow NodeComponent, so cast at
// this single boundary; markRaw keeps the component out of the reactivity graph.
const nodeTypes = { 'block-node': markRaw(BlockNode) as unknown as NodeComponent }

// ---- reactive canvas state --------------------------------------------------

const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])
const minimapVisible = ref(true)
const saving = ref(false)
const loadingSequence = ref(false)
const loadError = ref<string | null>(null)

// Detail drawer
const detailOpen = ref(false)
const detailNodeData = ref<CanvasNodeData | null>(null)

// Picker state (v-model on pickers)
const pickerSequenceId = ref<string | null>(null)
const pickerVersionId = ref<string | null>(null)
const pickerInstanceId = ref<string | null>(null)

// ---- Sequence loading -------------------------------------------------------

async function loadSequenceById(seq: SequenceDefinition) {
  loadingSequence.value = true
  loadError.value = null
  try {
    // For the version picker load event, the seq object is already full definition
    canvas.loadSequence(seq)
    await rebuildCanvas(seq)
  } catch (e) {
    loadError.value = errorMessage(e)
  } finally {
    loadingSequence.value = false
  }
}

async function rebuildCanvas(seq: SequenceDefinition) {
  const layout = computeLayout(seq.blocks)
  const edgeSpecs = buildEdges(seq.blocks)

  const newNodes: Node[] = layout.positions.map((pos) => {
    const block = findBlock(seq.blocks, pos.id)
    if (!block) throw new Error(`Block not found for id: ${pos.id}`)
    const nodeState = canvas.nodeStateMap[pos.id]
    const execNode = canvas.executionNodes.find((n) => n.block_id === pos.id)
    const data: CanvasNodeData = {
      block,
      nodeState,
      execNode,
      depth: 0, // filled in after layout
      indexInDepth: 0,
    }
    return {
      id: pos.id,
      type: 'block-node',
      position: { x: pos.x, y: pos.y },
      data,
    }
  })

  const newEdges: Edge[] = edgeSpecs.map((spec) => ({
    id: spec.id,
    source: spec.source,
    target: spec.target,
    type: spec.edgeType === 'back' ? 'smoothstep' : 'default',
    animated: spec.animated ?? false,
    label: spec.label,
    markerEnd: MarkerType.ArrowClosed,
    style: spec.edgeType === 'back'
      ? { stroke: 'var(--color-purple)', strokeDasharray: '5 5' }
      : spec.edgeType === 'branch'
        ? { stroke: 'var(--color-accent)' }
        : undefined,
  }))

  nodes.value = newNodes
  edges.value = newEdges

  await nextTick()
  await fitView({ padding: 0.12, duration: 300 })
}

/** Depth-first search through nested block trees to find a block by id. */
function findBlock(blocks: SequenceDefinition['blocks'], id: string): SequenceDefinition['blocks'][number] | null {
  for (const block of blocks) {
    if (block.id === id) return block
    const children = getNestedBlocks(block)
    const found = findBlock(children, id)
    if (found) return found
  }
  return null
}

function getNestedBlocks(block: SequenceDefinition['blocks'][number]): SequenceDefinition['blocks'] {
  switch (block.type) {
    case 'parallel':
    case 'race':
      return block.branches.flat()
    case 'loop':
    case 'for_each':
      return block.body
    case 'router': {
      const all = block.routes.flatMap((r) => r.blocks)
      if (block.default) all.push(...block.default)
      return all
    }
    case 'try_catch': {
      const all = [...block.try_block, ...block.catch_block]
      if (block.finally_block) all.push(...block.finally_block)
      return all
    }
    case 'ab_split':
      return block.variants.flatMap((v) => v.blocks)
    case 'cancellation_scope':
      return block.blocks
    default:
      return []
  }
}

// ---- Live state overlay (polling) -------------------------------------------

const liveTree = useAsync((signal) => {
  const instanceId = canvas.selectedInstanceId
  if (!instanceId) return Promise.resolve([] as ExecutionNode[])
  return fetchExecutionTree(instanceId, signal)
})

const livePolling = usePolling(liveTree.run, {
  intervalMs: 4_000,
  immediate: false,
  pauseWhenHidden: true,
})

watch(
  () => canvas.selectedInstanceId,
  (id) => {
    if (id) {
      void liveTree.run()
      livePolling.start()
    } else {
      livePolling.stop()
      canvas.updateLiveNodes([])
      updateNodeLiveStates()
    }
  },
)

watch(liveTree.data, (nodes) => {
  if (!nodes) return
  canvas.updateLiveNodes(nodes)
  updateNodeLiveStates()
})

function updateNodeLiveStates() {
  // Spread over a SHALLOW view of the nodes: inlining the spread of Vue Flow's
  // deep generic `Node` type trips TS2589 (infinite instantiation depth).
  const current = nodes.value as unknown as Array<Record<string, unknown>>
  const remapped = current.map((n) => {
    const id = n.id as string
    return {
      ...n,
      data: {
        ...(n.data as CanvasNodeData),
        nodeState: canvas.nodeStateMap[id],
        execNode: canvas.executionNodes.find((en) => en.block_id === id),
      },
    }
  })
  nodes.value = remapped as unknown as Node[]
}

// ---- Instance picker sync ---------------------------------------------------

watch(pickerInstanceId, (id) => {
  canvas.setSelectedInstance(id)
})

// ---- Node click → detail drawer ---------------------------------------------

function onNodeClick(event: NodeMouseEvent) {
  const nodeData = event.node.data as CanvasNodeData
  if (!nodeData?.block) return
  detailNodeData.value = nodeData
  detailOpen.value = true
}

// ---- Edge connect / remove (in-memory editable model) -----------------------

function onConnect(params: Connection) {
  if (!params.source || !params.target) return

  // Validate acyclicity
  const existingEdgePairs = (edges.value as unknown as Array<{ source: string; target: string }>).map(
    (e) => ({ source: e.source, target: e.target }),
  )
  if (!isAcyclicEdge(existingEdgePairs, params.source, params.target)) {
    ui.error('Cycle detected', 'Adding this edge would create a cycle in the DAG.')
    return
  }

  const newEdge: Edge = {
    id: `e-user-${params.source}-${params.target}`,
    source: params.source,
    target: params.target,
    markerEnd: MarkerType.ArrowClosed,
  }
  // Cast needed: spread of deep Vue Flow generic Edge[] triggers TS2589
  edges.value = [...edges.value as unknown as Edge[], newEdge]
  canvas.markDirty()
}

function onEdgeRemove(edgesToRemove: Edge[]) {
  const ids = new Set(edgesToRemove.map((e) => e.id))
  ;(edges as unknown as { value: Edge[] }).value = (edges.value as unknown as Edge[]).filter((e) => !ids.has(e.id))
  canvas.markDirty()
}

function onNodeDragStop() {
  // Dragging repositions nodes; mark dirty for save
  canvas.markDirty()
}

// ---- Auto-layout ------------------------------------------------------------

async function runAutoLayout() {
  const seq = canvas.loadedSequence
  if (!seq) return
  const layout = computeLayout(seq.blocks)
  nodes.value = (nodes.value as unknown as Node[]).map((n) => {
    const pos = layout.positions.find((p) => p.id === n.id)
    return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n
  }) as unknown as Node[]
  await nextTick()
  await fitView({ padding: 0.12, duration: 300 })
}

// ---- Save (POST /sequences new version) -------------------------------------

async function handleSave() {
  const ed = canvas.editable
  if (!ed || !ed.dirty) return

  const ok = await ui.confirm({
    title: 'Save as new version?',
    message: 'This will create a new sequence version with your edits. The current version is preserved.',
    confirmText: 'Save new version',
    tone: 'default',
  })
  if (!ok) return

  saving.value = true
  try {
    const def = ed.definition
    // Build create request: bump version, new id (server assigns)
    const now = new Date().toISOString()
    const body = {
      ...def,
      version: def.version + 1,
      created_at: now,
    }
    const res = await saveSequenceVersion(body)
    if (res.warnings && res.warnings.length > 0) {
      ui.warning('Saved with warnings', res.warnings.join('; '))
    } else {
      ui.success('Version saved', `v${body.version} created (id: ${res.id.slice(0, 8)}…)`)
    }
    canvas.resetDirty()
  } catch (e) {
    ui.error('Save failed', errorMessage(e))
  } finally {
    saving.value = false
  }
}

// ---- Export JSON ------------------------------------------------------------

function handleExport() {
  const seq = canvas.loadedSequence
  if (!seq) return
  exportSequenceAsJson(seq)
}

// ---- Keyboard: Ctrl+Shift+F → fit view; Esc → close drawer ------------------

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && detailOpen.value) {
    detailOpen.value = false
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
    e.preventDefault()
    void fitView({ padding: 0.12, duration: 300 })
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  livePolling.stop()
})

// ---- Computed helpers -------------------------------------------------------

const sequenceLoaded = computed(() => canvas.loadedSequence !== null)
const dirty = computed(() => canvas.editable?.dirty ?? false)
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Page header -->
    <PageHeader
      title="Flow Canvas"
      description="Interactive DAG editor — load a sequence, visualise its block graph, and overlay live execution state."
      :icon="Network"
    >
      <template #actions>
        <!-- Sequence picker (in header actions for desktop density) -->
        <SequencePicker
          v-model="pickerSequenceId"
          v-model:version-value="pickerVersionId"
          @load="loadSequenceById"
        />

        <!-- Instance overlay picker (only when a sequence is loaded) -->
        <InstancePicker
          v-if="sequenceLoaded"
          :sequence-id="pickerSequenceId"
          v-model="pickerInstanceId"
        />
      </template>
    </PageHeader>

    <!-- Load error banner -->
    <div
      v-if="loadError"
      class="mb-3 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-danger"
      role="alert"
    >
      <AlertCircle :size="15" class="shrink-0" />
      <span>{{ loadError }}</span>
      <button class="ml-auto underline" @click="loadError = null">Dismiss</button>
    </div>

    <!-- Canvas toolbar (above the flow canvas) -->
    <CanvasToolbar
      v-if="sequenceLoaded"
      :dirty="dirty"
      :saving="saving"
      :minimap-visible="minimapVisible"
      :sequence-loaded="sequenceLoaded"
      @fit-view="fitView({ padding: 0.12, duration: 300 })"
      @auto-layout="runAutoLayout"
      @toggle-minimap="minimapVisible = !minimapVisible"
      @save="handleSave"
      @export-json="handleExport"
    />

    <!-- Main canvas area -->
    <div class="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-bg">
      <!-- Loading skeleton -->
      <div v-if="loadingSequence" class="flex h-full items-center justify-center">
        <div class="flex flex-col items-center gap-3">
          <RefreshCw :size="28" class="animate-spin text-accent" />
          <p class="text-[13px] text-muted">Loading sequence…</p>
        </div>
      </div>

      <!-- Empty state — no sequence loaded -->
      <div v-else-if="!sequenceLoaded" class="flex h-full items-center justify-center">
        <EmptyState
          :icon="Network"
          title="No sequence loaded"
          description="Select a sequence from the picker above to visualise its block DAG. You can then overlay live instance execution state in real time."
        />
      </div>

      <!-- Vue Flow canvas -->
      <VueFlow
        v-else
        v-model:nodes="nodes"
        v-model:edges="edges"
        :node-types="nodeTypes"
        :default-edge-options="{
          markerEnd: MarkerType.ArrowClosed,
          type: 'smoothstep',
        }"
        :connect-on-click="false"
        fit-view-on-init
        class="h-full w-full"
        :style="{ background: 'transparent' }"
        @node-click="onNodeClick"
        @connect="onConnect"
        @edges-delete="onEdgeRemove"
        @node-drag-stop="onNodeDragStop"
      >
        <Background pattern-color="var(--color-border)" :gap="24" :size="1" />

        <Controls
          :show-interactive="false"
          class="!bg-surface !border-border"
        />

        <MiniMap
          v-if="minimapVisible"
          :node-color="(n) => {
            const data = n.data as CanvasNodeData
            const state = data?.nodeState
            if (state === 'running') return 'var(--color-info)'
            if (state === 'completed') return 'var(--color-success)'
            if (state === 'failed') return 'var(--color-danger)'
            if (state === 'waiting') return 'var(--color-warning)'
            return 'var(--color-surface-2)'
          }"
          :node-stroke-width="2"
          :mask-color="'var(--overlay)'"
          class="!bg-surface !border-border"
        />
      </VueFlow>
    </div>

    <!-- Node detail drawer -->
    <NodeDetailPanel
      v-model:open="detailOpen"
      :node-data="detailNodeData"
    />
  </div>
</template>
