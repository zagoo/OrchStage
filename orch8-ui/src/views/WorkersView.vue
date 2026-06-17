<script setup lang="ts">
/**
 * Workers & Tasks operator console.
 *
 * Features:
 *  - Live worker fleet list with polling (status, heartbeat, handlers, queues, in-flight)
 *  - Handler catalog panel (builtin + external handlers)
 *  - Task stats summary cards (pending/claimed/completed/failed, active workers)
 *  - Per-worker detail drawer (commands, enqueue/delete)
 *  - Version pins table (create / delete)
 *
 * DESIGN_REFERENCE §Workers & Tasks
 */
import { ref, computed, onMounted } from 'vue'
import {
  HardDrive,
  RefreshCw,
  Cpu,
  Layers,
  Pin,
  Trash2,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
} from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import {
  listWorkers,
  listHandlers,
  getTaskStats,
  listVersionPins,
  deleteVersionPin,
} from '@/api/workers'
import { errorMessage } from '@/api/errors'
import { formatRelative, formatDateTime, formatNumber } from '@/lib/format'
import type { WorkerInfo, WorkerVersionPin } from '@/api/types/workers'
import type { Column } from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Panel from '@/components/ui/Panel.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Tabs from '@/components/ui/Tabs.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import WorkerStatusBadge from '@/components/workers/WorkerStatusBadge.vue'
import WorkerDetailDrawer from '@/components/workers/WorkerDetailDrawer.vue'
import VersionPinModal from '@/components/workers/VersionPinModal.vue'

const ui = useUiStore()
const conn = useConnectionStore()

// --- active tab ---
const activeTab = ref('fleet')
const tabItems = [
  { key: 'fleet', label: 'Worker Fleet' },
  { key: 'catalog', label: 'Handler Catalog' },
  { key: 'stats', label: 'Task Stats' },
  { key: 'pins', label: 'Version Pins' },
]

// --- worker fleet ---
const workersList = useAsync((signal) =>
  listWorkers({ alive_within_secs: 60, include_stale: true }, signal),
)

const { data: workers, loading: workersLoading, error: workersError, errorText: workersErrorText } = workersList

const polling = usePolling(workersList.run, { intervalMs: 5000, immediate: false })

// --- handler catalog ---
const handlersList = useAsync((signal) => listHandlers(signal))
const { data: catalog, loading: catalogLoading } = handlersList

// --- task stats ---
const statsList = useAsync((signal) => getTaskStats(signal))
const { data: stats, loading: statsLoading } = statsList

// --- version pins ---
const pinsList = useAsync((signal) =>
  listVersionPins({ tenant_id: conn.tenantId || undefined }, signal),
)
const { data: pins, loading: pinsLoading, error: pinsError, errorText: pinsErrorText } = pinsList

// --- worker detail drawer ---
const selectedWorker = ref<WorkerInfo | null>(null)
const showWorkerDetail = ref(false)

function openWorker(worker: WorkerInfo) {
  selectedWorker.value = worker
  showWorkerDetail.value = true
}

// --- version pin modal ---
const showPinModal = ref(false)

async function handleDeletePin(pin: WorkerVersionPin) {
  const ok = await ui.confirm({
    title: `Remove version pin for "${pin.handler_name}"?`,
    message: `Workers reporting a version below ${pin.min_version} will be allowed to claim tasks again.`,
    tone: 'danger',
    confirmText: 'Remove pin',
  })
  if (!ok) return
  try {
    await deleteVersionPin(pin.tenant_id, pin.handler_name)
    ui.success('Version pin removed', `${pin.handler_name} ≥ ${pin.min_version}`)
    void pinsList.run()
  } catch (e) {
    ui.error('Failed to remove pin', errorMessage(e))
  }
}

// --- refresh all ---
function refreshAll() {
  void workersList.run()
  void handlersList.run()
  void statsList.run()
  void pinsList.run()
}

onMounted(() => {
  void workersList.run()
  void handlersList.run()
  void statsList.run()
  void pinsList.run()
  polling.start()
})

