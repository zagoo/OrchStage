<script setup lang="ts">
import { useSlots } from 'vue'
import { cn } from '@/lib/cn'

withDefaults(defineProps<{ title?: string; subtitle?: string; noPadding?: boolean; class?: string }>(), {
  noPadding: false,
})
const slots = useSlots()
</script>

<template>
  <section :class="cn('overflow-hidden rounded-lg border border-border bg-surface', $props.class)">
    <header
      v-if="title || slots.header || slots.actions"
      class="flex items-center justify-between gap-3 border-b border-border px-4 py-3"
    >
      <div v-if="title || subtitle" class="min-w-0">
        <h3 class="truncate text-[13px] font-semibold tracking-tight text-text">{{ title }}</h3>
        <p v-if="subtitle" class="mt-0.5 truncate text-[12px] text-subtle">{{ subtitle }}</p>
      </div>
      <slot v-else name="header" />
      <div v-if="slots.actions" class="flex shrink-0 items-center gap-1.5">
        <slot name="actions" />
      </div>
    </header>
    <div :class="noPadding ? '' : 'p-4'">
      <slot />
    </div>
  </section>
</template>
