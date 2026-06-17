<script setup lang="ts">
/**
 * Renders a live/stale badge + status dot for a WorkerInfo.alive flag.
 */
import StatusDot from '@/components/ui/StatusDot.vue'
import Badge from '@/components/ui/Badge.vue'

defineProps<{ alive: boolean }>()
</script>

<template>
  <span class="flex items-center gap-1.5">
    <StatusDot :tone="alive ? 'success' : 'neutral'" :pulse="alive" />
    <Badge :tone="alive ? 'success' : 'neutral'">
      {{ alive ? 'Alive' : 'Stale' }}
    </Badge>
  </span>
</template>