// --- workers table columns ---
const workerColumns: Column[] = [
  { key: 'worker_id', header: 'Worker ID', mono: true },
  { key: 'alive', header: 'Status', width: '110px' },
  { key: 'version', header: 'Version', width: '110px', mono: true },
  { key: 'in_flight', header: 'In-flight', width: '90px', align: 'right' },
  { key: 'handlers', header: 'Handlers' },
  { key: 'queues', header: 'Queues', width: '200px' },
  { key: 'last_seen_at', header: 'Last Heartbeat', width: '140px' },
  { key: '_actions', header: '', width: '60px', align: 'right' },
]

// --- pins table columns ---
const pinColumns: Column[] = [
  { key: 'handler_name', header: 'Handler', mono: true },
  { key: 'tenant_id', header: 'Tenant', mono: true, width: '180px' },
  { key: 'min_version', header: 'Min Version', mono: true, width: '130px' },
  { key: 'updated_at', header: 'Updated', width: '140px' },
  { key: '_actions', header: '', width: '60px', align: 'right' },
]

// --- computed summary stats ---
const statCards = computed(() => {
  const s = stats.value
  return [
    { label: 'Pending', value: s?.by_state.pending ?? 0, tone: 'warning' as const, icon: Clock },
    { label: 'Claimed', value: s?.by_state.claimed ?? 0, tone: 'info' as const, icon: Activity },
    { label: 'Completed', value: s?.by_state.completed ?? 0, tone: 'success' as const, icon: CheckCircle2 },
    { label: 'Failed', value: s?.by_state.failed ?? 0, tone: 'danger' as const, icon: XCircle },
  ]
})
</script>

