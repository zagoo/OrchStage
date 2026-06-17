<script setup lang="ts">
/**
 * Usage — LLM token consumption and cost estimate view.
 * Wires: GET /api/v1/usage
 * DESIGN_REFERENCE §Usage (observability.md §GET /usage)
 */
import { ref, computed, watch, onMounted } from 'vue'
import { ChartBar, RefreshCw } from 'lucide-vue-next'
import { useAsync } from '@/composables/useAsync'
import { getUsage } from '@/api/usage'
import { formatNumber } from '@/lib/format'
import type { UsageAggregate } from '@/api/types/observability'
import type { Column } from '@/components/ui/DataTable.vue'
import type { SelectOption } from '@/components/ui/Select.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import IconButton from '@/components/ui/IconButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import UsageBar from '@/components/observability/UsageBar.vue'

// --- time-range controls ---
const rangeOptions: SelectOption[] = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]
const rangeDays = ref('30')

// --- group-by ---
type GroupBy = 'model' | 'kind'
const groupBy = ref<GroupBy>('model')
const groupByOptions: SelectOption[] = [
  { value: 'model', label: 'Group by model' },
  { value: 'kind', label: 'Group by kind' },
]

function buildQuery() {
  const end = new Date()
  const start = new Date(end.getTime() - Number(rangeDays.value) * 86_400_000)
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

// --- data fetch ---
const usageAsync = useAsync((signal) => getUsage(buildQuery(), signal))
const { data, loading, error, errorText } = usageAsync

// re-fetch when range changes
watch(rangeDays, () => { void usageAsync.run() })

onMounted(() => { void usageAsync.run() })

function refresh() { void usageAsync.run() }

// --- derived rows ---
const rows = computed<UsageAggregate[]>(() => data.value?.usage ?? [])

const maxInputTokens = computed(() =>
  rows.value.reduce((m, r) => Math.max(m, r.input_tokens), 0),
)
const maxOutputTokens = computed(() =>
  rows.value.reduce((m, r) => Math.max(m, r.output_tokens), 0),
)

const tableColumns: Column[] = [
  { key: 'kind', header: 'Kind', width: '110px' },
  { key: 'model', header: 'Model', mono: true },
  { key: 'events', header: 'Events', width: '100px', align: 'right' },
  { key: 'input_tokens', header: 'Input tokens', width: '130px', align: 'right' },
  { key: 'output_tokens', header: 'Output tokens', width: '130px', align: 'right' },
  { key: 'cost_usd', header: 'Est. cost', width: '110px', align: 'right' },
]

function rowKey(r: UsageAggregate): string {
  return `${r.kind}::${r.model}`
}

function formatCost(v: number | null): string {
  if (v === null) return '—'
  return `$${v.toFixed(4)}`
}

const totalCost = computed(() =>
  data.value ? `$${data.value.total_cost_usd.toFixed(4)}` : '—',
)

// bars are grouped by whatever groupBy is
const barGroups = computed(() => {
  if (!rows.value.length) return []
  const map = new Map<string, number>()
  for (const r of rows.value) {
    const key = groupBy.value === 'model' ? (r.model || '(unknown)') : r.kind
    map.set(key, (map.get(key) ?? 0) + r.input_tokens)
  }
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1])
  const max = entries[0]?.[1] ?? 0
  return entries.map(([label, value]) => ({ label, value, max }))
})
</script>

