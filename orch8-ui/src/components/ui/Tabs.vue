<script setup lang="ts">
import type { Component } from 'vue'
import { cn } from '@/lib/cn'

export interface TabItem {
  key: string
  label: string
  icon?: Component
  count?: number | null
}

defineProps<{ tabs: TabItem[] }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="flex items-center gap-0.5 border-b border-border" role="tablist">
    <button
      v-for="t in tabs"
      :key="t.key"
      role="tab"
      :aria-selected="model === t.key"
      :class="cn(
        'relative inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors',
        model === t.key ? 'border-accent text-text' : 'border-transparent text-subtle hover:text-text',
      )"
      @click="model = t.key"
    >
      <component :is="t.icon" v-if="t.icon" :size="15" />
      {{ t.label }}
      <span
        v-if="t.count != null"
        class="ml-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] tabular-nums text-muted"
      >{{ t.count }}</span>
    </button>
  </div>
</template>
