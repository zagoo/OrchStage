<script setup lang="ts">
/**
 * Cron schedules list view.
 * Features: list, create, edit, delete, next-fire column.
 * DESIGN_REFERENCE §Cron Schedules
 */
import { ref, onMounted } from 'vue'
import { CalendarClock, Plus, Trash2, Pencil, RefreshCw, Clock } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { listCron, deleteCron, getCron } from '@/api/cron'
import { errorMessage } from '@/api/errors'
import { formatRelative, formatDateTime, titleCase } from '@/lib/format'
import type { CronSchedule, OverlapPolicy } from '@/api/types/cron'
import type { BadgeTone } from '@/components/ui/Badge.vue'
import type { Column } from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Badge from '@/components/ui/Badge.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import CronFormModal from '@/components/triggers/CronFormModal.vue'
import NextFiresPreview from '@/components/triggers/NextFiresPreview.vue'

const ui = useUiStore()
const conn = useConnectionStore()

const showCreate = ref(false)
const editTarget = ref<CronSchedule | null>(null)
const showEdit = ref(false)
const expandedId = ref<string | null>(null)

const list = useAsync((signal) =>
  listCron({ tenant_id: conn.tenantId || undefined, limit: 200 }, signal),
)
const { data: schedules, loading, error, errorText } = list

const polling = usePolling(list.run, { intervalMs: 15_000, immediate: false })

onMounted(() => {
  void list.run()
  polling.start()
})

const columns: Column[] = [
  { key: 'cron_expr', header: 'Expression', width: '200px', mono: true },
  { key: 'timezone', header: 'Timezone', width: '180px', mono: true },
  { key: 'overlap_policy', header: 'Overlap', width: '140px' },
  { key: 'next_fire_at', header: 'Next fire', width: '160px' },
  { key: 'enabled', header: 'State', width: '90px' },
  { key: 'last_triggered_at', header: 'Last fired', width: '140px' },
  { key: '_actions', header: '', width: '110px', align: 'right' },
]

const overlapTone: Record<OverlapPolicy, BadgeTone> = {
  allow: 'neutral',
  skip: 'warning',
  buffer_one: 'info',
  cancel_previous: 'danger',
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

async function openEdit(schedule: CronSchedule) {
  // Re-fetch for freshest data
  try {
    const fresh = await getCron(schedule.id)
    editTarget.value = fresh
  } catch {
    editTarget.value = schedule
  }
  showEdit.value = true
}

async function handleDelete(schedule: CronSchedule) {
  const ok = await ui.confirm({
    title: 'Delete cron schedule?',
    message: `This will permanently delete schedule ${schedule.id}. Running instances created by it are not affected.`,
    tone: 'danger',
    confirmText: 'Delete schedule',
  })
  if (!ok) return
  try {
    await deleteCron(schedule.id)
    ui.success('Schedule deleted')
    void list.run()
  } catch (e) {
    ui.error('Delete failed', errorMessage(e))
  }
}

function onCreated() {
  void list.run()
}

function onUpdated() {
  showEdit.value = false
  void list.run()
}
</script>

<template>
  <div>
    <PageHeader
      title="Cron Schedules"
      description="Recurring calendar-driven workflows with timezone-aware scheduling and overlap control."
      :icon="CalendarClock"
    >
      <template #actions>
        <IconButton label="Refresh schedules" @click="list.run()">
          <RefreshCw :size="16" :class="loading && 'animate-spin'" />
        </IconButton>
        <Button variant="primary" @click="showCreate = true">
          <template #icon><Plus :size="15" /></template>
          New schedule
        </Button>
      </template>
    </PageHeader>

    <div v-if="error" class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger">
      {{ errorText }}
      <button class="ml-2 underline" @click="list.run()">Retry</button>
    </div>

    <DataTable
      :columns="columns"
      :rows="schedules ?? []"
      :row-key="(r) => r.id"
      :loading="loading"
      :clickable="true"
      empty-title="No cron schedules"
      empty-description="Create a schedule to automatically launch workflow instances on a calendar cadence."
      @row-click="(r) => toggleExpand(r.id)"
    >
      <template #cell-cron_expr="{ row }">
        <span class="mono text-[12px]">{{ row.cron_expr }}</span>
      </template>

      <template #cell-overlap_policy="{ row }">
        <Badge :tone="overlapTone[row.overlap_policy]">{{ titleCase(row.overlap_policy) }}</Badge>
      </template>

      <template #cell-next_fire_at="{ row }">
        <span v-if="row.next_fire_at" :title="formatDateTime(row.next_fire_at)" class="flex items-center gap-1 text-[12.5px]">
          <Clock :size="12" class="text-subtle" />
          {{ formatRelative(row.next_fire_at) }}
        </span>
        <span v-else class="text-subtle">—</span>
      </template>

      <template #cell-enabled="{ row }">
        <span class="flex items-center gap-1.5">
          <StatusDot :tone="row.enabled ? 'success' : 'neutral'" />
          <span class="text-[12.5px]">{{ row.enabled ? 'Active' : 'Off' }}</span>
        </span>
      </template>

      <template #cell-last_triggered_at="{ row }">
        <span v-if="row.last_triggered_at" :title="formatDateTime(row.last_triggered_at)" class="text-subtle text-[12.5px]">
          {{ formatRelative(row.last_triggered_at) }}
        </span>
        <span v-else class="text-subtle">—</span>
      </template>

      <template #cell-_actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <IconButton label="Edit schedule" size="sm" @click.stop="openEdit(row)">
            <Pencil :size="14" />
          </IconButton>
          <IconButton label="Delete schedule" size="sm" variant="danger" @click.stop="handleDelete(row)">
            <Trash2 :size="14" />
          </IconButton>
        </div>
      </template>
    </DataTable>

    <!-- Expanded row: next fires preview -->
    <template v-if="schedules">
      <template v-for="s in schedules" :key="`expand-${s.id}`">
        <Transition name="fade">
          <div
            v-if="expandedId === s.id"
            class="mt-0.5 rounded-b-lg border border-t-0 border-border bg-surface-2 px-4 py-3"
          >
            <div class="mb-2 flex items-center gap-2 text-[12px] text-muted">
              <span class="mono font-semibold">{{ s.id }}</span>
              <span class="text-faint">·</span>
              <span>Sequence: <span class="mono">{{ s.sequence_id }}</span></span>
              <span v-if="s.skipped_fires > 0" class="ml-auto">
                <Badge tone="warning">{{ s.skipped_fires }} skipped</Badge>
              </span>
            </div>
            <NextFiresPreview :cron-id="s.id" />
          </div>
        </Transition>
      </template>
    </template>

    <CronFormModal
      v-model:open="showCreate"
      :schedule="null"
      @created="onCreated"
    />

    <CronFormModal
      v-model:open="showEdit"
      :schedule="editTarget"
      @updated="onUpdated"
    />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
