<script setup lang="ts">
/**
 * Resource Pools list view.
 * Features: list pools, create (PoolFormModal), delete (confirm), drill into a pool
 * to manage its resources (list, add/update/delete via PoolResourceModal).
 * DESIGN_REFERENCE §Resource Pools (resources.md)
 */
import { ref, computed, onMounted } from 'vue'
import { Layers, Plus, Trash2, RefreshCw, ChevronLeft, Pencil } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useAsync } from '@/composables/useAsync'
import {
  listPools,
  deletePool,
  listPoolResources,
  deletePoolResource,
} from '@/api/pools'
import { errorMessage } from '@/api/errors'
import { formatRelative, formatDateTime } from '@/lib/format'
import type { ResourcePool, PoolResource } from '@/api/types/pools'
import type { Column } from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import Badge from '@/components/ui/Badge.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import PoolFormModal from '@/components/resources/PoolFormModal.vue'
import PoolResourceModal from '@/components/resources/PoolResourceModal.vue'

const ui = useUiStore()
const conn = useConnectionStore()

// --- pools list ---
const search = ref('')
const showCreate = ref(false)

const poolsList = useAsync((signal) =>
  listPools({ tenant_id: conn.tenantId || undefined }, signal),
)
const { data: pools, loading, error, errorText } = poolsList

onMounted(() => void poolsList.run())

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (pools.value ?? []).filter((p) => !q || p.name.toLowerCase().includes(q))
})

// --- pool drill-down ---
const selectedPool = ref<ResourcePool | null>(null)
const resourceSearch = ref('')

const resourcesList = useAsync((signal) =>
  listPoolResources(selectedPool.value!.id, signal),
)
const { data: resources, loading: resLoading, error: resError, errorText: resErrorText } = resourcesList

const showResourceModal = ref(false)
const editingResource = ref<PoolResource | null>(null)

const filteredResources = computed(() => {
  const q = resourceSearch.value.trim().toLowerCase()
  return (resources.value ?? []).filter(
    (r) => !q || r.name.toLowerCase().includes(q) || r.resource_key.toLowerCase().includes(q),
  )
})

function openPool(pool: ResourcePool) {
  selectedPool.value = pool
  resourceSearch.value = ''
  void resourcesList.run()
}

function goBack() {
  selectedPool.value = null
}

function openAddResource() {
  editingResource.value = null
  showResourceModal.value = true
}

function openEditResource(resource: PoolResource) {
  editingResource.value = resource
  showResourceModal.value = true
}

async function handleDeletePool(pool: ResourcePool) {
  const ok = await ui.confirm({
    title: `Delete pool "${pool.name}"?`,
    message: 'Deleting this pool will permanently remove it and all its resources. Workflow steps referencing this pool will fail.',
    tone: 'danger',
    confirmText: 'Delete pool',
  })
  if (!ok) return
  try {
    await deletePool(pool.id)
    ui.success('Pool deleted', pool.name)
    void poolsList.run()
  } catch (e) {
    ui.error('Delete failed', errorMessage(e))
  }
}

async function handleDeleteResource(resource: PoolResource) {
  if (!selectedPool.value) return
  const ok = await ui.confirm({
    title: `Remove resource "${resource.name}"?`,
    message: 'This resource will be permanently removed from the pool.',
    tone: 'danger',
    confirmText: 'Remove resource',
  })
  if (!ok) return
  try {
    await deletePoolResource(selectedPool.value.id, resource.id)
    ui.success('Resource removed', resource.name)
    void resourcesList.run()
  } catch (e) {
    ui.error('Delete failed', errorMessage(e))
  }
}

// --- table columns ---
const poolColumns: Column[] = [
  { key: 'name', header: 'Name' },
  { key: 'strategy', header: 'Strategy', width: '140px' },
  { key: 'updated_at', header: 'Updated', width: '150px' },
  { key: '_actions', header: '', width: '80px', align: 'right' },
]

const resourceColumns: Column[] = [
  { key: 'resource_key', header: 'Resource key', mono: true },
  { key: 'name', header: 'Name' },
  { key: 'enabled', header: 'Status', width: '90px' },
  { key: 'daily_cap', header: 'Daily cap', width: '110px', align: 'right' },
  { key: 'daily_usage', header: 'Usage today', width: '110px', align: 'right' },
  { key: 'weight', header: 'Weight', width: '80px', align: 'right' },
  { key: '_actions', header: '', width: '90px', align: 'right' },
]

const strategyTone: Record<string, 'accent' | 'purple' | 'cyan'> = {
  round_robin: 'accent',
  weighted: 'purple',
  random: 'cyan',
}
</script>

