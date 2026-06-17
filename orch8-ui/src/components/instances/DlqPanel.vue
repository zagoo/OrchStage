<script setup lang="ts">
/**
 * Dead-letter queue panel — lists failed instances with retry affordance.
 * DESIGN_REFERENCE §Instances §15 List DLQ; §9 Retry Instance
 */
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { RotateCcw, AlertTriangle, Eye, RefreshCw } from 'lucide-vue-next'
import DataTable from '@/components/ui/DataTable.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Pagination from '@/components/ui/Pagination.vue'
import StateBadge from '@/components/instances/StateBadge.vue'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useAsync } from '@/composables/useAsync'
import { listDlq, retryInstance } from '@/api/instances'
import { errorMessage } from '@/api/errors'
import { formatRelative, formatDateTime, shortId } from '@/lib/format'
import type { TaskInstance } from '@/api/types/instances'
import type { Column } from '@/components/ui/DataTable.vue'

const router = useRouter()
const ui = useUiStore()
const conn = useConnectionStore()

const PAGE_SIZE = 50
const offset = ref(0)

const loader = useAsync((signal) =>
  listDlq({ tenant_id: conn.tenantId || undefined, limit: PAGE_SIZE, offset: offset.value }, signal),
)
const { data, loading, error, errorText } = loader

onMounted(() => { void loader.run() })

function changePage(newOffset: number) {
  offset.value = newOffset
  void loader.run()
}

const columns: Column[] = [
  { key: 'id',          header: 'ID',        width: '220px', mono: true },
  { key: 'sequence_id', header: 'Sequence',  width: '220px', mono: true },
  { key: 'namespace',   header: 'Namespace', width: '120px', mono: true },
  { key: 'state',       header: 'State',     width: '120px' },
  { key: 'updated_at',  header: 'Failed',    width: '150px' },
  { key: '_actions',    header: '',          width: '80px',  align: 'right' },
]

const retrying = ref<Set<string>>(new Set())

async function handleRetry(row: TaskInstance) {
  const ok = await ui.confirm({
    title: 'Retry instance?',
    message: `This will re-schedule instance ${shortId(row.id)} from the beginning, clearing its stale execution state.`,
    confirmText: 'Retry instance',
    tone: 'danger',
  })
  if (!ok) return
  retrying.value.add(row.id)
  try {
    await retryInstance(row.id)
    ui.success('Instance retried', shortId(row.id))
    void loader.run()
  } catch (e) {
    ui.error('Retry failed', errorMessage(e))
  } finally {
    retrying.value.delete(row.id)
  }
}

function viewDetail(row: TaskInstance) {
  void router.push(`/instances/${row.id}`)
}

const pageCount = computed(() => data.value?.length ?? 0)
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <AlertTriangle :size="16" class="text-danger" />
        <span class="text-[13px] font-medium text-text">Dead-Letter Queue</span>
        <span v-if="data" class="text-[12.5px] text-subtle">{{ data.length }} failed</span>
      </div>
      <IconButton label="Refresh DLQ" @click="loader.run()">
        <RefreshCw :size="15" :class="loading && 'animate-spin'" />
      </IconButton>
    </div>

    <div
      v-if="error"
      class="rounded-lg border border-danger/30 bg-danger-soft p-3 text-[13px] text-danger"
    >
      {{ errorText }}
      <button class="ml-2 underline" @click="loader.run()">Retry</button>
    </div>

    <DataTable
      :columns="columns"
      :rows="data ?? []"
      :row-key="(r) => r.id"
      :loading="loading"
      :clickable="true"
      empty-title="No failed instances"
      empty-description="All instances are healthy. Failed instances will appear here for retry."
      @row-click="viewDetail"
    >
      <template #cell-id="{ row }">
        <span class="mono text-[12px]">{{ shortId(row.id) }}</span>
      </template>

      <template #cell-sequence_id="{ row }">
        <span class="mono text-[12px] text-subtle">{{ shortId(row.sequence_id) }}</span>
      </template>

      <template #cell-state="{ row }">
        <StateBadge :state="row.state" />
      </template>

      <template #cell-updated_at="{ row }">
        <span :title="formatDateTime(row.updated_at)" class="text-subtle">
          {{ formatRelative(row.updated_at) }}
        </span>
      </template>

      <template #cell-_actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <IconButton label="View instance detail" size="sm" @click.stop="viewDetail(row)">
            <Eye :size="14" />
          </IconButton>
          <IconButton
            label="Retry instance"
            size="sm"
            :disabled="retrying.has(row.id)"
            @click.stop="handleRetry(row)"
          >
            <RotateCcw :size="14" :class="retrying.has(row.id) && 'animate-spin'" />
          </IconButton>
        </div>
      </template>
    </DataTable>

    <Pagination
      v-if="(data?.length ?? 0) > 0 || offset > 0"
      :limit="PAGE_SIZE"
      :offset="offset"
      :count="pageCount"
      :loading="loading"
      @update:offset="changePage"
    />
  </div>
</template>
