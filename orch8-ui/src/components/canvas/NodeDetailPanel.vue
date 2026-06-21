<script setup lang="ts">
/**
 * Node detail + editor drawer. Reads the live block from `editable.definition`
 * (passed in via nodeData) and emits structural/config mutations back to the
 * canvas store — it never mutates the tree directly.
 *
 * DESIGN_REFERENCE §dag-sequences.md §3, §7 Execution State
 */
import { computed, ref, watch } from 'vue'
import { Info, Settings, Activity, Pencil, Trash2, ArrowUp, ArrowDown, Plus, FolderInput, Check } from 'lucide-vue-next'
import type { BlockDefinition, BlockType } from '@/api/types/sequences'
import type { CanvasNodeData } from '@/api/types/canvas'
import { getContainers, type MoveTarget, type ContainerRef, type AddableSlot } from '@/components/canvas/treeOps'
import {
  BLOCK_VISUAL,
  stepIcon,
  stepColorClass,
  STEP_HANDLERS,
  HANDLER_PARAM_TEMPLATE,
  STEP_JSON_FIELD_EXAMPLE,
  blockTypeDescription,
  handlerDescription,
} from './blockConfig'
import JsonExampleControls from './JsonExampleControls.vue'
import { titleCase, formatDateTime, prettyJson } from '@/lib/format'
import Drawer from '@/components/ui/Drawer.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
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
  'change-type': [type: BlockType]
  'change-id': [id: string]
  delete: []
  reorder: [dir: 'up' | 'down']
  'insert-after': []
  move: [target: MoveTarget]
  'add-into': [key: string]
  'add-container': [slot: AddableSlot]
}>()

const activeTab = ref('config')

// Block-type switcher — selecting a type converts the block (parent reroutes to
// canvas.changeBlockType, which replaces it with fresh defaults of that type).
const blockTypeOptions = (Object.keys(BLOCK_VISUAL) as BlockType[]).map((t) => ({
  value: t,
  label: BLOCK_VISUAL[t].label,
}))
// Bumped on every pick to force the type Select to remount and re-read the live
// block.type. Without this, a change the parent BLOCKS (incompatible upstream) would
// leave the Select stuck on the rejected value (defineModel keeps its local state
// when the one-way :model-value prop doesn't move). Remounting snaps it back.
const typeSelectNonce = ref(0)
function onTypeChange(t: string | undefined) {
  typeSelectNonce.value++
  if (block.value && t && t !== block.value.type) emit('change-type', t as BlockType)
}

const block = computed(() => props.nodeData?.block ?? null)
const execNode = computed(() => props.nodeData?.execNode ?? null)

// Optional container slots the block type supports but doesn't have yet — surfaced
// as "Add …" actions (parallel/race branches are unbounded; router default and
// try_catch finally are optional single slots). Routes/variants have their own editors.
const canAddBranch = computed(() => {
  const t = block.value?.type
  return t === 'parallel' || t === 'race'
})
const canAddDefault = computed(() => {
  const b = block.value
  return b?.type === 'router' && !b.default
})
const canAddFinally = computed(() => {
  const b = block.value
  return b?.type === 'try_catch' && !b.finally_block
})

// Editable Block ID (top of the panel). Edited locally and committed on Enter /
// the confirm button; the parent (FlowCanvasView.panelChangeId) validates
// uniqueness, renames in the tree, and keeps the selection + drawer in sync.
const blockIdDraft = ref('')
const idChanged = computed(
  () => !!block.value && blockIdDraft.value.trim() !== '' && blockIdDraft.value.trim() !== block.value.id,
)
function commitBlockId() {
  if (!block.value) return
  const next = blockIdDraft.value.trim()
  if (!next || next === block.value.id) return
  emit('change-id', next)
}

