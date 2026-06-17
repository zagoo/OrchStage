<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/cn'

export type DotTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' | 'running'

const props = withDefaults(
  defineProps<{ tone?: DotTone; pulse?: boolean; label?: string; size?: number }>(),
  { tone: 'neutral', pulse: false, size: 8 },
)

const color: Record<DotTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-faint',
  accent: 'bg-accent',
  running: 'bg-info',
}
const dotCls = computed(() => cn('inline-block shrink-0 rounded-full', color[props.tone]))
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <span class="relative inline-flex" :style="{ width: `${size}px`, height: `${size}px` }">
      <span
        v-if="pulse"
        :class="cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', color[tone])"
      />
      <span :class="dotCls" :style="{ width: `${size}px`, height: `${size}px` }" />
    </span>
    <span v-if="label" class="text-[13px] text-muted">{{ label }}</span>
  </span>
</template>
