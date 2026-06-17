<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'
import type { Component } from 'vue'

withDefaults(defineProps<{ icon?: Component; title?: string; description?: string; compact?: boolean }>(), {
  title: 'Nothing here yet',
})
</script>

<template>
  <div :class="['flex flex-col items-center justify-center text-center', compact ? 'py-8' : 'py-16']">
    <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-faint">
      <component :is="icon ?? Inbox" :size="22" />
    </div>
    <p class="text-sm font-medium text-text">{{ title }}</p>
    <p v-if="description" class="mt-1 max-w-sm text-[13px] leading-relaxed text-subtle">{{ description }}</p>
    <div v-if="$slots.action" class="mt-4">
      <slot name="action" />
    </div>
  </div>
</template>
