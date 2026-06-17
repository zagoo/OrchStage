<script setup lang="ts">
/**
 * Audit tab — immutable audit log entries (newest-first, cap 200).
 * DESIGN_REFERENCE §Instances §GET /instances/{id}/audit
 */
import { onMounted } from 'vue'
import { RefreshCw, ShieldCheck } from 'lucide-vue-next'
import { useAsync } from '@/composables/useAsync'
import { listAuditLog } from '@/api/instancesAdvanced'
import { formatRelative, formatDateTime, prettyJson } from '@/lib/format'
import type { AuditLogEntry } from '@/api/types/instancesAdvanced'
import type { Column } from '@/components/ui/DataTable.vue'
import Panel from '@/components/ui/Panel.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Badge from '@/components/ui/Badge.vue'
import CodeBlock from '@/components/ui/CodeBlock.vue'
import Modal from '@/components/ui/Modal.vue'
import { ref } from 'vue'

const props = defineProps<{ instanceId: string }>()

const loader = useAsync((signal) => listAuditLog(props.instanceId, signal))
const { data: entries, loading, error } = loader

const selectedEntry = ref<AuditLogEntry | null>(null)
const showDetail = ref(false)

onMounted(() => void loader.run())

const columns: Column[] = [
  { key: 'created_at', header: 'Time',       width: '170px' },
  { key: 'event_type', header: 'Event',      width: '200px' },
  { key: 'from_to',    header: 'Transition', width: '180px' },
  { key: 'block_id',   header: 'Block',      mono: true },
]

const EVENT_TONE: Record<string, string> = {
  state_transition: 'accent',
  step_completed:   'success',
  step_failed:      'danger',
  signal_received:  'purple',
}

function openDetail(row: AuditLogEntry) {
  selectedEntry.value = row
  showDetail.value = true
}
</script>

<template>
  <Panel>
    <template #header>
      <div class="flex items-center gap-2">
        <ShieldCheck :size="15" class="text-muted" />
        <span class="text-[13px] font-semibold text-text">Audit Log</span>
        <span class="text-[12px] text-subtle">(newest first · max 200)</span>
      </div>
    </template>
    <template #actions>
      <IconButton label="Refresh audit log" size="sm" @click="loader.run()">
        <RefreshCw :size="13" :class="loading && 'animate-spin'" />
      </IconButton>
    </template>

    <div
      v-if="error"
      class="mb-3 rounded border border-danger/30 bg-danger-soft p-3 text-[12.5px] text-danger"
    >
      {{ error.message }}
      <button class="ml-2 underline" @click="loader.run()">Retry</button>
    </div>

    <DataTable
      :columns="columns"
      :rows="entries ?? []"
      :row-key="(r) => r.id"
      :loading="loading"
      :clickable="true"
      empty-title="No audit entries"
      empty-description="No audit log entries found. Audit logging may not be enabled for this deployment."
      @row-click="openDetail"
    >
      <template #cell-created_at="{ row }">
        <span :title="formatDateTime(row.created_at)" class="text-subtle">
          {{ formatRelative(row.created_at) }}
        </span>
      </template>

      <template #cell-event_type="{ row }">
        <Badge
          :tone="(EVENT_TONE[row.event_type] ?? 'neutral') as 'accent' | 'success' | 'danger' | 'purple' | 'neutral'"
          class="text-[11px]"
        >
          {{ row.event_type }}
        </Badge>
      </template>

      <template #cell-from_to="{ row }">
        <div v-if="row.from_state || row.to_state" class="flex items-center gap-1 text-[12px]">
          <span v-if="row.from_state" class="text-subtle">{{ row.from_state }}</span>
          <span v-if="row.from_state && row.to_state" class="text-faint">→</span>
          <span v-if="row.to_state" class="text-text">{{ row.to_state }}</span>
        </div>
        <span v-else class="text-faint">—</span>
      </template>

      <template #cell-block_id="{ row }">
        <span v-if="row.block_id" class="mono text-[12px]">{{ row.block_id }}</span>
        <span v-else class="text-faint">—</span>
      </template>
    </DataTable>
  </Panel>

  <!-- Detail modal -->
  <Modal v-if="selectedEntry" v-model:open="showDetail" title="Audit Entry Details" size="md">
    <dl class="divide-y divide-border">
      <div class="flex justify-between py-2">
        <dt class="text-[12.5px] text-subtle">ID</dt>
        <dd class="mono text-[12px] text-text">{{ selectedEntry.id }}</dd>
      </div>
      <div class="flex justify-between py-2">
        <dt class="text-[12.5px] text-subtle">Event</dt>
        <dd class="text-[13px] text-text">{{ selectedEntry.event_type }}</dd>
      </div>
      <div v-if="selectedEntry.from_state || selectedEntry.to_state" class="flex justify-between py-2">
        <dt class="text-[12.5px] text-subtle">Transition</dt>
        <dd class="text-[13px] text-text">
          {{ selectedEntry.from_state ?? '—' }} → {{ selectedEntry.to_state ?? '—' }}
        </dd>
      </div>
      <div v-if="selectedEntry.block_id" class="flex justify-between py-2">
        <dt class="text-[12.5px] text-subtle">Block</dt>
        <dd class="mono text-[12px] text-text">{{ selectedEntry.block_id }}</dd>
      </div>
      <div class="flex justify-between py-2">
        <dt class="text-[12.5px] text-subtle">Time</dt>
        <dd class="text-[13px] text-text">{{ formatDateTime(selectedEntry.created_at) }}</dd>
      </div>
    </dl>
    <div class="mt-3">
      <p class="mb-1.5 text-[12.5px] text-subtle">Details</p>
      <CodeBlock :content="prettyJson(selectedEntry.details)" language="json" />
    </div>
  </Modal>
</template>