<template>
  <div>
    <PageHeader
      title="Workers"
      description="Monitor external worker fleet, task queues, handler catalog, and version gates."
      :icon="HardDrive"
    >
      <template #actions>
        <IconButton label="Refresh all" @click="refreshAll">
          <RefreshCw :size="16" :class="workersLoading && 'animate-spin'" />
        </IconButton>
        <Button
          v-show="activeTab === 'pins'"
          variant="primary"
          @click="showPinModal = true"
        >
          <template #icon><Pin :size="15" /></template>
          New pin
        </Button>
      </template>
    </PageHeader>

    <!-- Tab navigation -->
    <Tabs
      :tabs="tabItems"
      v-model="activeTab"
      class="mb-5"
    />

    <!-- ========== FLEET TAB ========== -->
    <div v-show="activeTab === 'fleet'">
      <div v-if="workersError" class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger">
        {{ workersErrorText }}
        <button class="ml-2 underline" @click="workersList.run()">Retry</button>
      </div>

      <DataTable
        :columns="workerColumns"
        :rows="workers ?? []"
        :row-key="(r) => r.worker_id"
        :loading="workersLoading"
        :clickable="true"
        empty-title="No workers"
        empty-description="Workers appear here after their first poll call. Ensure workers are running and connected."
        @row-click="openWorker"
      >
        <template #cell-worker_id="{ row }">
          <span class="mono text-[12px] font-medium text-text">{{ row.worker_id }}</span>
        </template>

        <template #cell-alive="{ row }">
          <WorkerStatusBadge :alive="row.alive" />
        </template>

        <template #cell-version="{ row }">
          <span class="mono text-[12px] text-subtle">{{ row.version ?? '—' }}</span>
        </template>

        <template #cell-in_flight="{ row }">
          <span :class="row.in_flight > 0 ? 'font-semibold text-info' : 'text-subtle'">
            {{ row.in_flight }}
          </span>
        </template>

        <template #cell-handlers="{ row }">
          <div class="flex flex-wrap gap-1">
            <Badge v-for="h in row.handlers" :key="h" tone="info">
              <Cpu :size="9" />
              {{ h }}
            </Badge>
          </div>
        </template>

        <template #cell-queues="{ row }">
          <div v-if="row.queues.length" class="flex flex-wrap gap-1">
            <Badge v-for="q in row.queues" :key="q" tone="purple">
              <Layers :size="9" />
              {{ q }}
            </Badge>
          </div>
          <span v-else class="text-[12px] text-subtle">default</span>
        </template>

        <template #cell-last_seen_at="{ row }">
          <Tooltip :text="formatDateTime(row.last_seen_at)">
            <span class="text-[12px] text-subtle">{{ formatRelative(row.last_seen_at) }}</span>
          </Tooltip>
        </template>

        <template #cell-_actions="{ row }">
          <div class="flex items-center justify-end gap-1">
            <IconButton label="View worker detail" size="sm" @click.stop="openWorker(row)">
              <Zap :size="13" />
            </IconButton>
          </div>
        </template>
      </DataTable>
    </div>

    <!-- ========== CATALOG TAB ========== -->
    <div v-show="activeTab === 'catalog'" class="grid gap-4 sm:grid-cols-2">
      <!-- Builtin handlers -->
      <Panel title="Built-in Handlers" subtitle="Executed in-process by the engine">
        <template #actions>
          <Badge tone="info">{{ catalog?.builtin.length ?? 0 }}</Badge>
        </template>
        <div v-if="catalogLoading" class="flex flex-col gap-2">
          <Skeleton v-for="n in 4" :key="n" height="1.6rem" />
        </div>
        <EmptyState
          v-else-if="!catalog?.builtin.length"
          title="No built-in handlers"
          compact
        />
        <ul v-else class="flex flex-col gap-1">
          <li
            v-for="h in catalog.builtin"
            :key="h"
            class="mono flex items-center gap-2 rounded-md bg-surface-2 px-3 py-1.5 text-[12px] text-text"
          >
            <Cpu :size="12" class="shrink-0 text-info" />
            {{ h }}
          </li>
        </ul>
      </Panel>

      <!-- External handlers -->
      <Panel title="External Handlers" subtitle="Served by connected workers via the poll API">
        <template #actions>
          <Badge tone="purple">{{ catalog?.external.length ?? 0 }}</Badge>
        </template>
        <div v-if="catalogLoading" class="flex flex-col gap-2">
          <Skeleton v-for="n in 4" :key="n" height="1.6rem" />
        </div>
        <EmptyState
          v-else-if="!catalog?.external.length"
          title="No external handlers"
          description="Register a handler by having a worker call the poll endpoint."
          compact
        />
        <ul v-else class="flex flex-col gap-1">
          <li
            v-for="h in catalog.external"
            :key="h"
            class="mono flex items-center gap-2 rounded-md bg-surface-2 px-3 py-1.5 text-[12px] text-text"
          >
            <HardDrive :size="12" class="shrink-0 text-purple" />
            {{ h }}
          </li>
        </ul>
      </Panel>
    </div>

    <!-- ========== STATS TAB ========== -->
    <div v-show="activeTab === 'stats'" class="flex flex-col gap-5">
      <!-- Summary cards -->
      <div class="grid gap-3 sm:grid-cols-4">
        <div
          v-for="card in statCards"
          :key="card.label"
          class="flex items-start gap-3 rounded-lg border border-border bg-surface p-4"
        >
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2">
            <component
              :is="card.icon"
              :size="16"
              :class="{
                'text-warning': card.tone === 'warning',
                'text-info': card.tone === 'info',
                'text-success': card.tone === 'success',
                'text-danger': card.tone === 'danger',
              }"
            />
          </div>
          <div>
            <div v-if="statsLoading">
              <Skeleton height="1.25rem" width="3rem" />
            </div>
            <div v-else class="text-[22px] font-semibold leading-none text-text">
              {{ formatNumber(card.value) }}
            </div>
            <div class="mt-0.5 text-[12px] text-subtle">{{ card.label }}</div>
          </div>
        </div>
      </div>

      <!-- Per-handler breakdown -->
      <Panel title="By Handler" subtitle="Task counts per handler and state">
        <div v-if="statsLoading" class="flex flex-col gap-2">
          <Skeleton v-for="n in 4" :key="n" height="2rem" />
        </div>
        <EmptyState
          v-else-if="!stats || Object.keys(stats.by_handler).length === 0"
          title="No handler data"
          description="Data appears after workers start processing tasks."
          compact
        />
        <div v-else class="overflow-x-auto">
          <table class="w-full text-[13px]">
            <thead>
              <tr class="border-b border-border">
                <th scope="col" class="pb-2 pr-4 text-left text-[11.5px] font-semibold uppercase tracking-wide text-subtle">
                  Handler
                </th>
                <th
                  v-for="state in ['pending', 'claimed', 'completed', 'failed']"
                  :key="state"
                  scope="col"
                  class="pb-2 pr-4 text-right text-[11.5px] font-semibold uppercase tracking-wide text-subtle"
                >
                  {{ state }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(states, handler) in stats.by_handler"
                :key="handler"
                class="border-b border-border last:border-0"
              >
                <td class="mono py-2 pr-4 text-[12px] text-text">{{ handler }}</td>
                <td
                  v-for="state in ['pending', 'claimed', 'completed', 'failed']"
                  :key="state"
                  class="py-2 pr-4 text-right"
                >
                  <span v-if="states[state]" class="font-medium text-text">
                    {{ formatNumber(states[state]) }}
                  </span>
                  <span v-else class="text-subtle">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <!-- Active workers -->
      <Panel title="Active Workers" subtitle="Workers with at least one claimed task">
        <div v-if="statsLoading">
          <Skeleton height="2rem" />
        </div>
        <EmptyState
          v-else-if="!stats?.active_workers.length"
          title="No active workers"
          description="No workers have claimed tasks at this time."
          compact
        />
        <div v-else class="flex flex-wrap gap-2">
          <Badge
            v-for="wId in stats.active_workers"
            :key="wId"
            tone="info"
          >
            <Activity :size="10" />
            {{ wId }}
          </Badge>
        </div>
      </Panel>
    </div>

    <!-- ========== VERSION PINS TAB ========== -->
    <div v-show="activeTab === 'pins'">
      <div v-if="pinsError" class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger">
        {{ pinsErrorText }}
        <button class="ml-2 underline" @click="pinsList.run()">Retry</button>
      </div>

      <DataTable
        :columns="pinColumns"
        :rows="pins ?? []"
        :row-key="(r) => `${r.tenant_id}::${r.handler_name}`"
        :loading="pinsLoading"
        empty-title="No version pins"
        empty-description="Create a pin to enforce a minimum worker version for a handler. Workers below the minimum receive an empty task list."
      >
        <template #cell-handler_name="{ row }">
          <span class="mono text-[12px] font-medium text-text">{{ row.handler_name }}</span>
        </template>

        <template #cell-tenant_id="{ row }">
          <span class="mono text-[12px] text-subtle">{{ row.tenant_id }}</span>
        </template>

        <template #cell-min_version="{ row }">
          <Badge tone="accent">≥ {{ row.min_version }}</Badge>
        </template>

        <template #cell-updated_at="{ row }">
          <Tooltip :text="formatDateTime(row.updated_at)">
            <span class="text-[12px] text-subtle">{{ formatRelative(row.updated_at) }}</span>
          </Tooltip>
        </template>

        <template #cell-_actions="{ row }">
          <div class="flex items-center justify-end">
            <IconButton
              label="Delete version pin"
              size="sm"
              variant="danger"
              @click.stop="handleDeletePin(row)"
            >
              <Trash2 :size="13" />
            </IconButton>
          </div>
        </template>
      </DataTable>
    </div>

    <!-- Worker detail drawer -->
    <WorkerDetailDrawer
      v-model:open="showWorkerDetail"
      :worker="selectedWorker"
    />

    <!-- Version pin modal -->
    <VersionPinModal
      v-model:open="showPinModal"
      :tenant-id="conn.tenantId"
      @saved="pinsList.run()"
    />
  </div>
</template>
