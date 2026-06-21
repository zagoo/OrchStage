<script setup lang="ts">
/**
 * Custom Vue Flow node component for a single block in the DAG canvas.
 *
 * Renders:
 *  - A distinct icon + accent color per block type / handler
 *  - Block id and handler (for step) or type label
 *  - Live state coloring ring when an instance is overlaid
 *  - Selected state styling
 *
 * DESIGN_REFERENCE §dag-sequences.md §3 Block Type Taxonomy
 */
import { computed, inject, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { CanvasNodeData } from '@/api/types/canvas'
import type { StepBlock } from '@/api/types/sequences'
import { BLOCK_VISUAL, NODE_STATE_RING, NODE_TITLE_FIELD, stepIcon, stepColorClass, type NodeTitleField } from './blockConfig'
import { titleCase } from '@/lib/format'

const props = defineProps<{
  data: CanvasNodeData
  selected?: boolean
}>()

const block = computed(() => props.data.block)

const visual = computed(() => {
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

const typeLabel = computed(() => visual.value.label)
const subtitle = computed(() => {
  if (block.value.type === 'step') {
    return (block.value as StepBlock).handler
  }
  if (block.value.type === 'sub_sequence') {
    const sb = block.value as Extract<typeof block.value, { type: 'sub_sequence' }>
    return sb.sequence_name
  }
  return block.value.type
})

// Which field leads as the node's main title — toggled from the toolbar and
// provided by FlowCanvasView. Defaults to the block id when rendered standalone.
const titleField = inject(NODE_TITLE_FIELD, ref<NodeTitleField>('id'))
const mainText = computed(() => (titleField.value === 'id' ? block.value.id : subtitle.value))
const subText = computed(() => (titleField.value === 'id' ? subtitle.value : block.value.id))

const ringClass = computed(() => {
  const state = props.data.nodeState
  if (!state) return ''
  return NODE_STATE_RING[state] ?? ''
})

const selectedClass = computed(() =>
  props.selected ? 'ring-2 ring-accent shadow-lg' : '',
)
</script>

<template>
  <div
    :class="[
      'relative flex min-w-[160px] max-w-[200px] flex-col rounded-lg border border-border',
      'bg-surface text-text transition-shadow cursor-pointer select-none',
      ringClass,
      selectedClass,
    ]"
  >
    <!-- Handles for Vue Flow edge connections -->
    <Handle type="target" :position="Position.Top" class="!bg-border !border-border-strong" />

    <!-- Icon + type badge header -->
    <div :class="['flex items-center gap-2 rounded-t-lg px-2.5 py-1.5', visual.colorClass]">
      <component :is="visual.icon" :size="14" class="shrink-0" />
      <span class="truncate text-[11px] font-semibold uppercase tracking-wider">
        {{ typeLabel }}
      </span>
    </div>

    <!-- Main title: block id, or the descriptive field when toggled in the toolbar -->
    <div class="px-2.5 pt-1.5 pb-0.5">
      <span class="mono block truncate text-[11.5px] text-text font-medium" :title="mainText">
        {{ mainText }}
      </span>
    </div>

    <!-- Secondary line: the other of (id / descriptive field) -->
    <div class="px-2.5 pb-1.5">
      <span class="mono truncate text-[10.5px] text-subtle block" :title="subText">
        {{ subText }}
      </span>
    </div>

    <!-- Live state indicator -->
    <div
      v-if="data.nodeState"
      class="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold uppercase"
      :class="{
        'bg-info text-white': data.nodeState === 'running',
        'bg-success text-white': data.nodeState === 'completed',
        'bg-danger text-white': data.nodeState === 'failed',
        'bg-warning text-white': data.nodeState === 'waiting',
        'bg-muted text-white': data.nodeState === 'pending',
        'bg-neutral/50 text-white': data.nodeState === 'cancelled' || data.nodeState === 'skipped',
      }"
      :title="`State: ${data.nodeState}`"
    >
      {{ data.nodeState[0].toUpperCase() }}
    </div>

    <Handle type="source" :position="Position.Bottom" class="!bg-border !border-border-strong" />
  </div>
</template>
