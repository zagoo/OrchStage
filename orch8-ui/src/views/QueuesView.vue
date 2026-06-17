<script setup lang="ts">
/**
 * Queues & Routing operator console.
 *
 * Features:
 *  - Queue dispatch config table: create, edit, delete
 *    (poll vs push mode, push_url, HMAC secret write-only)
 *  - Routing rules table: create, delete
 *    (handler → match_queue → queue_override, priority, enabled toggle)
 *
 * DESIGN_REFERENCE §Queue Dispatch Config, §Queue Routing Rules
 */
import { ref, onMounted } from 'vue'
import {
  Network,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  ArrowRightLeft,
  CheckCircle2,
  Circle,
} from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useAsync } from '@/composables/useAsync'
import {
  listDispatch,
  deleteDispatch,
  listRoutingRules,
  deleteRoutingRule,
} from '@/api/queues'
import { errorMessage } from '@/api/errors'
import { formatRelative, formatDateTime } from '@/lib/format'
import type { QueueDispatchConfig, QueueRoutingRule } from '@/api/types/queues'
import type { Column } from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Badge from '@/components/ui/Badge.vue'
import Tabs from '@/components/ui/Tabs.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import DispatchFormModal from '@/components/workers/DispatchFormModal.vue'
import RoutingRuleFormModal from '@/components/workers/RoutingRuleFormModal.vue'

const ui = useUiStore()
const conn = useConnectionStore()

// --- tabs ---
const activeTab = ref('dispatch')
const tabItems = [
  { key: 'dispatch', label: 'Dispatch Config' },
  { key: 'rules', label: 'Routing Rules' },
]

// --- dispatch ---
const dispatchList = useAsync((signal) =>
  listDispatch({ tenant_id: conn.tenantId || undefined }, signal),
)
const { data: configs, loading: configsLoading, error: configsError, errorText: configsErrorText } = dispatchList

const showDispatchModal = ref(false)
const editingConfig = ref<QueueDispatchConfig | null>(null)

function openCreateDispatch() {
  editingConfig.value = null
  showDispatchModal.value = true
}

function openEditDispatch(cfg: QueueDispatchConfig) {
  editingConfig.value = cfg
  showDispatchModal.value = true
}

async function handleDeleteDispatch(cfg: QueueDispatchConfig) {
  const ok = await ui.confirm({
    title: `Delete dispatch config for "${cfg.queue_name}"?`,
    message: `This will revert queue "${cfg.queue_name}" to the default poll mode. Workers will need to poll manually.`,
    tone: 'danger',
    confirmText: 'Delete config',
  })
  if (!ok) return
  try {
    await deleteDispatch(cfg.tenant_id, cfg.queue_name)
    ui.success('Dispatch config deleted', cfg.queue_name)
    void dispatchList.run()
  } catch (e) {
    ui.error('Delete failed', errorMessage(e))
  }
}

function onDispatchSaved() {
  void dispatchList.run()
}

// --- routing rules ---
const rulesList = useAsync((signal) =>
  listRoutingRules({ tenant_id: conn.tenantId || undefined }, signal),
)
const { data: rules, loading: rulesLoading, error: rulesError, errorText: rulesErrorText } = rulesList

const showRuleModal = ref(false)

async function handleDeleteRule(rule: QueueRoutingRule) {
  const ok = await ui.confirm({
    title: `Delete routing rule for "${rule.handler_name}"?`,
    message: `Tasks handled by "${rule.handler_name}" will no longer be routed to "${rule.queue_override}".`,
    tone: 'danger',
    confirmText: 'Delete rule',
  })
  if (!ok) return
  try {
    await deleteRoutingRule(rule.id)
    ui.success('Routing rule deleted', rule.handler_name)
    void rulesList.run()
  } catch (e) {
    ui.error('Delete failed', errorMessage(e))
  }
}

function onRuleCreated() {
  void rulesList.run()
}

// --- refresh all ---
function refreshAll() {
  void dispatchList.run()
  void rulesList.run()
}

onMounted(() => {
  void dispatchList.run()
  void rulesList.run()
})

// --- dispatch table columns ---
const dispatchColumns: Column[] = [
  { key: 'queue_name', header: 'Queue Name', mono: true },
  { key: 'tenant_id', header: 'Tenant', mono: true, width: '160px' },
  { key: 'mode', header: 'Mode', width: '90px' },
  { key: 'push_url', header: 'Push URL' },
  { key: 'updated_at', header: 'Updated', width: '140px' },
  { key: '_actions', header: '', width: '90px', align: 'right' },
]

// --- routing rules table columns ---
const ruleColumns: Column[] = [
  { key: 'handler_name', header: 'Handler', mono: true },
  { key: 'match_queue', header: 'Match Queue', mono: true, width: '160px' },
  { key: 'queue_override', header: 'Target Queue', mono: true, width: '160px' },
  { key: 'priority', header: 'Priority', width: '80px', align: 'right' },
  { key: 'enabled', header: 'Enabled', width: '85px' },
  { key: 'updated_at', header: 'Updated', width: '140px' },
  { key: '_actions', header: '', width: '60px', align: 'right' },
]
</script>

