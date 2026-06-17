<script setup lang="ts">
/**
 * Rollback Policies operator console.
 *
 * Features:
 *  - List rollback policies with error-rate threshold + window
 *  - Create policy (modal with validated fields)
 *  - Delete policy (confirm)
 *
 * DESIGN_REFERENCE §Rollback Policies — ops-resilience.md §2
 */
import { ref, onMounted } from 'vue'
import { Undo2, Plus, Trash2, RefreshCw } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useAsync } from '@/composables/useAsync'
import { listRollbackPolicies, deleteRollbackPolicy } from '@/api/rollback'
import { errorMessage } from '@/api/errors'
import { formatDateTime, formatRelative, formatPercent } from '@/lib/format'
import type { RollbackPolicy } from '@/api/types/ops'
import type { Column } from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Badge from '@/components/ui/Badge.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import RollbackPolicyModal from '@/components/ops/RollbackPolicyModal.vue'

const ui = useUiStore()

const showCreate = ref(false)

const list = useAsync((signal) => listRollbackPolicies(undefined, signal))
const { data: policies, loading, error, errorText } = list

onMounted(() => {
  void list.run()
})

const columns: Column[] = [
  { key: 'sequence_name', header: 'Sequence', mono: true },
  { key: 'enabled', header: 'Status', width: '100px' },
  { key: 'error_rate_threshold', header: 'Threshold', width: '110px', align: 'right' },
  { key: 'time_window_secs', header: 'Window', width: '100px', align: 'right' },
  { key: 'cooldown_secs', header: 'Cooldown', width: '100px', align: 'right' },
  { key: 'confirmation_window_secs', header: 'Confirm', width: '100px', align: 'right' },
  { key: 'webhook_url', header: 'Alert Webhook', width: '180px' },
  { key: 'updated_at', header: 'Updated', width: '150px' },
  { key: '_actions', header: '', width: '60px', align: 'right' },
]

async function handleDelete(policy: RollbackPolicy) {
  const ok = await ui.confirm({
    title: `Delete policy for "${policy.sequence_name}"?`,
    message: 'This rollback policy will no longer monitor the error rate for this sequence. In-progress evaluations are stopped.',
    tone: 'danger',
    confirmText: 'Delete policy',
  })
  if (!ok) return
  try {
    await deleteRollbackPolicy(policy.sequence_name, policy.tenant_id)
    ui.success('Policy deleted', policy.sequence_name)
    void list.run()
  } catch (e) {
    ui.error('Delete failed', errorMessage(e))
  }
}

function onCreated() {
  void list.run()
}
</script>

<template>
  <div>
    <PageHeader
      title="Rollback Policies"
      description="Auto-rollback policies that monitor sequence error rates and trigger a rollback when the configured threshold is breached."
      :icon="Undo2"
    >
      <template #actions>
        <IconButton label="Refresh policies" @click="list.run()">
          <RefreshCw :size="16" :class="loading && 'animate-spin'" />
        </IconButton>
        <Button variant="primary" @click="showCreate = true">
          <template #icon><Plus :size="15" /></template>
          New policy
        </Button>
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
      :rows="policies ?? []"
      :row-key="(r) => String(r.id)"
      :loading="loading"
      empty-title="No rollback policies"
      empty-description="Create a policy to automatically roll back a sequence when its error rate exceeds a threshold."
    >
      <template #cell-sequence_name="{ row }">
        <span class="mono text-[12px] font-medium text-text">{{ row.sequence_name }}</span>
      </template>

      <template #cell-enabled="{ row }">
        <Badge :tone="row.enabled ? 'success' : 'neutral'">
          {{ row.enabled ? 'Active' : 'Disabled' }}
        </Badge>
      </template>

      <template #cell-error_rate_threshold="{ row }">
        <span class="font-medium text-warning">{{ formatPercent(row.error_rate_threshold) }}</span>
      </template>

      <template #cell-time_window_secs="{ row }">
        <span class="text-subtle">{{ row.time_window_secs }}s</span>
      </template>

      <template #cell-cooldown_secs="{ row }">
        <span class="text-subtle">{{ row.cooldown_secs }}s</span>
      </template>

      <template #cell-confirmation_window_secs="{ row }">
        <span class="text-subtle">
          {{ row.confirmation_window_secs === 0 ? 'immediate' : `${row.confirmation_window_secs}s` }}
        </span>
      </template>

      <template #cell-webhook_url="{ row }">
        <Tooltip v-if="row.webhook_url" :text="row.webhook_url">
          <span class="mono max-w-[160px] truncate text-[11px] text-info">{{ row.webhook_url }}</span>
        </Tooltip>
        <span v-else class="text-subtle">—</span>
      </template>

      <template #cell-updated_at="{ row }">
        <Tooltip :text="formatDateTime(row.updated_at)">
          <span class="text-[12px] text-subtle">{{ formatRelative(row.updated_at) }}</span>
        </Tooltip>
      </template>

      <template #cell-_actions="{ row }">
        <div class="flex items-center justify-end">
          <IconButton
            label="Delete policy"
            size="sm"
            variant="danger"
            @click.stop="handleDelete(row)"
          >
            <Trash2 :size="13" />
          </IconButton>
        </div>
      </template>
    </DataTable>

    <RollbackPolicyModal v-model:open="showCreate" @created="onCreated" />
  </div>
</template>
