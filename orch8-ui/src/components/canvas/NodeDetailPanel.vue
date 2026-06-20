<script setup lang="ts">
/**
 * Node detail + editor drawer. Reads the live block from `editable.definition`
 * (passed in via nodeData) and emits structural/config mutations back to the
 * canvas store — it never mutates the tree directly.
 *
 * DESIGN_REFERENCE §dag-sequences.md §3, §7 Execution State
 */
import { computed, ref, watch } from 'vue'
import { Info, Settings, Activity, Pencil, Trash2, ArrowUp, ArrowDown, Plus, FolderInput } from 'lucide-vue-next'
import type { BlockDefinition } from '@/api/types/sequences'
import type { CanvasNodeData } from '@/api/types/canvas'
import { getContainers, type MoveTarget, type ContainerRef } from '@/components/canvas/treeOps'
import { BLOCK_VISUAL, stepIcon, stepColorClass } from './blockConfig'
import { titleCase, formatDateTime, prettyJson } from '@/lib/format'
import Drawer from '@/components/ui/Drawer.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import CodeBlock from '@/components/ui/CodeBlock.vue'
import KeyValue from '@/components/ui/KeyValue.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Tabs from '@/components/ui/Tabs.vue'

const props = defineProps<{
  open: boolean
  nodeData: CanvasNodeData | null
  error?: string
  moveTargets?: ContainerRef[]
  /** Route index to highlight when the panel was opened by clicking a router edge. */
  focusRouteIndex?: number | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update-config': [patch: Record<string, unknown>]
  delete: []
  reorder: [dir: 'up' | 'down']
  'insert-after': []
  move: [target: MoveTarget]
  'add-into': [key: string]
}>()

const activeTab = ref('config')

const block = computed(() => props.nodeData?.block ?? null)
const execNode = computed(() => props.nodeData?.execNode ?? null)
const nodeState = computed(() => props.nodeData?.nodeState ?? null)
const ownContainers = computed(() => (block.value ? getContainers(block.value) : []))
/** Scalar fields are only editable for these block types; others edit structure on canvas. */
const editableTypes = new Set<BlockDefinition['type']>([
  'step',
  'sub_sequence',
  'loop',
  'for_each',
  'race',
  'router',
])
const isEditable = computed(() => (block.value ? editableTypes.has(block.value.type) : false))

const visual = computed(() => {
  if (!block.value) return null
  if (block.value.type === 'step') {
    const step = block.value
    return { icon: stepIcon(step.handler), colorClass: stepColorClass(step.handler), label: titleCase(step.handler) }
  }
  return BLOCK_VISUAL[block.value.type]
})

const stateTone = computed(() => {
  const s = nodeState.value
  if (!s) return 'neutral' as const
  const map: Record<string, 'info' | 'success' | 'danger' | 'warning' | 'neutral'> = {
    running: 'info',
    waiting: 'warning',
    completed: 'success',
    failed: 'danger',
    cancelled: 'neutral',
    pending: 'neutral',
    skipped: 'neutral',
  }
  return map[s] ?? 'neutral'
})

// --- editable form (synced from the live block) ------------------------------
const form = ref<Record<string, string>>({})
const cancellable = ref(false)
const jsonError = ref<string | null>(null)
const moveSel = ref('')
/** Router routes — edited as a list (condition is scalar config; blocks stay structural). */
const routeForm = ref<{ condition: string; blocks: BlockDefinition[] }[]>([])
const hasDefault = ref(false)

