<script setup lang="ts">
/**
 * Recursive execution tree renderer.
 * Each node shows block_id, block_type, state badge, and timestamps.
 * DESIGN_REFERENCE §Instances §GET /instances/{id}/tree
 */
import { computed } from 'vue'
import {
  ChevronRight, Circle, CheckCircle2, XCircle, Clock, Play,
  Hourglass, Ban, SkipForward,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { formatRelative } from '@/lib/format'
import type { ExecutionNode, NodeState } from '@/api/types/instances'
import type { BadgeTone } from '@/components/ui/Badge.vue'
import Badge from '@/components/ui/Badge.vue'
import Tooltip from '@/components/ui/Tooltip.vue'

const props = defineProps<{ nodes: ExecutionNode[]; depth?: number }>()

// Build a parent_id → children map
const childMap = computed(() => {
  const m = new Map<string | null, ExecutionNode[]>()
  for (const n of props.nodes) {
    const key = n.parent_id ?? null
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(n)
  }
  return m
})

const roots = computed(() => childMap.value.get(null) ?? [])

type NodeMeta = { tone: BadgeTone; icon: Component; label: string }
const STATE_META: Record<NodeState, NodeMeta> = {
  pending:   { tone: 'neutral', icon: Circle,       label: 'Pending'   },
  running:   { tone: 'info',    icon: Play,          label: 'Running'   },
  waiting:   { tone: 'warning', icon: Hourglass,     label: 'Waiting'   },
  completed: { tone: 'success', icon: CheckCircle2,  label: 'Completed' },
  failed:    { tone: 'danger',  icon: XCircle,       label: 'Failed'    },
  cancelled: { tone: 'neutral', icon: Ban,           label: 'Cancelled' },
  skipped:   { tone: 'neutral', icon: SkipForward,   label: 'Skipped'   },
}

function nodeMeta(state: NodeState): NodeMeta {
  return STATE_META[state] ?? { tone: 'neutral', icon: Clock, label: state }
}

function childrenOf(node: ExecutionNode): ExecutionNode[] {
  return childMap.value.get(node.id) ?? []
}
</script>

<template>
  <!-- Recursive: roots rendered by parent, children inline -->
  <ul role="tree" class="space-y-0.5">
    <li
      v-for="node in (depth == null ? roots : nodes)"
      :key="node.id"
      role="treeitem"
      class="rounded"
    >
      <div
        class="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-hover"
        :style="{ paddingLeft: `${(depth ?? 0) * 16 + 8}px` }"
      >
        <ChevronRight
          v-if="childrenOf(node).length"
          :size="12"
          class="shrink-0 text-subtle"
        />
        <span v-else class="w-3 shrink-0" />

        <component
          :is="nodeMeta(node.state).icon"
          :size="13"
          :class="`shrink-0 text-${nodeMeta(node.state).tone}`"
        />

        <Tooltip :text="node.id">
          <span class="mono truncate text-[12px] text-text">{{ node.block_id }}</span>
        </Tooltip>

        <Badge :tone="'neutral'" class="shrink-0 text-[10px]">{{ node.block_type }}</Badge>

        <Badge :tone="nodeMeta(node.state).tone" class="ml-auto shrink-0">
          {{ nodeMeta(node.state).label }}
        </Badge>

        <span v-if="node.completed_at" class="shrink-0 text-[11px] text-subtle">
          {{ formatRelative(node.completed_at) }}
        </span>
      </div>

      <!-- Recurse into children -->
      <ExecutionTreePanel
        v-if="childrenOf(node).length"
        :nodes="childrenOf(node)"
        :depth="(depth ?? 0) + 1"
      />
    </li>
  </ul>
</template>
