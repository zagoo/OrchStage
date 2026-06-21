<script setup lang="ts">
/**
 * Interactive DAG Flow Canvas (product requirement 2.4 — centerpiece view).
 *
 * STRUCTURE-FIRST EDITOR: `canvas.editable.definition.blocks` is the single
 * source of truth. The canvas NEVER lets you draw arbitrary edges — edges are
 * always DERIVED from the nested block tree (buildEdges). Every structural
 * gesture (drag-to-reorder, context menu, detail panel) routes to a store
 * mutator; `rebuildGraph()` then re-derives nodes + edges from the new tree.
 *
 * DESIGN_REFERENCE §dag-sequences.md, §instances-core.md
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick, markRaw } from 'vue'
import { useRoute } from 'vue-router'
import {
  VueFlow,
  useVueFlow,
  type Node,
  type Edge,
  type NodeMouseEvent,
  type EdgeMouseEvent,
  type NodeDragEvent,
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

import { Network, RefreshCw, AlertCircle, Plus, Trash2, ArrowUp, ArrowDown, CornerDownRight } from 'lucide-vue-next'

import { useUiStore } from '@/stores/ui'
import { useCanvasStore } from '@/stores/canvas'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'

import { saveSequenceVersion, fetchExecutionTree, exportSequenceAsJson } from '@/api/canvas'
import { errorMessage } from '@/api/errors'

import { computeLayout, buildEdges } from '@/components/canvas/dagLayout'
import {
  findBlock,
  findParent,
  getContainers,
  listContainers,
  descendantIds,
  type MoveTarget,
  type ContainerRef,
} from '@/components/canvas/treeOps'
import type { CanvasNodeData } from '@/api/types/canvas'
import type { SequenceDefinition, BlockDefinition, BlockType } from '@/api/types/sequences'
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
const route = useRoute()

// Deep-link: "Open in Canvas" navigates to /canvas?sequence=<id>. Read it once at
// setup and hand it to the picker, which auto-selects it after its list loads.
const initialSequenceId = typeof route.query.sequence === 'string' ? route.query.sequence : null

// ---- Vue Flow setup ---------------------------------------------------------

const { fitView, onNodesInitialized } = useVueFlow()

// Fit the view only once VueFlow has actually MEASURED the nodes. Calling
// fitView right after setting nodes races the measurement pass (and silently
// no-ops while the container has no height), so gate the load-time fit on this
// event. Mutations don't set the flag, so editing never yanks the viewport.
const fitPending = ref(false)
onNodesInitialized(() => {
  if (!fitPending.value) return
  fitPending.value = false
  void fitView({ padding: 0.14, duration: 300 })
})

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
const selectedNodeId = ref<string | null>(null)
// Set when the drawer is opened via a router edge click, so the panel can
// highlight the matching route's condition. Cleared on a plain node click.
const focusRouteIndex = ref<number | null>(null)

// Picker state (v-model on pickers)
const pickerSequenceId = ref<string | null>(null)
const pickerVersionId = ref<string | null>(null)
const pickerInstanceId = ref<string | null>(null)

// ---- Sequence loading -------------------------------------------------------

async function loadSequenceById(seq: SequenceDefinition) {
  loadingSequence.value = true
  loadError.value = null
  try {
    canvas.loadSequence(seq) // clones into editable.definition (source of truth)
    fitPending.value = true // fit once VueFlow has measured the new nodes
    await rebuildGraph()
  } catch (e) {
    loadError.value = errorMessage(e)
  } finally {
    loadingSequence.value = false
  }
}

/**
 * Re-derive Vue Flow nodes + edges from the canonical block tree.
 * Called on load and after EVERY mutation (via the editable watcher).
 */
