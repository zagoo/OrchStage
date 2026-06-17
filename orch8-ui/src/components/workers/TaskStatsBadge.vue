<script setup lang="ts">
/**
 * Renders a Badge for a WorkerTaskState with the appropriate tone.
 */
import Badge from '@/components/ui/Badge.vue'
import type { BadgeTone } from '@/components/ui/Badge.vue'
import type { WorkerTaskState } from '@/api/types/workers'

defineProps<{ state: WorkerTaskState }>()

const stateTone: Record<WorkerTaskState, BadgeTone> = {
  pending: 'warning',
  claimed: 'info',
  completed: 'success',
  failed: 'danger',
}
</script>

<template>
  <Badge :tone="stateTone[state] ?? 'neutral'">
    {{ state }}
  </Badge>
</template>
