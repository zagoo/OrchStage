<script setup lang="ts">
/**
 * Circuit breaker state badge.
 * Maps BreakerState → Badge tone per CONVENTIONS.md status→tone table.
 *
 * closed    → success
 * half_open → warning
 * open      → danger
 */
import type { BreakerState } from '@/api/types/ops'
import type { DotTone } from '@/components/ui/StatusDot.vue'
import Badge from '@/components/ui/Badge.vue'
import type { BadgeTone } from '@/components/ui/Badge.vue'
import StatusDot from '@/components/ui/StatusDot.vue'

const props = defineProps<{ state: BreakerState }>()

const toneMap: Record<BreakerState, DotTone & BadgeTone> = {
  closed: 'success',
  half_open: 'warning',
  open: 'danger',
}

const labelMap: Record<BreakerState, string> = {
  closed: 'Closed',
  half_open: 'Half-Open',
  open: 'Open',
}

const dotPulse: Record<BreakerState, boolean> = {
  closed: false,
  half_open: true,
  open: false,
}
</script>

<template>
  <Badge :tone="toneMap[props.state]">
    <StatusDot :tone="toneMap[props.state]" :pulse="dotPulse[props.state]" />
    {{ labelMap[props.state] }}
  </Badge>
</template>
