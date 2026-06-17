<script setup lang="ts">
/**
 * Cluster Nodes operator console.
 *
 * Features:
 *  - Live list of cluster nodes (id, name, status, role, last heartbeat)
 *  - Drain node action (confirm danger)
 *  - 5-second polling for live state
 *
 * DESIGN_REFERENCE §Cluster Nodes — ops-resilience.md §3
 */
import { onMounted } from 'vue'
import { ServerCog, RefreshCw, Network } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { listClusterNodes, drainNode } from '@/api/cluster'
import { errorMessage } from '@/api/errors'
import { formatDateTime, formatRelative, shortId } from '@/lib/format'
import type { ClusterNode } from '@/api/types/ops'
import type { Column } from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import NodeStatusBadge from '@/components/ops/NodeStatusBadge.vue'

const ui = useUiStore()

const list = useAsync((signal) => listClusterNodes(signal))
const { data: nodes, loading, error, errorText } = list

const polling = usePolling(list.run, { intervalMs: 5000, immediate: false })

onMounted(() => {
  void list.run()
  polling.start()
})

const columns: Column[] = [
  { key: 'name', header: 'Name', mono: true },
  { key: 'id', header: 'Node ID', mono: true, width: '150px' },
  { key: 'status', header: 'Status', width: '120px' },
  { key: 'drain', header: 'Drain', width: '80px' },
  { key: 'last_heartbeat_at', header: 'Last Heartbeat', width: '150px' },
  { key: 'registered_at', header: 'Registered', width: '150px' },
  { key: '_actions', header: '', width: '60px', align: 'right' },
]

async function handleDrain(node: ClusterNode) {
  const ok = await ui.confirm({
    title: `Drain node "${node.name}"?`,
    message: `The node will stop accepting new work and finish its current in-flight tasks before shutting down. This operation cannot be reversed from the UI.`,
    tone: 'danger',
    confirmText: 'Drain node',
  })
  if (!ok) return
  try {
    await drainNode(node.id)
    ui.success('Drain initiated', node.name)
    void list.run()
  } catch (e) {
    ui.error('Drain failed', errorMessage(e))
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Cluster Nodes"
      description="Engine nodes in this deployment. Nodes heartbeat every few seconds; stale nodes are marked stopped after 120 s."
      :icon="ServerCog"
    >
      <template #actions>
        <IconButton label="Refresh cluster" @click="list.run()">
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
      :rows="nodes ?? []"
      :row-key="(r) => r.id"
      :loading="loading"
      empty-title="No cluster nodes"
      empty-description="Engine nodes register here at startup. Ensure the Orch8 engine is running."
    >
      <template #cell-name="{ row }">
        <span class="mono flex items-center gap-2 text-[12px] font-medium text-text">
          <Network :size="12" class="shrink-0 text-accent" />
          {{ row.name }}
        </span>
      </template>

      <template #cell-id="{ row }">
        <Tooltip :text="row.id">
          <span class="mono text-[11px] text-subtle">{{ shortId(row.id) }}</span>
        </Tooltip>
      </template>

      <template #cell-status="{ row }">
        <NodeStatusBadge :status="row.status" />
      </template>

      <template #cell-drain="{ row }">
        <span class="flex items-center gap-1.5">
          <StatusDot :tone="row.drain ? 'warning' : 'neutral'" />
          <span class="text-[12px]">{{ row.drain ? 'Draining' : 'No' }}</span>
        </span>
      </template>

      <template #cell-last_heartbeat_at="{ row }">
        <Tooltip :text="formatDateTime(row.last_heartbeat_at)">
          <span class="text-[12px] text-subtle">{{ formatRelative(row.last_heartbeat_at) }}</span>
        </Tooltip>
      </template>

      <template #cell-registered_at="{ row }">
        <Tooltip :text="formatDateTime(row.registered_at)">
          <span class="text-[12px] text-subtle">{{ formatRelative(row.registered_at) }}</span>
        </Tooltip>
      </template>

      <template #cell-_actions="{ row }">
        <div class="flex items-center justify-end">
          <Tooltip text="Drain this node">
            <IconButton
              label="Drain node"
              size="sm"
              variant="danger"
              :disabled="row.status === 'stopped' || row.drain"
              @click.stop="handleDrain(row)"
            >
              <ServerCog :size="13" />
            </IconButton>
          </Tooltip>
        </div>
      </template>
    </DataTable>
  </div>
</template>
