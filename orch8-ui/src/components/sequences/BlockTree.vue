<script setup lang="ts">
/**
 * Recursive block-tree renderer for SequenceDetailView.
 * Shows type icon, id, handler (for steps), and nested children/branches.
 * DESIGN_REFERENCE §3 Block Type Taxonomy (dag-sequences.md)
 */
import { computed, type Component } from 'vue'
import {
  Zap, GitBranch, Timer, RefreshCw, List, Route, ShieldAlert, Link,
  SplitSquareHorizontal, Shield, ChevronRight, ChevronDown, Hash,
  Eye,
} from 'lucide-vue-next'
import type { BlockDefinition, BlockType } from '@/api/types/sequences'
import { ref } from 'vue'

const props = defineProps<{
  blocks: BlockDefinition[]
  depth?: number
}>()

const depth = computed(() => props.depth ?? 0)

// --- icon mapping per block type ---
const typeIcon: Record<BlockType, Component> = {
  step: Zap,
  parallel: GitBranch,
  race: Timer,
  loop: RefreshCw,
  for_each: List,
  router: Route,
  try_catch: ShieldAlert,
  sub_sequence: Link,
  a_b_split: SplitSquareHorizontal,
  cancellation_scope: Shield,
}

const typeName: Record<BlockType, string> = {
  step: 'Step',
  parallel: 'Parallel',
  race: 'Race',
  loop: 'Loop',
  for_each: 'ForEach',
  router: 'Router',
  try_catch: 'TryCatch',
  sub_sequence: 'SubSequence',
  a_b_split: 'A/B Split',
  cancellation_scope: 'CancellationScope',
}

const typeColor: Record<BlockType, string> = {
  step: 'text-accent',
  parallel: 'text-purple',
  race: 'text-cyan',
  loop: 'text-teal',
  for_each: 'text-info',
  router: 'text-warning',
  try_catch: 'text-danger',
  sub_sequence: 'text-pink',
  a_b_split: 'text-success',
  cancellation_scope: 'text-muted',
}

// Collapsed state per block id
const collapsed = ref<Set<string>>(new Set())

function toggleCollapse(id: string) {
  if (collapsed.value.has(id)) collapsed.value.delete(id)
  else collapsed.value.add(id)
}

function isCollapsed(id: string) {
  return collapsed.value.has(id)
}

function hasChildren(block: BlockDefinition): boolean {
  switch (block.type) {
    case 'parallel':
    case 'race':
      return block.branches.some((b) => b.length > 0)
    case 'loop':
    case 'for_each':
      return block.body.length > 0
    case 'router':
      return block.routes.length > 0 || (block.default != null && block.default.length > 0)
    case 'try_catch':
      return block.try_block.length > 0
    case 'a_b_split':
      return block.variants.length > 0
    case 'cancellation_scope':
      return block.blocks.length > 0
    default:
      return false
  }
}

function getHandler(block: BlockDefinition): string | null {
  if (block.type === 'step') return block.handler
  if (block.type === 'sub_sequence') return block.sequence_name
  return null
}
</script>