<template>
  <div>
    <!-- ======= POOL DETAIL (drill-down) ======= -->
    <template v-if="selectedPool">
      <PageHeader
        :title="selectedPool.name"
        description="Manage resources in this pool."
        :icon="Layers"
      >
        <template #actions>
          <Button variant="ghost" @click="goBack">
            <template #icon><ChevronLeft :size="15" /></template>
            Back to pools
          </Button>
          <IconButton label="Refresh resources" @click="resourcesList.run()">
            <RefreshCw :size="16" :class="resLoading && 'animate-spin'" />
          </IconButton>
          <Button variant="primary" @click="openAddResource">
            <template #icon><Plus :size="15" /></template>
            Add resource
          </Button>
        </template>
      </PageHeader>

      <div class="mb-4 flex items-center gap-3">
        <SearchInput
          v-model="resourceSearch"
          placeholder="Search by key or name…"
          class="max-w-sm"
        />
        <span v-if="resources" class="text-[13px] text-subtle">
          {{ filteredResources.length }} / {{ resources.length }}
        </span>
      </div>

      <div
        v-if="resError"
        class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
      >
        {{ resErrorText }}
        <button class="ml-2 underline" @click="resourcesList.run()">Retry</button>
      </div>

      <DataTable
        :columns="resourceColumns"
        :rows="filteredResources"
        :row-key="(r) => r.id"
        :loading="resLoading"
        empty-title="No resources"
        empty-description="Add resources to this pool to enable assignment in workflow steps."
      >
        <template #cell-resource_key="{ row }">
          <span class="mono text-[12px] text-text">{{ row.resource_key }}</span>
        </template>

        <template #cell-enabled="{ row }">
          <span class="flex items-center gap-1.5">
            <StatusDot :tone="row.enabled ? 'success' : 'neutral'" />
            <span class="text-[12.5px]">{{ row.enabled ? 'Active' : 'Off' }}</span>
          </span>
        </template>

        <template #cell-daily_cap="{ row }">
          <span :class="row.daily_cap === 0 ? 'text-subtle' : 'text-text'">
            {{ row.daily_cap === 0 ? '∞ unlimited' : row.daily_cap.toLocaleString() }}
          </span>
        </template>

        <template #cell-daily_usage="{ row }">
          <span :class="row.daily_cap > 0 && row.daily_usage >= row.daily_cap ? 'text-danger font-semibold' : 'text-text'">
            {{ row.daily_usage.toLocaleString() }}
          </span>
        </template>

        <template #cell-weight="{ row }">
          <span class="text-subtle">{{ row.weight }}</span>
        </template>

        <template #cell-_actions="{ row }">
          <div class="flex items-center justify-end gap-1">
            <IconButton label="Edit resource" size="sm" @click.stop="openEditResource(row)">
              <Pencil :size="13" />
            </IconButton>
            <IconButton label="Remove resource" size="sm" variant="danger" @click.stop="handleDeleteResource(row)">
              <Trash2 :size="13" />
            </IconButton>
          </div>
        </template>
      </DataTable>

      <PoolResourceModal
        v-model:open="showResourceModal"
        :pool-id="selectedPool.id"
        :resource="editingResource"
        @saved="resourcesList.run()"
      />
    </template>

    <!-- ======= POOLS LIST ======= -->
    <template v-else>
      <PageHeader
        title="Resource Pools"
        description="Manage named resource sets used for rotation-based assignment in workflows."
        :icon="Layers"
      >
        <template #actions>
          <IconButton label="Refresh pools" @click="poolsList.run()">
            <RefreshCw :size="16" :class="loading && 'animate-spin'" />
          </IconButton>
          <Button variant="primary" @click="showCreate = true">
            <template #icon><Plus :size="15" /></template>
            New pool
          </Button>
        </template>
      </PageHeader>

      <div class="mb-4 flex items-center gap-3">
        <SearchInput v-model="search" placeholder="Search pools…" class="max-w-sm" />
        <span v-if="pools" class="text-[13px] text-subtle">
          {{ filtered.length }} / {{ pools.length }}
        </span>
      </div>

      <div
        v-if="error"
        class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
      >
        {{ errorText }}
        <button class="ml-2 underline" @click="poolsList.run()">Retry</button>
      </div>

      <DataTable
        :columns="poolColumns"
        :rows="filtered"
        :row-key="(r) => r.id"
        :loading="loading"
        :clickable="true"
        empty-title="No resource pools"
        empty-description="Create a pool to group resources for round-robin, weighted, or random assignment."
        @row-click="openPool"
      >
        <template #cell-name="{ row }">
          <span class="font-medium text-text">{{ row.name }}</span>
        </template>

        <template #cell-strategy="{ row }">
          <Badge :tone="strategyTone[row.strategy] ?? 'neutral'">
            {{ row.strategy.replace('_', ' ') }}
          </Badge>
        </template>

        <template #cell-updated_at="{ row }">
          <Tooltip :text="formatDateTime(row.updated_at)">
            <span class="text-[12px] text-subtle">{{ formatRelative(row.updated_at) }}</span>
          </Tooltip>
        </template>

        <template #cell-_actions="{ row }">
          <div class="flex items-center justify-end gap-1">
            <IconButton
              label="Delete pool"
              size="sm"
              variant="danger"
              @click.stop="handleDeletePool(row)"
            >
              <Trash2 :size="13" />
            </IconButton>
          </div>
        </template>
      </DataTable>

      <PoolFormModal v-model:open="showCreate" @created="poolsList.run()" />
    </template>
  </div>
</template>
