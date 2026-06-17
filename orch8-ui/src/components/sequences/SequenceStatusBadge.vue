<script setup lang="ts">
/**
 * Consistent status badge for sequence lifecycle states.
 * draft→warning, staging→info, production→success, unpublished→neutral
 */
import type { SequenceStatus } from '@/api/types/sequences'
import type { BadgeTone } from '@/components/ui/Badge.vue'
import Badge from '@/components/ui/Badge.vue'

const props = defineProps<{ status: SequenceStatus; size?: 'sm' | 'md' }>()

const tone: Record<SequenceStatus, BadgeTone> = {
  draft: 'warning',
  staging: 'info',
  production: 'success',
  unpublished: 'neutral',
}

const label: Record<SequenceStatus, string> = {
  draft: 'Draft',
  staging: 'Staging',
  production: 'Production',
  unpublished: 'Unpublished',
}
</script>

<template>
  <Badge :tone="tone[props.status]" :size="props.size ?? 'sm'">
    {{ label[props.status] }}
  </Badge>
</template>
