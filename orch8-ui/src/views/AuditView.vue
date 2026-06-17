<script setup lang="ts">
/**
 * Audit — Per-instance audit log viewer.
 * Wires: GET /api/v1/instances/{id}/audit
 *
 * NOTE: There is no global audit-log list endpoint. This view requires the
 * operator to enter a workflow instance ID. Audit entries are returned newest-
 * first, hard-capped at 200 entries per instance (no server-side pagination).
 * DESIGN_REFERENCE §Audit (observability.md / instances-advanced.md §GET /api/v1/instances/{id}/audit)
 */
import { ref, computed } from 'vue'
import { ScrollText, Search } from 'lucide-vue-next'
import { useAsync } from '@/composables/useAsync'
import { listInstanceAuditLog } from '@/api/audit'
import type { AuditLogEntry } from '@/api/types/observability'
import type { Column } from '@/components/ui/DataTable.vue'
import type { SelectOption } from '@/components/ui/Select.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Badge from '@/components/ui/Badge.vue'
import Select from '@/components/ui/Select.vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import AuditDetailDrawer from '@/components/observability/AuditDetailDrawer.vue'
import { formatRelative, formatDateTime, titleCase } from '@/lib/format'
import type { BadgeTone } from '@/components/ui/Badge.vue'

// --- instance id input ---
const instanceIdInput = ref('')
const lastFetchedId = ref('')

const auditAsync = useAsync((signal) =>
  listInstanceAuditLog(instanceIdInput.value.trim(), signal),
)
const { data, loading, error, errorText } = auditAsync

function loadAudit() {
  const id = instanceIdInput.value.trim()
  if (!id) return
  lastFetchedId.value = id
  void auditAsync.run()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') loadAudit()
}

// --- event-type filter ---
const eventTypeFilter = ref('')
const eventTypeOptions = computed<SelectOption[]>(() => {
  const seen = new Set<string>()
  for (const e of data.value ?? []) seen.add(e.event_type)
  return [
    { value: '', label: 'All event types' },
    ...[...seen].sort().map((t) => ({ value: t, label: titleCase(t) })),
  ]
})

// --- filtered rows ---
const filteredRows = computed<AuditLogEntry[]>(() => {
  const rows = data.value ?? []
  if (!eventTypeFilter.value) return rows
  return rows.filter((r) => r.event_type === eventTypeFilter.value)
})

// --- drawer ---
const selectedEntry = ref<AuditLogEntry | null>(null)
const drawerOpen = ref(false)

function openEntry(entry: AuditLogEntry) {
  selectedEntry.value = entry
  drawerOpen.value = true
}

// --- badge tone ---
const eventTypeTone: Record<string, BadgeTone> = {
  state_transition: 'info',
  step_completed: 'success',
  step_failed: 'danger',
  signal_received: 'purple',
  instance_created: 'accent',
  instance_cancelled: 'neutral',
  instance_failed: 'danger',
  checkpoint_saved: 'teal',
  retry_scheduled: 'warning',
}
function tonFor(t: string): BadgeTone {
  return eventTypeTone[t] ?? 'neutral'
}

// --- table ---
const columns: Column[] = [
  { key: 'event_type', header: 'Event', width: '200px' },
  { key: 'block_id', header: 'Block', mono: true, width: '160px' },
  { key: 'state_change', header: 'State change', width: '180px' },
  { key: 'created_at', header: 'Time', width: '130px' },
]

function rowKey(r: AuditLogEntry): string { return r.id }
</script>

<template>
  <div>
    <PageHeader
      title="Audit Log"
      description="Per-instance workflow audit trail. Enter a workflow instance ID to load its events (newest-first, max 200)."
      :icon="ScrollText"
    />

    <!-- per-instance notice -->
    <div class="mb-4 rounded-lg border border-info/30 bg-info-soft px-4 py-2.5 text-[12.5px] text-info">
      No global audit-log endpoint exists. Audit entries are scoped to a single workflow instance.
      Enter the instance UUID below to inspect its trail.
    </div>

    <!-- lookup controls -->
    <Panel title="Look up instance" class="mb-5">
      <div class="flex items-center gap-3">
        <Input
          v-model="instanceIdInput"
          placeholder="Instance UUID (e.g. 01950000-…)"
          class="flex-1 mono"
          aria-label="Workflow instance ID"
          @keydown="handleKeydown"
        />
        <Select
          v-if="data && data.length"
          v-model="eventTypeFilter"
          :options="eventTypeOptions"
          class="w-52"
          aria-label="Filter by event type"
        />
        <Button variant="primary" :disabled="!instanceIdInput.trim()" @click="loadAudit">
          <template #icon><Search :size="14" /></template>
          Load audit
        </Button>
      </div>
    </Panel>

    <!-- error -->
    <div
      v-if="error"
      class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
    >
      {{ errorText }}
      <button class="ml-2 underline" @click="loadAudit">Retry</button>
    </div>

    <!-- initial empty state -->
    <EmptyState
      v-if="!data && !loading && !error"
      title="No instance selected"
      description="Enter a workflow instance UUID above to load its audit log."
      :icon="ScrollText"
    />

    <!-- table -->
    <DataTable
      v-else
      :columns="columns"
      :rows="filteredRows"
      :row-key="rowKey"
      :loading="loading"
      :clickable="true"
      :empty-title="data && data.length && filteredRows.length === 0 ? 'No matching events' : 'No audit entries'"
      :empty-description="
        data && data.length && filteredRows.length === 0
          ? 'Change the event-type filter to see more events.'
          : lastFetchedId
          ? `Instance ${lastFetchedId} has no recorded audit events.`
          : ''
      "
      @row-click="openEntry"
    >
      <template #cell-event_type="{ row }">
        <Badge :tone="tonFor(row.event_type)">{{ titleCase(row.event_type) }}</Badge>
      </template>

      <template #cell-block_id="{ row }">
        <span class="mono text-[11.5px] text-muted">{{ row.block_id ?? '—' }}</span>
      </template>

      <template #cell-state_change="{ row }">
        <span v-if="row.from_state || row.to_state" class="flex items-center gap-1.5 mono text-[11.5px]">
          <Badge v-if="row.from_state" tone="neutral">{{ row.from_state }}</Badge>
          <span v-if="row.from_state && row.to_state" class="text-subtle">→</span>
          <Badge v-if="row.to_state" tone="info">{{ row.to_state }}</Badge>
        </span>
        <span v-else class="text-subtle">—</span>
      </template>

      <template #cell-created_at="{ row }">
        <Tooltip :text="formatDateTime(row.created_at)">
          <span class="text-[12px] text-subtle">{{ formatRelative(row.created_at) }}</span>
        </Tooltip>
      </template>
    </DataTable>

    <!-- detail drawer -->
    <AuditDetailDrawer v-model:open="drawerOpen" :entry="selectedEntry" />
  </div>
</template>