async function rebuildGraph(opts: { fit?: boolean } = {}) {
  if (!canvas.editable) {
    nodes.value = []
    edges.value = []
    return
  }
  const blocks = canvas.blocks
  const layout = computeLayout(blocks)
  const edgeSpecs = buildEdges(blocks)

  const newNodes: Node[] = []
  for (const pos of layout.positions) {
    const block = findBlock(blocks, pos.id)
    if (!block) continue
    const data: CanvasNodeData = {
      block,
      nodeState: canvas.nodeStateMap[pos.id],
      execNode: canvas.executionNodes.find((n) => n.block_id === pos.id),
      depth: 0,
      indexInDepth: 0,
    }
    newNodes.push({ id: pos.id, type: 'block-node', position: { x: pos.x, y: pos.y }, data })
  }

  const newEdges: Edge[] = edgeSpecs.map((spec) => ({
    id: spec.id,
    source: spec.source,
    target: spec.target,
    type: spec.edgeType === 'back' ? 'smoothstep' : 'default',
    animated: spec.animated ?? false,
    label: spec.label,
    // Editable edges (router conditions) carry their owner so a click can open the
    // matching editor; `edge-editable` gives them a pointer-cursor affordance.
    data: spec.editable,
    class: spec.editable ? 'edge-editable' : undefined,
    markerEnd: MarkerType.ArrowClosed,
    style:
      spec.edgeType === 'back'
        ? { stroke: 'var(--color-purple)', strokeDasharray: '5 5' }
        : spec.edgeType === 'branch'
          ? { stroke: 'var(--color-accent)' }
          : undefined,
  }))

  nodes.value = newNodes
  edges.value = newEdges

  if (opts.fit) {
    await nextTick()
    await fitView({ padding: 0.12, duration: 300 })
  }
}

// ---- Single source of truth: re-derive on every tree mutation ---------------

watch(
  () => canvas.editable?.definition.blocks,
  () => {
    void rebuildGraph({ fit: false })
    // Keep the open detail drawer in sync with the live tree (or close it if the
    // block was deleted).
    if (detailOpen.value && detailNodeData.value) {
      const fresh = findBlock(canvas.blocks, detailNodeData.value.block.id)
      if (fresh) detailNodeData.value = { ...detailNodeData.value, block: fresh }
      else {
        detailOpen.value = false
        selectedNodeId.value = null
      }
    }
  },
)

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

watch(liveTree.data, (tree) => {
  if (!tree) return
  canvas.updateLiveNodes(tree)
  updateNodeLiveStates()
})

/** In-place update of node live state during polling (no relayout). */
function updateNodeLiveStates() {
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
  selectedNodeId.value = nodeData.block.id
  focusRouteIndex.value = null
  detailOpen.value = true
}

// ---- Edge click → edit the underlying config (router route conditions) -------
// Edges are derived, not free-drawn; an "editable" edge maps back to a block's
// config. Clicking one opens that block's detail editor (reusing the node's data)
// and highlights the relevant route.
function onEdgeClick(e: EdgeMouseEvent) {
  const meta = e.edge.data as { ownerId: string; routeIndex?: number } | undefined
  if (!meta?.ownerId) return
  // Cast to a minimal shape before .find — Vue Flow's full `Node` generic makes
  // array ops blow the instantiation-depth budget (same pattern as onNodeDragStop).
  const list = nodes.value as unknown as Array<{ id: string; data: CanvasNodeData }>
  const node = list.find((n) => n.id === meta.ownerId)
  if (!node) return
  detailNodeData.value = node.data
  selectedNodeId.value = meta.ownerId
  focusRouteIndex.value = meta.routeIndex ?? null
  detailOpen.value = true
}

// ---- Drag-to-reorder (gesture → reorder mutator) ----------------------------
// The layout places siblings horizontally, so the dropped X position maps to a
// new sibling index. A drag that doesn't change order snaps back (no mutation).
//
// ZOOM/PAN: `node.position` (both `e.node.position` and the entries in
// `nodes.value`) is in Vue Flow FLOW coordinates — the intrinsic graph space,
// not screen pixels. Vue Flow already divides the screen drag-delta by the zoom
// factor when it updates the position, so comparing positions is zoom/pan
// invariant. Applying a viewport-transform correction here would be a bug.

