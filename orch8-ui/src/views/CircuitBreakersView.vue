<script setup lang="ts">
/**
 * Circuit Breakers operator console.
 *
 * Features:
 *  - Live list of circuit breakers with state Badge + failure counts
 *  - Reset action (confirm) per breaker
 *  - 5-second polling for live state
 *
 * DESIGN_REFERENCE §Circuit Breakers — ops-resilience.md §1
 */
import { onMounted } from 'vue'
import { ShieldAlert, RefreshCw, RotateCcw } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { listCircuitBreakers, resetBreaker } from '@/api/circuitBreakers'
import { errorMessage } from '@/api/errors'
import { formatDateTime, formatRelative } from '@/lib/format'
import type { CircuitBreakerState } from '@/api/types/ops'
import type { Column } from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import BreakerStateBadge from '@/components/ops/BreakerStateBadge.vue'

const ui = useUiStore()

const list = useAsync((signal) => listCircuitBreakers(signal))
const { data: breakers, loading, error, errorText } = list

const polling = usePolling(list.run, { intervalMs: 5000, immediate: false })

onMounted(() => {
  void list.run()
  polling.start()
})

const columns: Column[] = [
  { key: 'handler', header: 'Handler', mono: true },
  { key: 'state', header: 'State', width: '130px' },
  { key: 'failure_count', header: 'Failures', width: '110px', align: 'right' },
  { key: 'failure_threshold', header: 'Threshold', width: '100px', align: 'right' },
  { key: 'cooldown_secs', header: 'Cooldown', width: '110px', align: 'right' },
  { key: 'opened_at', header: 'Opened', width: '150px' },
  { key: '_actions', header: '', width: '60px', align: 'right' },
]

async function handleReset(breaker: CircuitBreakerState) {
  const ok = await ui.confirm({
    title: `Reset breaker "${breaker.handler}"?`,
    message: `This will force the breaker back to Closed and clear the failure count (currently ${breaker.failure_count}). Dispatch will resume immediately.`,
    tone: 'danger',
    confirmText: 'Reset breaker',
  })
  if (!ok) return
  try {
    await resetBreaker(breaker.tenant_id, breaker.handler)
    ui.success('Breaker reset', breaker.handler)
    void list.run()
  } catch (e) {
    ui.error('Reset failed', errorMessage(e))
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Circuit Breakers"
      description="Per-handler dispatch guards that open after repeated failures and recover automatically during cooldown."
      :icon="ShieldAlert"
    >
      <template #actions>
        <IconButton label="Refresh breakers" @click="list.run()">
          <RefreshCw :size="16" :class="loading && 'animate-spin'" />
        </IconButton>
      </template>
    </PageHeader>

    <div
      v-if="error"
      class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
    >
      {{ errorText }}
      <button class="ml-2 underline" @click="list.run()">Retry</button>
    </div>

    <DataTable
      :columns="columns"
      :rows="breakers ?? []"
      :row-key="(r) => `${r.tenant_id}::${r.handler}`"
      :loading="loading"
      empty-title="No circuit breakers"
      empty-description="Circuit breakers appear here when a handler trips open. All handlers are currently in the default Closed state (held in-memory)."
    >
      <template #cell-handler="{ row }">
        <span class="mono text-[12px] font-medium text-text">{{ row.handler }}</span>
      </template>

      <template #cell-state="{ row }">
        <BreakerStateBadge :state="row.state" />
      </template>

      <template #cell-failure_count="{ row }">
        <span
          :class="row.failure_count >= row.failure_threshold ? 'font-semibold text-danger' : 'text-text'"
        >
          {{ row.failure_count }}
        </span>
      </template>

      <template #cell-failure_threshold="{ row }">
        <span class="text-subtle">{{ row.failure_threshold }}</span>
      </template>

      <template #cell-cooldown_secs="{ row }">
        <span class="text-subtle">{{ row.cooldown_secs }}s</span>
      </template>

      <template #cell-opened_at="{ row }">
        <template v-if="row.opened_at">
          <Tooltip :text="formatDateTime(row.opened_at)">
            <span class="text-[12px] text-subtle">{{ formatRelative(row.opened_at) }}</span>
          </Tooltip>
        </template>
        <span v-else class="text-[12px] text-subtle">—</span>
      </template>

      <template #cell-_actions="{ row }">
        <div class="flex items-center justify-end">
          <Tooltip text="Force-reset to Closed">
            <IconButton
              label="Reset circuit breaker"
              size="sm"
              variant="danger"
              :disabled="row.state === 'closed'"
              @click.stop="handleReset(row)"
            >
              <RotateCcw :size="13" />
            </IconButton>
          </Tooltip>
        </div>
      </template>
    </DataTable>
  </div>
</template>
