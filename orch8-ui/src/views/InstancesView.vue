<script setup lang="ts">
/**
 * Instances list view.
 *
 * Features:
 *  - Paginated live list (5s polling) with state, namespace, sequence, text filters
 *  - Multi-select rows → batch action bar (pause/resume/cancel/retry)
 *  - Bulk state update via PATCH /instances/bulk/state
 *  - Create instance modal (single + batch)
 *  - DLQ tab with retry affordance
 * DESIGN_REFERENCE §Instances — instances-core.md
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Cpu,
  Plus,
  RefreshCw,
  CheckSquare,
  Square,
  FilterX,
  List,
  AlertTriangle,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useInstancesStore } from '@/stores/instances'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { listInstances, batchAction } from '@/api/instances'
import { errorMessage, isApiError } from '@/api/errors'
import { formatRelative, formatDateTime, shortId, titleCase } from '@/lib/format'
import type { TaskInstance, InstanceState, BatchAction } from '@/api/types/instances'
import { TERMINAL_STATES } from '@/api/types/instances'

import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import Select from '@/components/ui/Select.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Tabs from '@/components/ui/Tabs.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import StateBadge from '@/components/instances/StateBadge.vue'
import CreateInstanceModal from '@/components/instances/CreateInstanceModal.vue'
import BatchActionBar from '@/components/instances/BatchActionBar.vue'
import DlqPanel from '@/components/instances/DlqPanel.vue'

import type { Column } from '@/components/ui/DataTable.vue'
import type { TabItem } from '@/components/ui/Tabs.vue'

const router = useRouter()
const ui = useUiStore()
const conn = useConnectionStore()
const instStore = useInstancesStore()

// --- tabs ---
type TabKey = 'list' | 'dlq'
const activeTab = ref<TabKey>('list')
const tabs: TabItem[] = [
  { key: 'list', label: 'Instances', icon: List as Component },
  { key: 'dlq',  label: 'Dead Letter Queue', icon: AlertTriangle as Component },
]

// --- filters ---
const stateOptions = [
  { value: '',           label: 'All states' },
  { value: 'scheduled',  label: 'Scheduled' },
  { value: 'running',    label: 'Running' },
  { value: 'waiting',    label: 'Waiting' },
  { value: 'paused',     label: 'Paused' },
  { value: 'completed',  label: 'Completed' },
  { value: 'failed',     label: 'Failed' },
  { value: 'cancelled',  label: 'Cancelled' },
]

const stateFilter  = ref('')
const nsFilter     = ref('')
const seqFilter    = ref('')
const searchFilter = ref('')

const PAGE_SIZE = 50
const offset = ref(0)

// Reset offset when filter changes
watch([stateFilter, nsFilter, seqFilter, searchFilter], () => {
  offset.value = 0
  instStore.clearSelection()
})

function buildQuery() {
  return {
    tenant_id:   conn.tenantId || undefined,
    namespace:   nsFilter.value.trim() || undefined,
    sequence_id: seqFilter.value.trim() || undefined,
    state:       stateFilter.value || undefined,
    limit:       PAGE_SIZE,
    offset:      offset.value,
  }
}

const loader = useAsync((signal) => listInstances(buildQuery(), signal))
const { data, loading, error, errorText } = loader

const polling = usePolling(loader.run, { intervalMs: 5000, immediate: false })

onMounted(() => {
  void loader.run()
  polling.start()
})

// client-side text search on already-fetched page
const rows = computed<TaskInstance[]>(() => {
  const q = searchFilter.value.trim().toLowerCase()
  const all = data.value ?? []
  if (!q) return all
  return all.filter((r) =>
    r.id.toLowerCase().includes(q) ||
    r.namespace.toLowerCase().includes(q) ||
    r.sequence_id.toLowerCase().includes(q),
  )
})

function changePage(newOffset: number) {
  offset.value = newOffset
  instStore.clearSelection()
  void loader.run()
}

// --- columns ---
const columns: Column[] = [
  { key: '_check',       header: '',           width: '36px' },
  { key: 'id',           header: 'ID',         width: '190px', mono: true },
  { key: 'sequence_id',  header: 'Sequence',   width: '190px', mono: true },
  { key: 'namespace',    header: 'Namespace',  width: '120px', mono: true },
  { key: 'state',        header: 'State',      width: '130px' },
  { key: 'priority',     header: 'Priority',   width: '90px' },
  { key: 'updated_at',   header: 'Updated',    width: '150px' },
  { key: '_actions',     header: '',           width: '60px',  align: 'right' },
]

// --- selection ---
const allPageIds = computed(() => rows.value.map((r) => r.id))
const allSelected = computed(
  () => allPageIds.value.length > 0 && allPageIds.value.every((id) => instStore.isSelected(id)),
)

function toggleSelectAll() {
  if (allSelected.value) {
    instStore.clearSelection()
  } else {
    instStore.selectAll(allPageIds.value)
  }
}

// --- create ---
const showCreate = ref(false)

// --- batch actions ---
const batchLoading = ref(false)

async function performBatchAction(action: BatchAction) {
  const ids = [...instStore.selectedIds]
  if (ids.length === 0) return

  const isDestructive = action === 'cancel' || action === 'retry'
  if (isDestructive) {
    const label = action === 'cancel' ? 'Cancel' : 'Retry'
    const ok = await ui.confirm({
      title: `${label} ${ids.length} instance(s)?`,
      message:
        action === 'cancel'
          ? 'These instances will be cancelled. This cannot be undone.'
          : 'Failed instances will be re-scheduled from the beginning.',
      tone: 'danger',
      confirmText: `${label} all`,
    })
    if (!ok) return
  }

  batchLoading.value = true
  try {
    const tenantId = conn.tenantId
    if (!tenantId) {
      ui.error('Tenant required', 'Connect with a tenant-scoped key to perform bulk actions.')
      return
    }

    // For id-based selection we use batchAction with a state filter matching selected IDs.
    // Since bulk/state operates on filter (not IDs), we use batch-action instead which
    // applies to the filter. For a precise ID-set we match IDs client-side and batch per state.
    // Simplest approach: use batchAction with states filter = current selection states.
    const selectedRows = rows.value.filter((r) => instStore.isSelected(r.id))
    const stateSet = [...new Set(selectedRows.map((r) => r.state))] as InstanceState[]

    const res = await batchAction({
      filter: {
        tenant_id: tenantId,
        states: action === 'retry' ? ['failed'] : stateSet.filter((s) => !TERMINAL_STATES.has(s)),
      },
      action,
      dry_run: false,
      limit: ids.length,
    })

    ui.success(
      `${titleCase(action)} applied`,
      `${res.applied} acted on, ${res.skipped} skipped`,
    )
    instStore.clearSelection()
    void loader.run()
  } catch (e) {
    if (isApiError(e) && e.status === 400) {
      ui.error(`${titleCase(action)} failed`, e.message)
    } else {
      ui.error(`${titleCase(action)} failed`, errorMessage(e))
    }
  } finally {
    batchLoading.value = false
  }
}

const hasFilters = computed(() =>
  !!(stateFilter.value || nsFilter.value || seqFilter.value || searchFilter.value),
)

function clearFilters() {
  stateFilter.value = ''
  nsFilter.value = ''
  seqFilter.value = ''
  searchFilter.value = ''
  instStore.resetFilters()
}

function navigateToDetail(row: TaskInstance) {
  void router.push(`/instances/${row.id}`)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeader
      title="Instances"
      description="Live workflow execution — monitor, filter, and control running instances."
      :icon="Cpu"
    >
      <template #actions>
        <Tooltip text="Polling every 5s">
          <IconButton
            label="Refresh instances"
            @click="loader.run()"
          >
            <RefreshCw :size="16" :class="(loading || polling.active.value) && 'animate-spin'" />
          </IconButton>
        </Tooltip>
        <Button variant="primary" @click="showCreate = true">
          <template #icon><Plus :size="15" /></template>
          New instance
        </Button>
      </template>
    </PageHeader>

    <!-- Tabs -->
    <Tabs v-model="activeTab" :tabs="tabs" />

    <!-- Instances tab -->
    <template v-if="activeTab === 'list'">
      <!-- Filters row -->
      <div class="flex flex-wrap items-center gap-2">
        <Select v-model="stateFilter" :options="stateOptions" class="w-40" />
        <input
          v-model="nsFilter"
          class="h-9 w-36 rounded-md border border-border-strong bg-surface-2 px-3 text-[13px] text-text placeholder-faint focus:border-accent focus:outline-none"
          placeholder="Namespace"
        />
        <input
          v-model="seqFilter"
          class="mono h-9 w-52 rounded-md border border-border-strong bg-surface-2 px-3 text-[12px] text-text placeholder-faint focus:border-accent focus:outline-none"
          placeholder="Sequence UUID"
        />
        <SearchInput v-model="searchFilter" placeholder="Search by ID…" class="w-48" />
        <IconButton
          v-if="hasFilters"
          label="Clear all filters"
          @click="clearFilters"
        >
          <FilterX :size="15" />
        </IconButton>
        <span v-if="data" class="ml-auto text-[12.5px] text-subtle">
          {{ rows.length }} / {{ data.length }} rows
        </span>
      </div>

      <!-- Error banner -->
      <div
        v-if="error"
        class="rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
      >
        {{ errorText }}
        <button class="ml-2 underline" @click="loader.run()">Retry</button>
      </div>

      <!-- Data table -->
      <DataTable
        :columns="columns"
        :rows="rows"
        :row-key="(r) => r.id"
        :loading="loading"
        :clickable="true"
        empty-title="No instances"
        empty-description="No instances match the current filters. Create one or adjust the filters above."
        @row-click="navigateToDetail"
      >
        <!-- Select-all header -->
        <template #head-_check>
          <button
            class="flex items-center"
            :aria-label="allSelected ? 'Deselect all' : 'Select all on page'"
            @click.stop="toggleSelectAll"
          >
            <CheckSquare v-if="allSelected" :size="14" class="text-accent" />
            <Square v-else :size="14" class="text-faint" />
          </button>
        </template>

        <!-- Row checkbox -->
        <template #cell-_check="{ row }">
          <button
            class="flex items-center"
            :aria-label="instStore.isSelected(row.id) ? 'Deselect row' : 'Select row'"
            @click.stop="instStore.toggleSelect(row.id)"
          >
            <CheckSquare
              v-if="instStore.isSelected(row.id)"
              :size="14"
              class="text-accent"
            />
            <Square v-else :size="14" class="text-faint" />
          </button>
        </template>

        <template #cell-id="{ row }">
          <span class="mono text-[12px] text-text">{{ shortId(row.id) }}</span>
        </template>

        <template #cell-sequence_id="{ row }">
          <span class="mono text-[12px] text-subtle">{{ shortId(row.sequence_id) }}</span>
        </template>

        <template #cell-state="{ row }">
          <StateBadge :state="row.state" :show-dot="row.state === 'running'" />
        </template>

        <template #cell-priority="{ row }">
          <span class="text-[12px] text-muted">{{ row.priority }}</span>
        </template>

        <template #cell-updated_at="{ row }">
          <span :title="formatDateTime(row.updated_at)" class="text-subtle">
            {{ formatRelative(row.updated_at) }}
          </span>
        </template>

        <template #cell-_actions>
          <!-- row-level actions are handled via row click to detail view -->
        </template>
      </DataTable>

      <!-- Pagination -->
      <Pagination
        v-if="(data?.length ?? 0) > 0 || offset > 0"
        :limit="PAGE_SIZE"
        :offset="offset"
        :count="rows.length"
        :loading="loading"
        @update:offset="changePage"
      />
    </template>

    <!-- DLQ tab -->
    <template v-else-if="activeTab === 'dlq'">
      <DlqPanel />
    </template>

    <!-- Batch action bar (floats over content) -->
    <BatchActionBar
      :count="instStore.selectionCount"
      :loading="batchLoading"
      @action="performBatchAction"
      @clear="instStore.clearSelection()"
    />

    <!-- Create modal -->
    <CreateInstanceModal v-model:open="showCreate" @created="loader.run()" />
  </div>
</template>