function onNodeDragStop(e: NodeDragEvent) {
  const id = e.node.id
  const parent = findParent(canvas.blocks, id)
  if (!parent) {
    void rebuildGraph()
    return
  }
  // Vue Flow `node.position` is in FLOW coordinates (graph space), independent of
  // the viewport's zoom + pan transform. So comparing the dragged node's x to its
  // siblings' x is inherently zoom/pan-invariant — no screen↔flow conversion needed.
  const xById = new Map(
    (nodes.value as unknown as Array<{ id: string; position: { x: number } }>).map((n) => [n.id, n.position.x]),
  )
  const draggedX = e.node.position.x
  const xOf = (b: BlockDefinition) => (b.id === id ? draggedX : (xById.get(b.id) ?? 0))
  const order = [...parent.siblings]
  const desired = [...order].sort((a, b) => xOf(a) - xOf(b))
  const sameOrder = desired.every((b, i) => b.id === order[i]?.id)
  if (sameOrder) {
    void rebuildGraph() // snap back to the deterministic layout
    return
  }
  const newIndex = desired.findIndex((b) => b.id === id)
  canvas.move(id, { parentId: parent.parentId, key: parent.key, index: newIndex })
}

// ---- Context menu (gesture → mutators) --------------------------------------

interface CtxState {
  open: boolean
  x: number
  y: number
  block: BlockDefinition | null
}
const ctx = ref<CtxState>({ open: false, x: 0, y: 0, block: null })
const ctxContainers = computed(() => (ctx.value.block ? getContainers(ctx.value.block) : []))

function onNodeContextMenu(e: NodeMouseEvent) {
  const native = e.event as MouseEvent
  native.preventDefault?.()
  const block = (e.node.data as CanvasNodeData)?.block
  if (!block) return
  ctx.value = { open: true, x: native.clientX, y: native.clientY, block }
}
function closeCtx() {
  ctx.value = { ...ctx.value, open: false }
}
function ctxInsertAfter() {
  if (ctx.value.block) canvas.addStep(ctx.value.block.id)
  closeCtx()
}
function ctxReorder(dir: 'up' | 'down') {
  if (ctx.value.block) canvas.reorder(ctx.value.block.id, dir)
  closeCtx()
}
function ctxDelete() {
  if (ctx.value.block) {
    canvas.removeBlock(ctx.value.block.id)
    if (selectedNodeId.value === ctx.value.block.id) detailOpen.value = false
  }
  closeCtx()
}
function ctxAddInto(key: string) {
  if (ctx.value.block) canvas.addStepInto(ctx.value.block.id, key)
  closeCtx()
}

// ---- Detail-panel events → mutators -----------------------------------------

function panelUpdateConfig(patch: Record<string, unknown>) {
  if (selectedNodeId.value) canvas.updateConfig(selectedNodeId.value, patch)
}
function panelChangeType(newType: BlockType) {
  if (selectedNodeId.value) canvas.changeBlockType(selectedNodeId.value, newType)
}
function panelDelete() {
  if (selectedNodeId.value) canvas.removeBlock(selectedNodeId.value)
  detailOpen.value = false
}
function panelReorder(dir: 'up' | 'down') {
  if (selectedNodeId.value) canvas.reorder(selectedNodeId.value, dir)
}
function panelInsertAfter() {
  if (selectedNodeId.value) canvas.addStep(selectedNodeId.value)
}
function panelMove(target: MoveTarget) {
  if (selectedNodeId.value) canvas.move(selectedNodeId.value, target)
}
function panelAddInto(key: string) {
  if (selectedNodeId.value) canvas.addStepInto(selectedNodeId.value, key)
}

const detailError = computed(() =>
  detailNodeData.value ? canvas.blockErrors[detailNodeData.value.block.id] : undefined,
)
const moveTargets = computed<ContainerRef[]>(() => {
  const b = detailNodeData.value?.block
  if (!b) return []
  const banned = new Set<string>([b.id, ...descendantIds(b)])
  return listContainers(canvas.blocks).filter((c) => c.parentId === null || !banned.has(c.parentId))
})

