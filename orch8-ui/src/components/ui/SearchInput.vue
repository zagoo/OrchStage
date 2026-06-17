<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'
import { cn } from '@/lib/cn'

const props = withDefaults(defineProps<{ placeholder?: string; class?: string }>(), {
  placeholder: 'Search…',
})
const model = defineModel<string>({ default: '' })
</script>

<template>
  <div :class="cn('relative', props.class)">
    <Search :size="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
    <input
      v-model="model"
      type="search"
      :placeholder="placeholder"
      class="h-9 w-full rounded-md border border-border-strong bg-surface-2 pl-9 pr-8 text-[13px] text-text placeholder:text-faint transition-colors hover:border-faint focus:border-accent focus:bg-surface focus:outline-none"
    />
    <button
      v-if="model"
      type="button"
      class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-text"
      aria-label="Clear search"
      @click="model = ''"
    >
      <X :size="14" />
    </button>
  </div>
</template>
