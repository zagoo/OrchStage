<script setup lang="ts">
import type { Component } from 'vue'
import { cn } from '@/lib/cn'

export interface Segment {
  value: string
  label: string
  icon?: Component
}

defineProps<{ segments: Segment[] }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5">
    <button
      v-for="seg in segments"
      :key="seg.value"
      type="button"
      :class="cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors',
        model === seg.value ? 'bg-elevated text-text shadow-[var(--shadow-1)]' : 'text-subtle hover:text-text',
      )"
      :aria-pressed="model === seg.value"
      @click="model = seg.value"
    >
      <component :is="seg.icon" v-if="seg.icon" :size="14" />
      {{ seg.label }}
    </button>
  </div>
</template>