<template>
  <div>
    <PageHeader
      title="Queues"
      description="Configure queue dispatch mode (poll vs push) and routing rules that redirect tasks at enqueue time."
      :icon="Network"
    >
      <template #actions>
        <IconButton label="Refresh" @click="refreshAll">
          <RefreshCw :size="16" :class="(configsLoading || rulesLoading) && 'animate-spin'" />
        </IconButton>
        <Button
          v-show="activeTab === 'dispatch'"
          variant="primary"
          @click="openCreateDispatch"
        >
          <template #icon><Plus :size="15" /></template>
          New config
        </Button>
        <Button
          v-show="activeTab === 'rules'"
          variant="primary"
          @click="showRuleModal = true"
        >
          <template #icon><Plus :size="15" /></template>
          New rule
        </Button>
      </template>
    </PageHeader>

    <!-- Tab navigation -->
    <Tabs :tabs="tabItems" v-model="activeTab" class="mb-5" />

    <!-- ========== DISPATCH TAB ========== -->
    <div v-show="activeTab === 'dispatch'">
      <div
        v-if="configsError"
        class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
      >
        {{ configsErrorText }}
        <button class="ml-2 underline" @click="dispatchList.run()">Retry</button>
      </div>

      <DataTable
        :columns="dispatchColumns"
        :rows="configs ?? []"
        :row-key="(r) => `${r.tenant_id}::${r.queue_name}`"
        :loading="configsLoading"
        empty-title="No dispatch configs"
        empty-description="All queues default to poll mode. Create a dispatch config to switch a queue to push delivery."
      >
        <template #cell-queue_name="{ row }">
          <span class="mono text-[12px] font-medium text-text">{{ row.queue_name }}</span>
        </template>

        <template #cell-tenant_id="{ row }">
          <span class="mono text-[12px] text-subtle">{{ row.tenant_id }}</span>
        </template>

        <template #cell-mode="{ row }">
          <Badge :tone="row.mode === 'push' ? 'accent' : 'neutral'">
            <ArrowRightLeft v-if="row.mode === 'push'" :size="10" />
            {{ row.mode }}
          </Badge>
        </template>

        <template #cell-push_url="{ row }">
          <span v-if="row.push_url" class="mono text-[12px] text-text">{{ row.push_url }}</span>
          <span v-else class="text-[12px] text-subtle">—</span>
        </template>

        <template #cell-updated_at="{ row }">
          <Tooltip :text="formatDateTime(row.updated_at)">
            <span class="text-[12px] text-subtle">{{ formatRelative(row.updated_at) }}</span>
          </Tooltip>
        </template>

        <template #cell-_actions="{ row }">
          <div class="flex items-center justify-end gap-1">
            <IconButton label="Edit dispatch config" size="sm" @click.stop="openEditDispatch(row)">
              <Pencil :size="13" />
            </IconButton>
            <IconButton
              label="Delete dispatch config"
              size="sm"
              variant="danger"
              @click.stop="handleDeleteDispatch(row)"
            >
              <Trash2 :size="13" />
            </IconButton>
          </div>
        </template>
      </DataTable>
    </div>

    <!-- ========== ROUTING RULES TAB ========== -->
    <div v-show="activeTab === 'rules'">
      <div
        v-if="rulesError"
        class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
      >
        {{ rulesErrorText }}
        <button class="ml-2 underline" @click="rulesList.run()">Retry</button>
      </div>

      <DataTable
        :columns="ruleColumns"
        :rows="rules ?? []"
        :row-key="(r) => r.id"
        :loading="rulesLoading"
        empty-title="No routing rules"
        empty-description="Routing rules redirect tasks to specific queues at enqueue time. Higher priority rules are evaluated first."
      >
        <template #cell-handler_name="{ row }">
          <span class="mono text-[12px] font-medium text-text">{{ row.handler_name }}</span>
        </template>

        <template #cell-match_queue="{ row }">
          <span v-if="row.match_queue" class="mono text-[12px] text-text">{{ row.match_queue }}</span>
          <span v-else class="text-[12px] text-subtle">any</span>
        </template>

        <template #cell-queue_override="{ row }">
          <Badge tone="purple">
            <ArrowRightLeft :size="10" />
            {{ row.queue_override }}
          </Badge>
        </template>

        <template #cell-priority="{ row }">
          <span class="mono text-[12.5px] font-medium text-text">{{ row.priority }}</span>
        </template>

        <template #cell-enabled="{ row }">
          <span class="flex items-center gap-1.5">
            <CheckCircle2 v-if="row.enabled" :size="13" class="text-success" />
            <Circle v-else :size="13" class="text-subtle" />
            <span class="text-[12.5px]" :class="row.enabled ? 'text-success' : 'text-subtle'">
              {{ row.enabled ? 'Active' : 'Off' }}
            </span>
          </span>
        </template>

        <template #cell-updated_at="{ row }">
          <Tooltip :text="formatDateTime(row.updated_at)">
            <span class="text-[12px] text-subtle">{{ formatRelative(row.updated_at) }}</span>
          </Tooltip>
        </template>

        <template #cell-_actions="{ row }">
          <div class="flex items-center justify-end">
            <IconButton
              label="Delete routing rule"
              size="sm"
              variant="danger"
              @click.stop="handleDeleteRule(row)"
            >
              <Trash2 :size="13" />
            </IconButton>
          </div>
        </template>
      </DataTable>
    </div>

    <!-- Dispatch config modal -->
    <DispatchFormModal
      v-model:open="showDispatchModal"
      :existing="editingConfig"
      :tenant-id="conn.tenantId"
      @saved="onDispatchSaved"
    />

    <!-- Routing rule modal -->
    <RoutingRuleFormModal
      v-model:open="showRuleModal"
      :tenant-id="conn.tenantId"
      @created="onRuleCreated"
    />
  </div>
</template>