// ---- Toolbar actions --------------------------------------------------------

function addStepFromToolbar() {
  canvas.addStep(selectedNodeId.value)
}

async function runAutoLayout() {
  await rebuildGraph({ fit: true })
}

// ---- Save (POST /sequences new version) -------------------------------------

async function handleSave() {
  const ed = canvas.editable
  if (!ed || !ed.dirty) return

  if (!canvas.isValid) {
    ui.error('Cannot save', 'Resolve the highlighted validation errors before saving.')
    return
  }

  const ok = await ui.confirm({
    title: 'Save as new version?',
    message: 'This creates a new sequence version from your edits. The current version is preserved.',
    confirmText: 'Save new version',
    tone: 'default',
  })
  if (!ok) return

  saving.value = true
  try {
    const def = ed.definition
    const now = new Date().toISOString()
    const body = { ...def, version: def.version + 1, created_at: now }
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

// ---- Export JSON (operates on the LIVE editable definition) -----------------

function handleExport() {
  const def = canvas.editable?.definition ?? canvas.loadedSequence
  if (!def) return
  exportSequenceAsJson(def)
}

// ---- Keyboard: Ctrl+Shift+F → fit view; Esc → close drawer/menu -------------

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (ctx.value.open) {
      closeCtx()
      return
    }
    if (detailOpen.value) {
      detailOpen.value = false
      return
    }
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
const dirty = computed(() => canvas.isDirty)
const errorCount = computed(() => Object.keys(canvas.blockErrors).length + canvas.validationErrors.length)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- Page header -->
    <PageHeader
      title="Flow Canvas"
      description="Structure-first DAG editor — the block tree is the source of truth; edges are derived. Drag to reorder, right-click for actions, click a node to edit."
      :icon="Network"
    >
      <template #actions>
        <SequencePicker
          v-model="pickerSequenceId"
          v-model:version-value="pickerVersionId"
          :initial-sequence-id="initialSequenceId"
          @load="loadSequenceById"
        />
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

    <!-- Validation banner -->
    <div
      v-if="sequenceLoaded && errorCount > 0"
      class="mb-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-[12.5px] text-warning"
      role="alert"
    >
      <AlertCircle :size="14" class="shrink-0" />
      <span>
        {{ errorCount }} validation {{ errorCount === 1 ? 'issue' : 'issues' }} —
        {{ canvas.validationErrors.join('; ') || 'see highlighted blocks' }}. Saving is blocked until resolved.
      </span>
    </div>

    <!-- Canvas toolbar -->
    <CanvasToolbar
      v-if="sequenceLoaded"
      :dirty="dirty"
      :saving="saving"
      :minimap-visible="minimapVisible"
      :sequence-loaded="sequenceLoaded"
      :valid="canvas.isValid"
      @add-step="addStepFromToolbar"
      @fit-view="fitView({ padding: 0.12, duration: 300 })"
      @auto-layout="runAutoLayout"
      @toggle-minimap="minimapVisible = !minimapVisible"
      @save="handleSave"
      @export-json="handleExport"
    />

    <!-- Main canvas area -->
    <div class="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-bg">
      <div v-if="loadingSequence" class="flex h-full items-center justify-center">
        <div class="flex flex-col items-center gap-3">
          <RefreshCw :size="28" class="animate-spin text-accent" />
          <p class="text-[13px] text-muted">Loading sequence…</p>
        </div>
      </div>

      <div v-else-if="!sequenceLoaded" class="flex h-full items-center justify-center">
        <EmptyState
          :icon="Network"
          title="No sequence loaded"
          description="Select a sequence from the picker above to visualise its block DAG, edit its structure, and overlay live instance execution state."
        />
      </div>

      <VueFlow
        v-else
        v-model:nodes="nodes"
        v-model:edges="edges"
        :node-types="nodeTypes"
        :nodes-connectable="false"
        :edges-updatable="false"
        :connect-on-click="false"
        fit-view-on-init
        class="h-full w-full"
        :style="{ background: 'transparent' }"
        @node-click="onNodeClick"
        @edge-click="onEdgeClick"
        @node-drag-stop="onNodeDragStop"
        @node-context-menu="onNodeContextMenu"
        @pane-click="closeCtx"
      >
        <Background pattern-color="var(--color-border)" :gap="24" :size="1" />
        <Controls :show-interactive="false" class="!bg-surface !border-border" />
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

    <!-- Context menu (teleported, fixed at cursor) -->
    <Teleport to="body">
      <template v-if="ctx.open">
        <div class="fixed inset-0 z-[120]" @click="closeCtx" @contextmenu.prevent="closeCtx" />
        <div
          class="anim-pop fixed z-[121] min-w-[200px] overflow-hidden rounded-lg border border-border-strong bg-elevated py-1 shadow-pop"
          :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
          role="menu"
        >
          <p class="mono truncate px-3 py-1 text-[10.5px] uppercase tracking-wide text-faint">{{ ctx.block?.id }}</p>
          <button class="ctx-item" role="menuitem" @click="ctxInsertAfter">
            <Plus :size="14" /> Insert step after
          </button>
          <button class="ctx-item" role="menuitem" @click="ctxReorder('up')">
            <ArrowUp :size="14" /> Move up
          </button>
          <button class="ctx-item" role="menuitem" @click="ctxReorder('down')">
            <ArrowDown :size="14" /> Move down
          </button>
          <template v-if="ctxContainers.length">
            <div class="my-1 h-px bg-border" />
            <button
              v-for="c in ctxContainers"
              :key="c.key"
              class="ctx-item"
              role="menuitem"
              @click="ctxAddInto(c.key)"
            >
              <CornerDownRight :size="14" /> Add step → {{ c.label }}
            </button>
          </template>
          <div class="my-1 h-px bg-border" />
          <button class="ctx-item ctx-danger" role="menuitem" @click="ctxDelete">
            <Trash2 :size="14" /> Delete block
          </button>
        </div>
      </template>
    </Teleport>

    <!-- Node detail / editor drawer -->
    <NodeDetailPanel
      v-model:open="detailOpen"
      :node-data="detailNodeData"
      :error="detailError"
      :move-targets="moveTargets"
      :focus-route-index="focusRouteIndex"
      @update-config="panelUpdateConfig"
      @change-type="panelChangeType"
      @delete="panelDelete"
      @reorder="panelReorder"
      @insert-after="panelInsertAfter"
      @move="panelMove"
      @add-into="panelAddInto"
    />
  </div>
</template>

<style scoped>
.ctx-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  font-size: 12.5px;
  color: var(--text);
  transition: background-color 0.12s;
}
.ctx-item:hover {
  background: var(--hover);
}
.ctx-danger {
  color: var(--danger);
}

/* Smooth re-layout: after a mutation, rebuildGraph() re-derives node positions;
   animate the move so the graph doesn't harshly snap/flash. Never transition a
   node that's actively being dragged (that would lag behind the cursor). */
:deep(.vue-flow__node) {
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}
:deep(.vue-flow__node.dragging) {
  transition: none;
}
</style>

<style>
/* Smooth re-layout: animate node POSITION changes after a mutation so the
   re-derived graph glides into place instead of snapping/flashing. Disabled
   mid-drag (Vue Flow adds `.dragging`) so the dragged node tracks the cursor
   1:1. Viewport pan/zoom is untouched — that transforms the pane, not nodes. */
.vue-flow__node {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.vue-flow__node.dragging {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .vue-flow__node {
    transition: none;
  }
}

/* Editable edges (router conditions) hint that they're clickable. */
.vue-flow__edge.edge-editable {
  cursor: pointer;
}
.vue-flow__edge.edge-editable:hover .vue-flow__edge-path {
  stroke-width: 2.5;
}
.vue-flow__edge.edge-editable .vue-flow__edge-text {
  cursor: pointer;
}
</style>
