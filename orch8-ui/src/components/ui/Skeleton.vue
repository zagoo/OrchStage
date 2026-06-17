<script setup lang="ts">
import { cn } from '@/lib/cn'
withDefaults(defineProps<{ width?: string; height?: string; rounded?: string; class?: string }>(), {
  height: '1rem',
  rounded: '0.375rem',
})
</script>

<template>
  <span
    :class="cn('block animate-pulse bg-surface-2', $props.class)"
    :style="{ width: width ?? '100%', height, borderRadius: rounded }"
    aria-hidden="true"
  />
</template>
