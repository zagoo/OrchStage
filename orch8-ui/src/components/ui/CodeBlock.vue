<script setup lang="ts">
import { computed } from 'vue'
import { prettyJson } from '@/lib/format'
import CopyButton from './CopyButton.vue'

const props = withDefaults(
  defineProps<{ content?: unknown; language?: string; maxHeight?: string; copyable?: boolean }>(),
  { maxHeight: '420px', copyable: true },
)

const text = computed(() =>
  typeof props.content === 'string' ? props.content : prettyJson(props.content ?? null),
)
</script>

<template>
  <div class="group relative overflow-hidden rounded-lg border border-border bg-bg">
    <div v-if="language || copyable" class="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5">
      <span class="mono text-[11px] uppercase tracking-wide text-subtle">{{ language ?? 'json' }}</span>
      <CopyButton v-if="copyable" :value="text" />
    </div>
    <pre
      class="mono overflow-auto p-3 text-[12px] leading-relaxed text-text"
      :style="{ maxHeight }"
    ><code>{{ text }}</code></pre>
  </div>
</template>