// Complete JSON example for a field, exactly as defined in source (blockConfig).
// Params are handler-specific; the advanced step fields use STEP_JSON_FIELD_EXAMPLE.
function paramsExample(): string {
  return prettyJson(HANDLER_PARAM_TEMPLATE[form.value.handler] ?? {})
}
function fieldExample(key: string): string {
  return prettyJson(STEP_JSON_FIELD_EXAMPLE[key] ?? {})
}
// sub_sequence input is schema-less (it's the called workflow's own input), so a
// small representative example stands in for a typed shape.
const subSeqInputExample = prettyJson({ key: 'value' })
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
  'a_b_split',
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
const continueOnError = ref(false)
/** Per-JSON-field parse errors keyed by form key, so each editor surfaces its own. */
const jsonErrors = ref<Record<string, string>>({})
const moveSel = ref('')
/** A/B-split variants — name + weight are scalar config; blocks stay structural. */
const variantForm = ref<{ name: string; weight: string; blocks: BlockDefinition[] }[]>([])
/** Router routes — edited as a list (condition is scalar config; blocks stay structural). */
const routeForm = ref<{ condition: string; blocks: BlockDefinition[] }[]>([])
const hasDefault = ref(false)

// Handler picker (step blocks). Keep the current handler in the list even if it
// isn't a known one, so an existing custom handler isn't dropped from the options.
const handlerOptions = computed(() => {
  const cur = form.value.handler
  const list = cur && !STEP_HANDLERS.includes(cur) ? [cur, ...STEP_HANDLERS] : STEP_HANDLERS
  return list.map((h) => ({ value: h, label: h }))
})

// Exact JSON string we last auto-filled, so we can tell an UNEDITED template apart
// from real/custom content. Null whenever Params holds loaded or user-typed content.
const autoFilledParams = ref<string | null>(null)
// When a handler change would clobber custom Params, we DON'T overwrite — we stash
// the handler here and surface an explicit "use template" opt-in instead.
const templateOffer = ref<string | null>(null)

/** Safe to overwrite Params: it's blank, an empty object, or an unedited auto-fill. */
function paramsArePristine(): boolean {
  const cur = (form.value.params ?? '').trim()
  return cur === '' || cur === '{}' || cur === autoFilledParams.value
}

function fillTemplate(h: string) {
  const tpl = prettyJson(HANDLER_PARAM_TEMPLATE[h] ?? {})
  form.value.params = tpl
  autoFilledParams.value = tpl
  templateOffer.value = null
}

/**
 * Selecting a handler fills Params with that handler's standard JSON template —
 * but only when Params is pristine. If the user has loaded or hand-edited Params,
 * we keep their content and offer the template as an explicit opt-in (no silent loss).
 */
function onHandlerSelect(h: string | undefined) {
  if (!h) return
  form.value.handler = h
  if (paramsArePristine()) fillTemplate(h)
  else templateOffer.value = h
}

/** User accepted the offer to replace their custom Params with the template. */
function applyTemplateOffer() {
  if (templateOffer.value) fillTemplate(templateOffer.value)
}

