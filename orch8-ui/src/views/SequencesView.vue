<script setup lang="ts">
/**
 * Sequences list view.
 *
 * Features:
 *  - Paginated list (5s polling) with name, version, status, namespace, created
 *  - SearchInput + namespace/status filters + Pagination
 *  - Row click → /sequences/:id
 *  - Per-row SequenceActionsMenu (set-status/promote/unpublish/delete) + Canvas link
 *  - SequenceCreateModal
 *  - Loading / empty / error states
 *
 * DESIGN_REFERENCE §Sequences (dag-sequences.md §9.4)
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Workflow, Plus, RefreshCw, Layers, ExternalLink, FilterX } from 'lucide-vue-next'
import { useConnectionStore } from '@/stores/connection'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { listSequences } from '@/api/sequences'
import { formatRelative, formatDateTime, shortId } from '@/lib/format'
import type { SequenceDefinition, SequenceStatus } from '@/api/types/sequences'
import type { Column } from '@/components/ui/DataTable.vue'

import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import Select from '@/components/ui/Select.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import SequenceStatusBadge from '@/components/sequences/SequenceStatusBadge.vue'
import SequenceActionsMenu from '@/components/sequences/SequenceActionsMenu.vue'
import SequenceCreateModal from '@/components/sequences/SequenceCreateModal.vue'

const router = useRouter()
const conn = useConnectionStore()

// --- filters -----------------------------------------------------------------
const statusOptions = [
  { value: '',             label: 'All statuses' },
  { value: 'draft',        label: 'Draft' },
  { value: 'staging',      label: 'Staging' },
  { value: 'production',   label: 'Production' },
  { value: 'unpublished',  label: 'Unpublished' },
]

const statusFilter = ref('')
const nsFilter     = ref('')
const searchFilter = ref('')

const PAGE_SIZE = 50
const offset    = ref(0)

watch([statusFilter, nsFilter, searchFilter], () => { offset.value = 0 })

function buildQuery() {
  return {
    tenant_id: conn.tenantId || undefined,
    namespace: nsFilter.value.trim() || undefined,
    limit:     PAGE_SIZE,
    offset:    offset.value,
  }
}

// --- data fetching -----------------------------------------------------------
const loader = useAsync((signal) => listSequences(buildQuery(), signal))
const { data, loading, error, errorText } = loader

const polling = usePolling(loader.run, { intervalMs: 5000, immediate: false })

onMounted(() => {
  void loader.run()
  polling.start()
})

// Client-side text and status filtering over the already-fetched page
const rows = computed<SequenceDefinition[]>(() => {
  let all = data.value?.items ?? []
  const q = searchFilter.value.trim().toLowerCase()
  if (q) {
    all = all.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.namespace.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    )
  }
  if (statusFilter.value) {
    all = all.filter((r) => r.status === (statusFilter.value as SequenceStatus))
  }
  return all
})

const hasFilters = computed(() => !!(statusFilter.value || nsFilter.value || searchFilter.value))

function clearFilters() {
  statusFilter.value = ''
  nsFilter.value = ''
  searchFilter.value = ''
}

function changePage(newOffset: number) {
  offset.value = newOffset
  void loader.run()
}

// --- columns -----------------------------------------------------------------
const columns: Column[] = [
  { key: 'name',       header: 'Name' },
  { key: 'version',    header: 'Version',   width: '90px',  align: 'right', mono: true },
  { key: 'status',     header: 'Status',    width: '130px' },
  { key: 'namespace',  header: 'Namespace', width: '140px', mono: true },
  { key: 'created_at', header: 'Created',   width: '150px' },
  { key: '_actions',   header: '',          width: '240px', align: 'right' },
]

// --- navigation --------------------------------------------------------------
function navigateToDetail(row: SequenceDefinition) {
  void router.push(`/sequences/${row.id}`)
}

function openCanvas(id: string, event: Event) {
  event.stopPropagation()
  void router.push(`/canvas?sequence=${id}`)
}

// --- create modal ------------------------------------------------------------
const showCreate = ref(false)

function onCreated() {
  void loader.run()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeader
      title="Sequences"
      description="Workflow definitions — create, promote and manage sequence lifecycle."
      :icon="Workflow"
    >
      <template #actions>
        <Tooltip text="Polling every 5s">
          <IconButton
            label="Refresh sequences"
            @click="loader.run()"
          >
            <RefreshCw :size="16" :class="(loading || polling.active.value) && 'animate-spin'" />
          </IconButton>
        </Tooltip>
        <Button variant="primary" @click="showCreate = true">
          <template #icon><Plus :size="15" /></template>
          New sequence
        </Button>
      </template>
    </PageHeader>

    <!-- Filters row -->
    <div class="flex flex-wrap items-center gap-2">
      <SearchInput v-model="searchFilter" placeholder="Search by name, namespace, ID…" class="w-56" />
      <Select v-model="statusFilter" :options="statusOptions" class="w-40" />
      <input
        v-model="nsFilter"
        class="h-9 w-36 rounded-md border border-border-strong bg-surface-2 px-3 text-[13px] text-text placeholder:text-faint focus:border-accent focus:outline-none"
        placeholder="Namespace"
        aria-label="Filter by namespace"
      />
      <IconButton
        v-if="hasFilters"
        label="Clear all filters"
        @click="clearFilters"
      >
        <FilterX :size="15" />
      </IconButton>
      <span v-if="data" class="ml-auto text-[12.5px] text-subtle">
        {{ rows.length }} / {{ data.items.length }} rows
      </span>
    </div>

    <!-- Error banner -->
    <div
      v-if="error"
      class="rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
      role="alert"
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
      empty-title="No sequences"
      empty-description="No sequences match the current filters. Create one or adjust the filters above."
      @row-click="navigateToDetail"
    >
      <template #cell-name="{ row }">
        <span class="font-medium text-text">{{ row.name }}</span>
        <span class="ml-1.5 mono text-[11px] text-faint">{{ shortId(row.id) }}</span>
      </template>

      <template #cell-version="{ row }">
        <span class="mono text-[12px] text-subtle">v{{ row.version }}</span>
      </template>

      <template #cell-status="{ row }">
        <SequenceStatusBadge :status="row.status" />
      </template>

      <template #cell-namespace="{ row }">
        <span class="mono text-[12px] text-text">
          <Layers :size="11" class="mr-1 inline text-faint" />{{ row.namespace }}
        </span>
      </template>

      <template #cell-created_at="{ row }">
        <Tooltip :text="formatDateTime(row.created_at)">
          <span class="text-[12.5px] text-subtle">{{ formatRelative(row.created_at) }}</span>
        </Tooltip>
      </template>

      <template #cell-_actions="{ row }">
        <div class="flex items-center justify-end gap-1" @click.stop>
          <!-- Open in Flow Canvas -->
          <Tooltip text="Open in Canvas">
            <IconButton
              label="Open in Flow Canvas"
              size="sm"
              @click="openCanvas(row.id, $event)"
            >
              <ExternalLink :size="13" />
            </IconButton>
          </Tooltip>

          <!-- Sequence lifecycle actions -->
          <SequenceActionsMenu
            :sequence="row"
            @changed="loader.run()"
            @deleted="loader.run()"
          />
        </div>
      </template>
    </DataTable>

    <!-- Pagination -->
    <Pagination
      v-if="(data?.items.length ?? 0) > 0 || offset > 0"
      :limit="PAGE_SIZE"
      :offset="offset"
      :count="rows.length"
      :loading="loading"
      @update:offset="changePage"
    />

    <!-- Create modal -->
    <SequenceCreateModal
      v-model:open="showCreate"
      @created="onCreated"
    />
  </div>
</template>
