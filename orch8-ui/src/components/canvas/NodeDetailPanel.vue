<script setup lang="ts">
/**
 * Drawer panel shown when a node is clicked in the canvas.
 * Displays block type, full config/params, inputs/outputs (from ExecutionNode),
 * and live state when an instance is overlaid.
 *
 * DESIGN_REFERENCE §dag-sequences.md §3, §7 Execution State
 */
import { computed, ref } from 'vue'
import { Info, Settings, Activity } from 'lucide-vue-next'
import type { StepBlock } from '@/api/types/sequences'
import type { CanvasNodeData } from '@/api/types/canvas'
import { BLOCK_VISUAL, stepIcon, stepColorClass } from './blockConfig'
import { titleCase, formatDateTime } from '@/lib/format'
import { prettyJson } from '@/lib/format'
import Drawer from '@/components/ui/Drawer.vue'
import Badge from '@/components/ui/Badge.vue'
import CodeBlock from '@/components/ui/CodeBlock.vue'
import KeyValue from '@/components/ui/KeyValue.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import Tabs from '@/components/ui/Tabs.vue'

const props = defineProps<{
  open: boolean
  nodeData: CanvasNodeData | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const activeTab = ref('config')

const block = computed(() => props.nodeData?.block ?? null)
const execNode = computed(() => props.nodeData?.execNode ?? null)
const nodeState = computed(() => props.nodeData?.nodeState ?? null)

const visual = computed(() => {
  if (!block.value) return null
  if (block.value.type === 'step') {
    const step = block.value as StepBlock
    return {
      icon: stepIcon(step.handler),
      colorClass: stepColorClass(step.handler),
      label: titleCase(step.handler),
    }
  }
  return BLOCK_VISUAL[block.value.type]
})

const blockParams = computed(() => {
  if (!block.value) return null
  if (block.value.type === 'step') {
    return (block.value as StepBlock).params ?? null
  }
  return null
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
    :icon="Info"
    width="420px"
  >
    <template v-if="block && visual">
      <!-- Header: block type badge -->
      <div class="mb-4 flex items-center gap-2">
        <span :class="['flex h-8 w-8 items-center justify-center rounded-lg', visual.colorClass]">
          <component :is="visual.icon" :size="16" />
        </span>
        <div>
          <p class="text-[13px] font-semibold text-text">{{ visual.label }}</p>
          <p class="mono text-[11px] text-muted">{{ block.type }}</p>
        </div>
        <div class="ml-auto">
          <StatusDot
            v-if="nodeState"
            :tone="stateTone"
            :pulse="nodeState === 'running'"
          />
        </div>
      </div>

      <!-- Tabs: Config / Live State -->
      <Tabs :tabs="tabs" v-model="activeTab">
        <template #config>
          <!-- Block ID -->
          <KeyValue label="Block ID" :value="block.id" mono class="mb-3" />

          <!-- Step-specific fields -->
          <template v-if="block.type === 'step'">
            <KeyValue label="Handler" :value="(block as StepBlock).handler" mono class="mb-3" />
            <KeyValue
              v-if="(block as StepBlock).queue_name"
              label="Queue"
              :value="(block as StepBlock).queue_name"
              class="mb-3"
            />
            <KeyValue
              v-if="(block as StepBlock).timeout"
              label="Timeout"
              :value="`${(block as StepBlock).timeout}ms`"
              class="mb-3"
            />
            <div v-if="blockParams !== null" class="mb-3">
              <p class="mb-1 text-[11px] font-medium text-muted uppercase tracking-wider">Params</p>
              <CodeBlock :code="prettyJson(blockParams)" language="json" />
            </div>
          </template>

          <!-- SubSequence -->
          <template v-if="block.type === 'sub_sequence'">
            <KeyValue
              label="Sequence"
              :value="(block as Extract<typeof block, { type: 'sub_sequence' }>).sequence_name"
              class="mb-3"
            />
          </template>

          <!-- Full block JSON -->
          <div>
            <p class="mb-1 text-[11px] font-medium text-muted uppercase tracking-wider">Full Definition</p>
            <CodeBlock :code="prettyJson(block)" language="json" />
          </div>
        </template>

        <template #live>
          <div v-if="nodeState && execNode">
            <div class="mb-3 flex items-center gap-2">
              <Badge :tone="stateTone">{{ titleCase(nodeState) }}</Badge>
              <span class="text-[12px] text-muted">
                node {{ execNode.id.slice(0, 8) }}…
              </span>
            </div>
            <KeyValue
              v-if="execNode.started_at"
              label="Started"
              :value="formatDateTime(execNode.started_at)"
              class="mb-2"
            />
            <KeyValue
              v-if="execNode.completed_at"
              label="Completed"
              :value="formatDateTime(execNode.completed_at)"
              class="mb-2"
            />
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
        </template>
      </Tabs>
    </template>

    <div v-else class="py-8 text-center text-[13px] text-muted">
      Select a node in the canvas to view details.
    </div>
  </Drawer>
</template>