<template>
  <div>
    <PageHeader
      title="Usage"
      description="LLM token consumption and estimated cost by model and event kind. Costs are list-price estimates — no caching or tier discounts applied."
      :icon="ChartBar"
    >
      <template #actions>
        <Select v-model="groupBy" :options="groupByOptions" class="w-44" aria-label="Group by" />
        <Select v-model="rangeDays" :options="rangeOptions" class="w-36" aria-label="Time range" />
        <IconButton label="Refresh usage" @click="refresh">
          <RefreshCw :size="16" :class="loading && 'animate-spin'" />
        </IconButton>
      </template>
    </PageHeader>

    <!-- error -->
    <div
      v-if="error"
      class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
    >
      {{ errorText }}
      <button class="ml-2 underline" @click="refresh">Retry</button>
    </div>

    <!-- cost estimate banner -->
    <div
      v-if="data && data.cost_is_estimate"
      class="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-[12.5px] text-warning"
    >
      Costs shown are list-price estimates only. Actual billed amounts may differ.
    </div>

    <!-- totals row -->
    <div class="mb-5 grid gap-3 sm:grid-cols-3">
      <div class="rounded-lg border border-border bg-surface p-4">
        <div class="text-[11.5px] font-semibold uppercase tracking-wide text-subtle">Total input tokens</div>
        <div class="mt-1 text-[22px] font-semibold text-text">
          {{ formatNumber(rows.reduce((s, r) => s + r.input_tokens, 0)) }}
        </div>
      </div>
      <div class="rounded-lg border border-border bg-surface p-4">
        <div class="text-[11.5px] font-semibold uppercase tracking-wide text-subtle">Total output tokens</div>
        <div class="mt-1 text-[22px] font-semibold text-text">
          {{ formatNumber(rows.reduce((s, r) => s + r.output_tokens, 0)) }}
        </div>
      </div>
      <div class="rounded-lg border border-border bg-surface p-4">
        <div class="text-[11.5px] font-semibold uppercase tracking-wide text-subtle">Estimated cost (USD)</div>
        <div class="mt-1 text-[22px] font-semibold text-text">{{ totalCost }}</div>
      </div>
    </div>

    <div class="grid gap-5 lg:grid-cols-2">
      <!-- aggregate table -->
      <Panel title="Aggregates" :subtitle="`Grouped by (kind, model) — ${rows.length} row${rows.length === 1 ? '' : 's'}`">
        <DataTable
          :columns="tableColumns"
          :rows="rows"
          :row-key="rowKey"
          :loading="loading"
          empty-title="No usage data"
          empty-description="No LLM calls recorded for the selected window."
        >
          <template #cell-kind="{ row }">
            <Badge :tone="row.kind === 'agent' ? 'purple' : 'info'">{{ row.kind }}</Badge>
          </template>
          <template #cell-model="{ row }">
            <span class="mono text-[12px]">{{ row.model || '(unknown)' }}</span>
          </template>
          <template #cell-events="{ row }">
            <span class="mono">{{ formatNumber(row.events) }}</span>
          </template>
          <template #cell-input_tokens="{ row }">
            <span class="mono">{{ formatNumber(row.input_tokens) }}</span>
          </template>
          <template #cell-output_tokens="{ row }">
            <span class="mono">{{ formatNumber(row.output_tokens) }}</span>
          </template>
          <template #cell-cost_usd="{ row }">
            <span :class="row.cost_usd === null ? 'text-subtle' : 'mono'">
              {{ formatCost(row.cost_usd) }}
            </span>
          </template>
        </DataTable>
      </Panel>

      <!-- bar visualisation -->
      <Panel :title="`Input tokens — by ${groupBy}`" subtitle="Proportional to total input token count">
        <div v-if="loading" class="flex flex-col gap-3">
          <div v-for="n in 5" :key="n" class="animate-pulse flex items-center gap-3">
            <div class="h-3 w-28 rounded bg-surface-2" />
            <div class="h-2 flex-1 rounded-full bg-surface-2" />
            <div class="h-3 w-16 rounded bg-surface-2" />
          </div>
        </div>
        <EmptyState
          v-else-if="barGroups.length === 0"
          title="No data"
          description="No usage recorded for this window."
          compact
        />
        <div v-else class="flex flex-col gap-3">
          <UsageBar
            v-for="g in barGroups"
            :key="g.label"
            :label="g.label"
            :value="g.value"
            :max="maxInputTokens"
            :tone="groupBy === 'kind' ? 'purple' : 'accent'"
          />
        </div>

        <!-- output-token bars -->
        <p class="mt-5 mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-subtle">
          Output tokens — by {{ groupBy }}
        </p>
        <div v-if="loading" class="flex flex-col gap-3">
          <div v-for="n in 5" :key="n" class="animate-pulse flex items-center gap-3">
            <div class="h-3 w-28 rounded bg-surface-2" />
            <div class="h-2 flex-1 rounded-full bg-surface-2" />
            <div class="h-3 w-16 rounded bg-surface-2" />
          </div>
        </div>
        <div v-else-if="barGroups.length" class="flex flex-col gap-3">
          <UsageBar
            v-for="r in rows.slice().sort((a, b) => b.output_tokens - a.output_tokens)"
            :key="`out-${r.kind}-${r.model}`"
            :label="groupBy === 'model' ? (r.model || '(unknown)') : r.kind"
            :value="r.output_tokens"
            :max="maxOutputTokens"
            tone="teal"
          />
        </div>
      </Panel>
    </div>
  </div>
</template>
