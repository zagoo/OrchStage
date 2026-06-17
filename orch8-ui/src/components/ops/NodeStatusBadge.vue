<script setup lang="ts">
/**
 * Cluster node status badge.
 * Maps NodeStatus → Badge tone per CONVENTIONS.md status→tone table.
 *
 * active   → success
 * draining → warning
 * stopped  → neutral
 */
import type { NodeStatus } from '@/api/types/ops'
import type { DotTone } from '@/components/ui/StatusDot.vue'
import Badge from '@/components/ui/Badge.vue'
import type { BadgeTone } from '@/components/ui/Badge.vue'
import StatusDot from '@/components/ui/StatusDot.vue'

const props = defineProps<{ status: NodeStatus }>()

const toneMap: Record<NodeStatus, DotTone & BadgeTone> = {
  active: 'success',
  draining: 'warning',
  stopped: 'neutral',
}

const labelMap: Record<NodeStatus, string> = {
  active: 'Active',
  draining: 'Draining',
  stopped: 'Stopped',
}

const dotPulse: Record<NodeStatus, boolean> = {
  active: true,
  draining: true,
  stopped: false,
}
</script>

<template>
  <Badge :tone="toneMap[props.status]">
    <StatusDot :tone="toneMap[props.status]" :pulse="dotPulse[props.status]" />
    {{ labelMap[props.status] }}
  </Badge>
</template>