function populate(b: BlockDefinition | null) {
  blockIdDraft.value = b?.id ?? ''
  jsonErrors.value = {}
  moveSel.value = ''
  routeForm.value = []
  variantForm.value = []
  hasDefault.value = false
  continueOnError.value = false
  // Loaded Params are real content, not an auto-fill — don't let the next handler
  // change silently clobber them, and clear any stale template offer.
  autoFilledParams.value = null
  templateOffer.value = null
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
        delay: b.delay ? prettyJson(b.delay) : '',
        retry: b.retry ? prettyJson(b.retry) : '',
        send_window: b.send_window ? prettyJson(b.send_window) : '',
        context_access: b.context_access ? prettyJson(b.context_access) : '',
        wait_for_input: b.wait_for_input ? prettyJson(b.wait_for_input) : '',
        deadline: b.deadline != null ? String(b.deadline) : '',
        on_deadline_breach: b.on_deadline_breach ? prettyJson(b.on_deadline_breach) : '',
        fallback_handler: b.fallback_handler ?? '',
        cache_key: b.cache_key ?? '',
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
      continueOnError.value = b.continue_on_error
      form.value = {
        condition: b.condition,
        max_iterations: String(b.max_iterations),
        break_on: b.break_on ?? '',
        poll_interval: b.poll_interval != null ? String(b.poll_interval) : '',
        retain_iterations: b.retain_iterations != null ? String(b.retain_iterations) : '',
      }
      break
    case 'for_each':
      form.value = {
        collection: b.collection,
        item_var: b.item_var,
        max_iterations: String(b.max_iterations),
        retain_iterations: b.retain_iterations != null ? String(b.retain_iterations) : '',
      }
      break
    case 'race':
      form.value = { semantics: b.semantics }
      break
    case 'router':
      routeForm.value = b.routes.map((r) => ({ condition: r.condition, blocks: r.blocks }))
      hasDefault.value = !!b.default
      form.value = {}
      break
    case 'a_b_split':
      variantForm.value = b.variants.map((v) => ({ name: v.name, weight: String(v.weight), blocks: v.blocks }))
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
  jsonErrors.value = {}

  // Typed helpers over the flat form. A `type="number"` input makes Vue cast its
  // v-model to a NUMBER, so a form value may be a number (not a string) at runtime —
  // ALWAYS coerce with String() before any string op, or ms fields like Timeout /
  // Deadline crash with "(x ?? '').trim is not a function". Optional scalars become
  // `undefined` when blank; JSON fields record a per-field parse error.
  const strAt = (k: string): string => {
    const v = f[k]
    return v == null ? '' : String(v)
  }
  const numOf = (k: string): number | undefined => {
    const s = strAt(k).trim()
    if (s === '') return undefined
    const n = Number(s)
    return Number.isNaN(n) ? undefined : n
  }
  const strOf = (k: string): string | undefined => {
    const s = strAt(k)
    return s === '' ? undefined : s
  }
  const jsonOf = (k: string, required = false): unknown => {
    const s = strAt(k).trim()
    if (s === '') return required ? {} : undefined
    try {
      return JSON.parse(s)
    } catch {
      jsonErrors.value[k] = 'Invalid JSON'
      return undefined
    }
  }

  switch (b.type) {
    case 'step':
      patch.handler = String(f.handler ?? '')
      patch.timeout = numOf('timeout')
      patch.queue_name = strOf('queue_name')
      patch.rate_limit_key = strOf('rate_limit_key')
      patch.cancellable = cancellable.value
      patch.params = jsonOf('params', true)
      patch.delay = jsonOf('delay')
      patch.retry = jsonOf('retry')
      patch.send_window = jsonOf('send_window')
      patch.context_access = jsonOf('context_access')
      patch.wait_for_input = jsonOf('wait_for_input')
      patch.deadline = numOf('deadline')
      patch.on_deadline_breach = jsonOf('on_deadline_breach')
      patch.fallback_handler = strOf('fallback_handler')
      patch.cache_key = strOf('cache_key')
      break
    case 'sub_sequence':
      patch.sequence_name = String(f.sequence_name ?? '')
      patch.version = numOf('version')
      patch.input = jsonOf('input', true)
      break
    case 'loop':
      patch.condition = String(f.condition ?? '')
      patch.max_iterations = Number(f.max_iterations)
      patch.continue_on_error = continueOnError.value
      patch.break_on = strOf('break_on')
      patch.poll_interval = numOf('poll_interval')
      patch.retain_iterations = numOf('retain_iterations')
      break
    case 'for_each':
      patch.collection = String(f.collection ?? '')
      patch.item_var = String(f.item_var ?? '')
      patch.max_iterations = Number(f.max_iterations)
      patch.retain_iterations = numOf('retain_iterations')
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
    case 'a_b_split':
      // Name + weight are scalar config; each variant's blocks are edited on canvas.
      patch.variants = variantForm.value.map((v) => ({ name: v.name, weight: Number(v.weight), blocks: v.blocks }))
      break
  }

  // A JSON field failed to parse — keep the panel open with field-level errors.
  if (Object.keys(jsonErrors.value).length > 0) return
  emit('update-config', patch)
}