<template>
  <ul class="space-y-0.5" :class="depth > 0 ? 'pl-4 border-l border-border ml-2' : ''">
    <li v-for="block in blocks" :key="block.id" class="py-0.5">
      <!-- Block row -->
      <div
        class="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-hover transition-colors group"
        :class="hasChildren(block) ? 'cursor-pointer' : ''"
        @click="hasChildren(block) && toggleCollapse(block.id)"
      >
        <!-- collapse toggle -->
        <component
          :is="hasChildren(block) ? (isCollapsed(block.id) ? ChevronRight : ChevronDown) : Eye"
          :size="12"
          class="shrink-0 text-faint"
          :class="!hasChildren(block) && 'opacity-0'"
          :aria-hidden="!hasChildren(block)"
        />

        <!-- type icon -->
        <component
          :is="typeIcon[block.type]"
          :size="14"
          class="shrink-0"
          :class="typeColor[block.type]"
        />

        <!-- type label -->
        <span class="shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-subtle">
          {{ typeName[block.type] }}
        </span>

        <!-- block id -->
        <span class="mono text-[12px] text-text flex items-center gap-1">
          <Hash :size="10" class="text-faint" />{{ block.id }}
        </span>

        <!-- handler / sequence_name for leaf types -->
        <span v-if="getHandler(block)" class="ml-auto mono text-[11.5px] text-muted truncate max-w-[200px]">
          {{ getHandler(block) }}
        </span>

        <!-- step extras -->
        <span
          v-if="block.type === 'step' && block.retry"
          class="ml-1 rounded bg-info-soft px-1.5 text-[10.5px] text-info"
          title="Retry policy configured"
        >retry</span>
        <span
          v-if="block.type === 'step' && block.wait_for_input"
          class="ml-1 rounded bg-warning-soft px-1.5 text-[10.5px] text-warning"
          title="Human input required"
        >human</span>

        <!-- deprecated badge for sub_sequence version -->
        <span
          v-if="block.type === 'sub_sequence' && block.version != null"
          class="mono ml-1 text-[10.5px] text-muted"
        >v{{ block.version }}</span>
      </div>

      <!-- Children -->
      <template v-if="!isCollapsed(block.id)">
        <!-- Parallel / Race branches -->
        <template v-if="block.type === 'parallel' || block.type === 'race'">
          <div
            v-for="(branch, bi) in block.branches"
            :key="bi"
            class="mt-0.5"
          >
            <div class="pl-6 mb-0.5">
              <span class="text-[10.5px] uppercase tracking-wider text-faint">
                Branch {{ bi + 1 }}
              </span>
            </div>
            <BlockTree :blocks="branch" :depth="depth + 1" />
          </div>
        </template>

        <!-- Loop / ForEach body -->
        <template v-else-if="block.type === 'loop' || block.type === 'for_each'">
          <div class="pl-6 mb-0.5">
            <span class="text-[10.5px] uppercase tracking-wider text-faint">Body</span>
          </div>
          <BlockTree :blocks="block.body" :depth="depth + 1" />
        </template>

        <!-- Router routes + default -->
        <template v-else-if="block.type === 'router'">
          <div
            v-for="(route, ri) in block.routes"
            :key="ri"
            class="mt-0.5"
          >
            <div class="pl-6 mb-0.5 flex items-center gap-2">
              <span class="text-[10.5px] uppercase tracking-wider text-faint">Route {{ ri + 1 }}:</span>
              <span class="mono text-[10.5px] text-muted truncate">{{ route.condition }}</span>
            </div>
            <BlockTree :blocks="route.blocks" :depth="depth + 1" />
          </div>
          <template v-if="block.default && block.default.length">
            <div class="pl-6 mb-0.5">
              <span class="text-[10.5px] uppercase tracking-wider text-faint">Default</span>
            </div>
            <BlockTree :blocks="block.default" :depth="depth + 1" />
          </template>
        </template>

        <!-- TryCatch -->
        <template v-else-if="block.type === 'try_catch'">
          <div class="pl-6 mb-0.5"><span class="text-[10.5px] uppercase tracking-wider text-faint">Try</span></div>
          <BlockTree :blocks="block.try_block" :depth="depth + 1" />
          <template v-if="block.catch_block.length">
            <div class="pl-6 mb-0.5 mt-0.5"><span class="text-[10.5px] uppercase tracking-wider text-danger/70">Catch</span></div>
            <BlockTree :blocks="block.catch_block" :depth="depth + 1" />
          </template>
          <template v-if="block.finally_block?.length">
            <div class="pl-6 mb-0.5 mt-0.5"><span class="text-[10.5px] uppercase tracking-wider text-muted">Finally</span></div>
            <BlockTree :blocks="block.finally_block" :depth="depth + 1" />
          </template>
        </template>

        <!-- A/B Split variants -->
        <template v-else-if="block.type === 'a_b_split'">
          <div
            v-for="variant in block.variants"
            :key="variant.name"
            class="mt-0.5"
          >
            <div class="pl-6 mb-0.5 flex items-center gap-2">
              <span class="text-[10.5px] uppercase tracking-wider text-faint">{{ variant.name }}</span>
              <span class="text-[10.5px] text-muted">weight {{ variant.weight }}</span>
            </div>
            <BlockTree :blocks="variant.blocks" :depth="depth + 1" />
          </div>
        </template>

        <!-- CancellationScope -->
        <template v-else-if="block.type === 'cancellation_scope'">
          <BlockTree :blocks="block.blocks" :depth="depth + 1" />
        </template>
      </template>
    </li>
  </ul>
</template>