function populate(b: BlockDefinition | null) {
  jsonError.value = null
  moveSel.value = ''
  routeForm.value = []
  hasDefault.value = false
  if (!b) {
    form.value = {}
    return
  }
  switch (b.type) {
    case 'step':
      cancellable.value = b.cancellable
      form.value = {
        handler: b.handler,
        timeout: b.timeout != null ? String(b.timeout) : '',
        queue_name: b.queue_name ?? '',
        rate_limit_key: b.rate_limit_key ?? '',
        params: prettyJson(b.params ?? {}),
      }
      break
    case 'sub_sequence':
      form.value = {
        sequence_name: b.sequence_name,
        version: b.version != null ? String(b.version) : '',
        input: prettyJson(b.input ?? {}),
      }
      break
    case 'loop':
      form.value = { condition: b.condition, max_iterations: String(b.max_iterations) }
      break
    case 'for_each':
      form.value = { collection: b.collection, item_var: b.item_var, max_iterations: String(b.max_iterations) }
      break
    case 'race':
      form.value = { semantics: b.semantics }
      break
    case 'router':
      routeForm.value = b.routes.map((r) => ({ condition: r.condition, blocks: r.blocks }))
      hasDefault.value = !!b.default
      form.value = {}
      break
    default:
      form.value = {}
  }
}
watch(() => props.nodeData?.block, (b) => populate(b ?? null), { immediate: true })

/**
 * Config edits are LOCAL (form refs) and commit to the store only on an explicit
 * "Apply" — never on keystroke. This batches a whole edit into ONE immutable tree
 * mutation + ONE rebuildGraph, so typing in a param field never runs the layout
 * pipeline. No debounce is needed because there is no live store path; large DAGs
 * stay responsive while editing, and JSON fields can be half-typed without churn.
 */
function applyConfig() {
  const b = block.value
  if (!b) return
  const f = form.value
  const patch: Record<string, unknown> = {}
  jsonError.value = null
  try {
    switch (b.type) {
      case 'step':
        patch.handler = String(f.handler ?? '')
        patch.timeout = f.timeout === '' || f.timeout == null ? undefined : Number(f.timeout)
        patch.queue_name = f.queue_name ? String(f.queue_name) : undefined
        patch.rate_limit_key = f.rate_limit_key ? String(f.rate_limit_key) : undefined
        patch.cancellable = cancellable.value
        patch.params = JSON.parse(String(f.params || '{}'))
        break
      case 'sub_sequence':
        patch.sequence_name = String(f.sequence_name ?? '')
        patch.version = f.version === '' || f.version == null ? undefined : Number(f.version)
        patch.input = JSON.parse(String(f.input || '{}'))
        break
      case 'loop':
        patch.condition = String(f.condition ?? '')
        patch.max_iterations = Number(f.max_iterations)
        break
      case 'for_each':
        patch.collection = String(f.collection ?? '')
        patch.item_var = String(f.item_var ?? '')
        patch.max_iterations = Number(f.max_iterations)
        break
      case 'race':
        patch.semantics = f.semantics
        break
      case 'router':
        // Conditions are scalar config edited here; each route's child blocks are
        // preserved as-is (edited structurally on the canvas). `default` is left
        // untouched by omitting it from the patch (shallow-merge keeps it).
        patch.routes = routeForm.value.map((r) => ({ condition: r.condition.trim(), blocks: r.blocks }))
        break
    }
  } catch {
    jsonError.value = 'Invalid JSON — fix the highlighted field before applying.'
    return
  }
  emit('update-config', patch)
}

function addRoute() {
  routeForm.value.push({ condition: '', blocks: [] })
}
function removeRoute(i: number) {
  routeForm.value.splice(i, 1)
}

function onMoveSelect(value: string) {
  if (!value) return
  const parsed = JSON.parse(value) as { parentId: string | null; key: string | null }
  emit('move', { parentId: parsed.parentId, key: parsed.key, index: Number.MAX_SAFE_INTEGER })
  moveSel.value = ''
}

const tabs = [
  { key: 'config', label: 'Config', icon: Settings },
  { key: 'live', label: 'Live State', icon: Activity },
]
</script>

