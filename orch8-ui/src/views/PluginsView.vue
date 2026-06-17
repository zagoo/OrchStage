<script setup lang="ts">
/**
 * Plugins list view.
 * Features: list plugins, create/update via PluginFormModal, delete (confirm).
 * DESIGN_REFERENCE §Plugins (resources.md)
 *
 * Plugin definitions contain no secret material — full PluginDef returned on all
 * read/write operations.
 */
import { ref, computed, onMounted } from 'vue'
import { Plug, Plus, Trash2, RefreshCw, Pencil } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useAsync } from '@/composables/useAsync'
import { listPlugins, deletePlugin } from '@/api/plugins'
import { errorMessage } from '@/api/errors'
import { formatRelative, formatDateTime } from '@/lib/format'
import type { PluginDef, PluginType } from '@/api/types/plugins'
import type { Column } from '@/components/ui/DataTable.vue'
import type { BadgeTone } from '@/components/ui/Badge.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import Badge from '@/components/ui/Badge.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import PluginFormModal from '@/components/resources/PluginFormModal.vue'

const ui = useUiStore()
const conn = useConnectionStore()

const search = ref('')
const showModal = ref(false)
const editingPlugin = ref<PluginDef | null>(null)

const pluginsList = useAsync((signal) =>
  listPlugins({ tenant_id: conn.tenantId || undefined }, signal),
)
const { data: plugins, loading, error, errorText } = pluginsList

onMounted(() => void pluginsList.run())

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (plugins.value ?? []).filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.source.toLowerCase().includes(q),
  )
})

function openCreate() {
  editingPlugin.value = null
  showModal.value = true
}

function openEdit(plugin: PluginDef) {
  editingPlugin.value = plugin
  showModal.value = true
}

async function handleDelete(plugin: PluginDef) {
  const ok = await ui.confirm({
    title: `Delete plugin "${plugin.name}"?`,
    message: `Deleting this plugin will permanently remove it. Workflow steps referencing ${plugin.plugin_type}://${plugin.name} will fail at dispatch time.`,
    tone: 'danger',
    confirmText: 'Delete plugin',
  })
  if (!ok) return
  try {
    await deletePlugin(plugin.name)
    ui.success('Plugin deleted', plugin.name)
    void pluginsList.run()
  } catch (e) {
    ui.error('Delete failed', errorMessage(e))
  }
}

const typeTone: Record<PluginType, BadgeTone> = {
  wasm: 'teal',
  grpc: 'purple',
}

const typeLabel: Record<PluginType, string> = {
  wasm: 'WASM',
  grpc: 'gRPC',
}

const columns: Column[] = [
  { key: 'name', header: 'Name', mono: true, width: '200px' },
  { key: 'plugin_type', header: 'Type', width: '90px' },
  { key: 'source', header: 'Source' },
  { key: 'enabled', header: 'Status', width: '90px' },
  { key: 'updated_at', header: 'Updated', width: '140px' },
  { key: '_actions', header: '', width: '90px', align: 'right' },
]
</script>

<template>
  <div>
    <PageHeader
      title="Plugins"
      description="Register external handler implementations (WASM modules or gRPC endpoints) used by workflow steps."
      :icon="Plug"
    >
      <template #actions>
        <IconButton label="Refresh plugins" @click="pluginsList.run()">
          <RefreshCw :size="16" :class="loading && 'animate-spin'" />
        </IconButton>
        <Button variant="primary" @click="openCreate">
          <template #icon><Plus :size="15" /></template>
          Register plugin
        </Button>
      </template>
    </PageHeader>

    <div class="mb-4 flex items-center gap-3">
      <SearchInput v-model="search" placeholder="Search by name or source…" class="max-w-sm" />
      <span v-if="plugins" class="text-[13px] text-subtle">
        {{ filtered.length }} / {{ plugins.length }}
      </span>
    </div>

    <div
      v-if="error"
      class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
    >
      {{ errorText }}
      <button class="ml-2 underline" @click="pluginsList.run()">Retry</button>
    </div>

    <DataTable
      :columns="columns"
      :rows="filtered"
      :row-key="(r) => r.name"
      :loading="loading"
      empty-title="No plugins"
      empty-description="Register a plugin to expose WASM modules or gRPC endpoints as workflow step handlers."
    >
      <template #cell-name="{ row }">
        <span class="mono text-[12px] font-medium text-text">{{ row.name }}</span>
      </template>

      <template #cell-plugin_type="{ row }">
        <Badge :tone="typeTone[row.plugin_type] ?? 'neutral'">
          {{ typeLabel[row.plugin_type] ?? row.plugin_type }}
        </Badge>
      </template>

      <template #cell-source="{ row }">
        <span class="mono truncate text-[12px] text-subtle" :title="row.source">
          {{ row.source }}
        </span>
      </template>

      <template #cell-enabled="{ row }">
        <span class="flex items-center gap-1.5">
          <StatusDot :tone="row.enabled ? 'success' : 'neutral'" />
          <span class="text-[12.5px]">{{ row.enabled ? 'Active' : 'Disabled' }}</span>
        </span>
      </template>

      <template #cell-updated_at="{ row }">
        <Tooltip :text="formatDateTime(row.updated_at)">
          <span class="text-[12px] text-subtle">{{ formatRelative(row.updated_at) }}</span>
        </Tooltip>
      </template>

      <template #cell-_actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <IconButton label="Edit plugin" size="sm" @click.stop="openEdit(row)">
            <Pencil :size="13" />
          </IconButton>
          <IconButton label="Delete plugin" size="sm" variant="danger" @click.stop="handleDelete(row)">
            <Trash2 :size="13" />
          </IconButton>
        </div>
      </template>
    </DataTable>

    <PluginFormModal
      v-model:open="showModal"
      :plugin="editingPlugin"
      @saved="pluginsList.run()"
    />
  </div>
</template>
