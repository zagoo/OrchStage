<script setup lang="ts">
import { cn } from '@/lib/cn'

withDefaults(defineProps<{ size?: number; class?: string }>(), { size: 16 })
</script>

<template>
  <span
    :class="cn('inline-block animate-spin rounded-full border-2 border-current border-r-transparent align-[-0.125em]', $props.class)"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="status"
    aria-label="Loading"
  />
</template>