<template>
  <Drawer
    :open="open"
    @update:open="emit('update:open', $event)"
    :title="block?.id ?? 'Block detail'"
    width="440px"
  >
    <template v-if="block && visual">
      <!-- Header -->
      <div class="mb-3 flex items-center gap-2">
        <span :class="['flex h-8 w-8 items-center justify-center rounded-lg', visual.colorClass]">
          <component :is="visual.icon" :size="16" />
        </span>
        <div>
          <p class="text-[13px] font-semibold text-text">{{ visual.label }}</p>
          <p class="mono text-[11px] text-muted">{{ block.type }}</p>
        </div>
        <div class="ml-auto">
          <StatusDot v-if="nodeState" :tone="stateTone" :pulse="nodeState === 'running'" />
        </div>
      </div>

      <!-- Validation error for this block -->
      <div
        v-if="error"
        class="mb-3 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] text-danger"
      >
        <Info :size="13" class="mt-0.5 shrink-0" />
        <span>{{ error }}</span>
      </div>

      <!-- Tabs is a tab BAR only (no panel slots — matches every other view);
           panel content lives in v-show siblings below. -->
      <Tabs :tabs="tabs" v-model="activeTab" class="mb-4" />

      <div v-show="activeTab === 'config'">
          <KeyValue label="Block ID" :value="block.id" mono class="mb-3" />

          <!-- Editable scalar fields -->
          <template v-if="isEditable">
            <div class="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
              <Pencil :size="11" /> Edit configuration
            </div>

            <template v-if="block.type === 'step'">
              <Field label="Handler" required class="mb-2.5">
                <Input v-model="form.handler" placeholder="log, http, transform…" />
              </Field>
              <div class="mb-2.5 grid grid-cols-2 gap-2">
                <Field label="Timeout (ms)"><Input v-model="form.timeout" type="number" placeholder="—" /></Field>
                <Field label="Queue"><Input v-model="form.queue_name" placeholder="default" /></Field>
              </div>
              <Field label="Rate-limit key" class="mb-2.5"><Input v-model="form.rate_limit_key" placeholder="—" /></Field>
              <label class="mb-2.5 flex items-center gap-2 text-[12.5px] text-text">
                <input type="checkbox" v-model="cancellable" class="accent-[var(--accent)]" />
                Cancellable
              </label>
              <Field label="Params (JSON)" :error="jsonError ?? undefined" class="mb-3">
                <Textarea v-model="form.params" :rows="6" class="mono text-[12px]" />
              </Field>
            </template>

            <template v-else-if="block.type === 'sub_sequence'">
              <Field label="Sequence name" required class="mb-2.5"><Input v-model="form.sequence_name" /></Field>
              <Field label="Version" class="mb-2.5"><Input v-model="form.version" type="number" placeholder="latest" /></Field>
              <Field label="Input (JSON)" :error="jsonError ?? undefined" class="mb-3">
                <Textarea v-model="form.input" :rows="5" class="mono text-[12px]" />
              </Field>
            </template>

            <template v-else-if="block.type === 'loop'">
              <Field label="Condition" required class="mb-2.5"><Input v-model="form.condition" placeholder="data.count < 10" /></Field>
              <Field label="Max iterations" class="mb-3"><Input v-model="form.max_iterations" type="number" /></Field>
            </template>

            <template v-else-if="block.type === 'for_each'">
              <Field label="Collection" required class="mb-2.5"><Input v-model="form.collection" placeholder="data.items" /></Field>
              <Field label="Item variable" required class="mb-2.5"><Input v-model="form.item_var" placeholder="item" /></Field>
              <Field label="Max iterations" class="mb-3"><Input v-model="form.max_iterations" type="number" /></Field>
            </template>

            <template v-else-if="block.type === 'race'">
              <Field label="Semantics" class="mb-3">
                <Select
                  v-model="form.semantics"
                  :options="[
                    { value: 'first_to_resolve', label: 'First to resolve' },
                    { value: 'first_to_succeed', label: 'First to succeed' },
                  ]"
                />
              </Field>
            </template>

            <template v-else-if="block.type === 'router'">
              <p class="mb-2.5 text-[12px] text-muted">
                Routes are evaluated top-down — the first matching condition wins. Each route's steps are edited on the
                canvas.
              </p>
              <div
                v-for="(r, i) in routeForm"
                :key="i"
                class="mb-2.5 rounded-md border px-3 py-2.5 transition-colors"
                :class="i === focusRouteIndex ? 'border-accent bg-accent-soft' : 'border-border bg-surface-2'"
              >
                <div class="mb-1.5 flex items-center justify-between">
                  <span class="text-[11px] font-medium uppercase tracking-wider text-muted">Route {{ i + 1 }}</span>
                  <button
                    class="rounded p-0.5 text-faint transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="routeForm.length <= 1"
                    title="Remove route"
                    @click="removeRoute(i)"
                  >
                    <Trash2 :size="13" />
                  </button>
                </div>
                <Field label="Condition" required>
                  <Input v-model="r.condition" placeholder="opened == true" class="mono text-[12px]" />
                </Field>
              </div>
              <Button variant="secondary" size="sm" class="mb-3" @click="addRoute">
                <template #icon><Plus :size="13" /></template>Add route
              </Button>
              <p
                v-if="hasDefault"
                class="mb-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-[11.5px] text-muted"
              >
                A <span class="font-medium text-text">default</span> branch handles the no-match case — edit its steps on
                the canvas.
              </p>
            </template>

            <Button variant="primary" size="sm" class="mb-4 w-full" @click="applyConfig">
              <template #icon><Pencil :size="13" /></template>
              Apply changes
            </Button>
          </template>

          <p v-else class="mb-4 rounded-md border border-border bg-surface-2 px-3 py-2 text-[12px] text-muted">
            This is a composite block. Edit its structure on the canvas — add, reorder, move, or delete its children below
            and via right-click.
          </p>

          <!-- Structure actions -->
          <div class="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
            <FolderInput :size="11" /> Structure
          </div>
          <div class="mb-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" @click="emit('reorder', 'up')">
              <template #icon><ArrowUp :size="13" /></template>Move up
            </Button>
            <Button variant="secondary" size="sm" @click="emit('reorder', 'down')">
              <template #icon><ArrowDown :size="13" /></template>Move down
            </Button>
            <Button variant="secondary" size="sm" @click="emit('insert-after')">
              <template #icon><Plus :size="13" /></template>Insert step after
            </Button>
          </div>

          <!-- Add child step (composites) -->
          <div v-if="ownContainers.length" class="mb-3">
            <p class="mb-1.5 text-[11px] text-subtle">Add a step inside:</p>
            <div class="flex flex-wrap gap-1.5">
              <Button v-for="c in ownContainers" :key="c.key" variant="ghost" size="sm" @click="emit('add-into', c.key)">
                <template #icon><Plus :size="12" /></template>{{ c.label }}
              </Button>
            </div>
          </div>

          <!-- Move into another container -->
          <Field v-if="moveTargets && moveTargets.length > 1" label="Move into" class="mb-3">
            <Select
              :model-value="moveSel"
              :options="moveTargets.map((t) => ({ value: JSON.stringify({ parentId: t.parentId, key: t.key }), label: t.label }))"
              placeholder="Choose destination…"
              @update:model-value="onMoveSelect(String($event))"
            />
          </Field>

          <Button variant="danger" size="sm" class="w-full" @click="emit('delete')">
            <template #icon><Trash2 :size="13" /></template>
            Delete block
          </Button>

          <!-- Full JSON -->
          <div class="mt-4">
            <p class="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted">Full Definition</p>
            <CodeBlock :content="block" language="json" />
          </div>
      </div>

      <div v-show="activeTab === 'live'" class="mt-2">
          <div v-if="nodeState && execNode">
            <div class="mb-3 flex items-center gap-2">
              <Badge :tone="stateTone">{{ titleCase(nodeState) }}</Badge>
              <span class="text-[12px] text-muted">node {{ execNode.id.slice(0, 8) }}…</span>
            </div>
            <KeyValue v-if="execNode.started_at" label="Started" :value="formatDateTime(execNode.started_at)" class="mb-2" />
            <KeyValue v-if="execNode.completed_at" label="Completed" :value="formatDateTime(execNode.completed_at)" class="mb-2" />
            <KeyValue
              v-if="execNode.branch_index !== null && execNode.branch_index !== undefined"
              label="Branch Index"
              :value="String(execNode.branch_index)"
              class="mb-2"
            />
          </div>
          <div v-else class="py-8 text-center text-[13px] text-muted">
            No live state — select an instance to overlay execution state.
          </div>
      </div>
    </template>

    <div v-else class="py-8 text-center text-[13px] text-muted">
      Select a node in the canvas to view and edit its details.
    </div>
  </Drawer>
</template>