function addRoute() {
  routeForm.value.push({ condition: '', blocks: [] })
}
function removeRoute(i: number) {
  routeForm.value.splice(i, 1)
}

function addVariant() {
  variantForm.value.push({ name: '', weight: '0', blocks: [] })
}
function removeVariant(i: number) {
  variantForm.value.splice(i, 1)
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
          <!-- Editable Block ID (must be globally unique). Commit with Enter or the
               check button; the parent validates uniqueness before renaming. -->
          <Field label="Block ID" required class="mb-3">
            <div class="flex items-center gap-1.5">
              <Input
                v-model="blockIdDraft"
                mono
                class="flex-1"
                placeholder="unique_block_id"
                @keyup.enter="commitBlockId"
              />
              <IconButton
                v-if="idChanged"
                label="Rename block (Enter)"
                variant="secondary"
                size="sm"
                @click="commitBlockId"
              >
                <Check :size="15" />
              </IconButton>
              <CopyButton :value="block.id" :size="14" />
            </div>
            <p v-if="idChanged" class="mt-1 text-[11px] text-subtle">
              Press Enter or ✓ to rename. IDs must be unique across the workflow.
            </p>
          </Field>

          <!-- Block-type switcher: pick any type; the editor re-renders that type's fields.
               :key forces a re-sync to the live block.type so a blocked change reverts. -->
          <Field label="Block type" class="mb-2">
            <Select
              :key="typeSelectNonce"
              :model-value="block.type"
              :options="blockTypeOptions"
              @update:model-value="onTypeChange"
            />
          </Field>
          <!-- Business-logic explanation of the selected block type -->
          <div class="mb-3 flex items-start gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-[11.5px] text-muted">
            <Info :size="13" class="mt-0.5 shrink-0 text-subtle" />
            <span>{{ blockTypeDescription(block.type) }}</span>
          </div>

          <!-- Editable scalar fields -->
          <template v-if="isEditable">
            <div class="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
              <Pencil :size="11" /> Edit configuration
            </div>

            <template v-if="block.type === 'step'">
              <Field label="Handler" required class="mb-1.5">
                <Select :model-value="form.handler" :options="handlerOptions" @update:model-value="onHandlerSelect" />
              </Field>
              <!-- Business-logic significance of the selected handler -->
              <div
                v-if="handlerDescription(form.handler)"
                class="mb-2.5 flex items-start gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-[11.5px] text-muted"
              >
                <Info :size="13" class="mt-0.5 shrink-0 text-subtle" />
                <span>{{ handlerDescription(form.handler) }}</span>
              </div>
              <div class="mb-2.5 grid grid-cols-2 gap-2">
                <Field label="Timeout (ms)"><Input v-model="form.timeout" type="number" placeholder="—" /></Field>
                <Field label="Queue"><Input v-model="form.queue_name" placeholder="default" /></Field>
              </div>
              <Field label="Rate-limit key" class="mb-2.5"><Input v-model="form.rate_limit_key" placeholder="—" /></Field>
              <label class="mb-2.5 flex items-center gap-2 text-[12.5px] text-text">
                <input type="checkbox" v-model="cancellable" class="accent-[var(--accent)]" />
                Cancellable
              </label>
              <Field label="Params (JSON)" :error="jsonErrors.params" class="mb-3">
                <JsonExampleControls :value="paramsExample()" @insert="form.params = paramsExample()" />
                <Textarea v-model="form.params" :rows="6" class="mono text-[12px]" />
              </Field>
              <!-- Safeguard: a handler change never silently wipes custom Params —
                   it offers the template as an explicit opt-in instead. -->
              <div
                v-if="templateOffer"
                class="mb-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[11.5px] text-warning"
              >
                <Info :size="13" class="mt-0.5 shrink-0" />
                <span>
                  Kept your custom Params.
                  <button class="font-semibold underline hover:opacity-80" @click="applyTemplateOffer">
                    Use the {{ templateOffer }} template
                  </button>
                  instead?
                </span>
              </div>

              <!-- Advanced step fields (all optional) — typed sub-objects edited as
                   JSON, mirroring the Params editor; placeholders show their shape. -->
              <div class="mb-2 mt-1 text-[11px] font-medium uppercase tracking-wider text-faint">Advanced (optional)</div>
              <div class="mb-2.5 grid grid-cols-2 gap-2">
                <Field label="Deadline (ms)"><Input v-model="form.deadline" type="number" placeholder="—" /></Field>
                <Field label="Fallback handler"><Input v-model="form.fallback_handler" placeholder="—" /></Field>
              </div>
              <Field label="Cache key" class="mb-2.5"><Input v-model="form.cache_key" placeholder="—" /></Field>
              <Field label="Retry policy (JSON)" :error="jsonErrors.retry" class="mb-2.5">
                <JsonExampleControls :value="fieldExample('retry')" @insert="form.retry = fieldExample('retry')" />
                <Textarea
                  v-model="form.retry"
                  :rows="4"
                  class="mono text-[12px]"
                  placeholder='{ "max_attempts": 3, "initial_backoff": 1, "max_backoff": 60, "backoff_multiplier": 2 }'
                />
              </Field>
              <Field label="Delay (JSON)" :error="jsonErrors.delay" class="mb-2.5">
                <JsonExampleControls :value="fieldExample('delay')" @insert="form.delay = fieldExample('delay')" />
                <Textarea
                  v-model="form.delay"
                  :rows="3"
                  class="mono text-[12px]"
                  placeholder='{ "duration": 0, "business_days_only": false, "holidays": [] }'
                />
              </Field>
              <Field label="Send window (JSON)" :error="jsonErrors.send_window" class="mb-2.5">
                <JsonExampleControls
                  :value="fieldExample('send_window')"
                  @insert="form.send_window = fieldExample('send_window')"
                />
                <Textarea
                  v-model="form.send_window"
                  :rows="3"
                  class="mono text-[12px]"
                  placeholder='{ "start_hour": 9, "end_hour": 17, "days": [1, 2, 3, 4, 5] }'
                />
              </Field>
              <Field label="Context access (JSON)" :error="jsonErrors.context_access" class="mb-2.5">
                <JsonExampleControls
                  :value="fieldExample('context_access')"
                  @insert="form.context_access = fieldExample('context_access')"
                />
                <Textarea
                  v-model="form.context_access"
                  :rows="3"
                  class="mono text-[12px]"
                  placeholder='{ "data": "all", "config": false, "audit": false, "runtime": false }'
                />
              </Field>
              <Field label="Wait for input (JSON)" :error="jsonErrors.wait_for_input" class="mb-2.5">
                <JsonExampleControls
                  :value="fieldExample('wait_for_input')"
                  @insert="form.wait_for_input = fieldExample('wait_for_input')"
                />
                <Textarea
                  v-model="form.wait_for_input"
                  :rows="4"
                  class="mono text-[12px]"
                  placeholder='{ "prompt": "", "allow_comment": true }'
                />
              </Field>
              <Field label="On deadline breach (JSON)" :error="jsonErrors.on_deadline_breach" class="mb-3">
                <JsonExampleControls
                  :value="fieldExample('on_deadline_breach')"
                  @insert="form.on_deadline_breach = fieldExample('on_deadline_breach')"
                />
                <Textarea
                  v-model="form.on_deadline_breach"
                  :rows="3"
                  class="mono text-[12px]"
                  placeholder='{ "handler": "", "params": {} }'
                />
              </Field>
            </template>

            <template v-else-if="block.type === 'sub_sequence'">
              <Field label="Sequence name" required class="mb-2.5"><Input v-model="form.sequence_name" /></Field>
              <Field label="Version" class="mb-2.5"><Input v-model="form.version" type="number" placeholder="latest" /></Field>
              <Field label="Input (JSON)" :error="jsonErrors.input" class="mb-3">
                <JsonExampleControls :value="subSeqInputExample" @insert="form.input = subSeqInputExample" />
                <Textarea v-model="form.input" :rows="5" class="mono text-[12px]" />
              </Field>
            </template>

            <template v-else-if="block.type === 'loop'">
              <Field label="Condition" required class="mb-2.5"><Input v-model="form.condition" placeholder="data.count < 10" /></Field>
              <Field label="Max iterations" required class="mb-2.5"><Input v-model="form.max_iterations" type="number" /></Field>
              <label class="mb-2.5 flex items-center gap-2 text-[12.5px] text-text">
                <input type="checkbox" v-model="continueOnError" class="accent-[var(--accent)]" />
                Continue on error
              </label>
              <Field label="Break on" class="mb-2.5"><Input v-model="form.break_on" placeholder="—" /></Field>
              <div class="mb-3 grid grid-cols-2 gap-2">
                <Field label="Poll interval (ms)"><Input v-model="form.poll_interval" type="number" placeholder="—" /></Field>
                <Field label="Retain iterations"><Input v-model="form.retain_iterations" type="number" placeholder="—" /></Field>
              </div>
            </template>

            <template v-else-if="block.type === 'for_each'">
              <Field label="Collection" required class="mb-2.5"><Input v-model="form.collection" placeholder="data.items" /></Field>
              <Field label="Item variable" required class="mb-2.5"><Input v-model="form.item_var" placeholder="item" /></Field>
              <div class="mb-3 grid grid-cols-2 gap-2">
                <Field label="Max iterations" required><Input v-model="form.max_iterations" type="number" /></Field>
                <Field label="Retain iterations"><Input v-model="form.retain_iterations" type="number" placeholder="—" /></Field>
              </div>
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

            <template v-else-if="block.type === 'a_b_split'">
              <p class="mb-2.5 text-[12px] text-muted">
                Variants are weighted; each variant's steps are edited on the canvas.
              </p>
              <div
                v-for="(v, i) in variantForm"
                :key="i"
                class="mb-2.5 rounded-md border border-border bg-surface-2 px-3 py-2.5"
              >
                <div class="mb-1.5 flex items-center justify-between">
                  <span class="text-[11px] font-medium uppercase tracking-wider text-muted">Variant {{ i + 1 }}</span>
                  <button
                    class="rounded p-0.5 text-faint transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="variantForm.length <= 2"
                    title="Remove variant"
                    @click="removeVariant(i)"
                  >
                    <Trash2 :size="13" />
                  </button>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <Field label="Name" required><Input v-model="v.name" placeholder="A" /></Field>
                  <Field label="Weight" required><Input v-model="v.weight" type="number" placeholder="50" /></Field>
                </div>
              </div>
              <Button variant="secondary" size="sm" class="mb-3" @click="addVariant">
                <template #icon><Plus :size="13" /></template>Add variant
              </Button>
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

          <!-- Add optional container slots the model supports: parallel/race branches,
               router default, try_catch finally (routes/variants have their own editors). -->
          <div v-if="canAddBranch || canAddDefault || canAddFinally" class="mb-3 flex flex-wrap gap-2">
            <Button v-if="canAddBranch" variant="secondary" size="sm" @click="emit('add-container', 'branch')">
              <template #icon><Plus :size="13" /></template>Add branch
            </Button>
            <Button v-if="canAddDefault" variant="secondary" size="sm" @click="emit('add-container', 'default')">
              <template #icon><Plus :size="13" /></template>Add default branch
            </Button>
            <Button v-if="canAddFinally" variant="secondary" size="sm" @click="emit('add-container', 'finally')">
              <template #icon><Plus :size="13" /></template>Add finally block
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
