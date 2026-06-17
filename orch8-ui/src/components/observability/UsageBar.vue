<script setup lang="ts">
/**
 * Simple CSS bar visualization for a usage aggregate row.
 * No chart library — pure CSS width based on proportion.
 * DESIGN_REFERENCE §Usage (observability.md §GET /usage)
 */
defineProps<{
  label: string
  value: number
  max: number
  tone?: 'accent' | 'info' | 'success' | 'purple' | 'teal' | 'cyan'
}>()

function pct(value: number, max: number): number {
  if (max === 0) return 0
  return Math.min(100, (value / max) * 100)
}
</script>

<template>
  <div class="flex items-center gap-3">
    <span class="w-28 shrink-0 truncate text-right text-[12px] text-subtle" :title="label">
      {{ label || '(unknown)' }}
    </span>
    <div class="relative flex-1 rounded-full bg-surface-2 h-2 overflow-hidden">
      <div
        :class="[
          'absolute inset-y-0 left-0 rounded-full transition-all duration-500',
          tone === 'info' ? 'bg-info' :
          tone === 'success' ? 'bg-success' :
          tone === 'purple' ? 'bg-purple' :
          tone === 'teal' ? 'bg-teal' :
          tone === 'cyan' ? 'bg-cyan' :
          'bg-accent',
        ]"
        :style="{ width: `${pct(value, max)}%` }"
        :aria-valuenow="value"
        :aria-valuemax="max"
        aria-valuemin="0"
        role="progressbar"
      />
    </div>
    <span class="w-20 shrink-0 text-right mono text-[12px] text-text">
      {{ value.toLocaleString() }}
    </span>
  </div>
</template>
