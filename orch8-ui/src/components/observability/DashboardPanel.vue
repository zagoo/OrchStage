<script setup lang="ts">
/**
 * Renders one dashboard query result from the telemetry dashboard endpoint.
 * Displays a list of dimension/count rows with percentage bars.
 * DESIGN_REFERENCE §Telemetry (observability.md §GET /telemetry/mobile/dashboard)
 */
import type { DashboardRow } from '@/api/types/observability'

defineProps<{
  rows: DashboardRow[]
  loading?: boolean
}>()

function barWidth(percentage: number): string {
  return `${Math.min(100, Math.max(0, percentage)).toFixed(1)}%`
}
</script>

<template>
  <div>
    <template v-if="loading">
      <div v-for="n in 5" :key="n" class="mb-3 flex items-center gap-3 animate-pulse">
        <div class="h-3 w-28 rounded bg-surface-2" />
        <div class="h-2 flex-1 rounded-full bg-surface-2" />
        <div class="h-3 w-12 rounded bg-surface-2" />
      </div>
    </template>
    <template v-else-if="rows.length === 0">
      <p class="text-center text-[13px] text-subtle py-6">No data for this query in the selected window.</p>
    </template>
    <template v-else>
      <div
        v-for="row in rows"
        :key="row.dimension"
        class="mb-2.5 flex items-center gap-3"
      >
        <span
          class="w-32 shrink-0 truncate text-right text-[12px] text-muted"
          :title="row.dimension"
        >
          {{ row.dimension || '(blank)' }}
        </span>
        <div class="relative flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
          <div
            class="absolute inset-y-0 left-0 rounded-full bg-accent transition-all duration-500"
            :style="{ width: barWidth(row.percentage) }"
            role="progressbar"
            :aria-valuenow="row.percentage"
            aria-valuemin="0"
            aria-valuemax="100"
          />
        </div>
        <span class="w-24 shrink-0 text-right mono text-[12px] text-text">
          {{ row.count.toLocaleString() }}
          <span class="text-subtle">({{ row.percentage.toFixed(1) }}%)</span>
        </span>
      </div>
    </template>
  </div>
</template>
