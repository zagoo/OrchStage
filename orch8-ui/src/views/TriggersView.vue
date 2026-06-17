<script setup lang="ts">
/**
 * Triggers list view.
 * Features: list, search by slug, create, fire, delete, detail drawer.
 * DESIGN_REFERENCE §Triggers
 */
import { ref, computed, onMounted } from 'vue'
import { Zap, Plus, Trash2, Eye, Flame, RefreshCw } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { listTriggers, deleteTrigger } from '@/api/triggers'
import { errorMessage } from '@/api/errors'
import { titleCase, formatRelative, formatDateTime } from '@/lib/format'
import type { TriggerDef, TriggerType } from '@/api/types/triggers'
import type { BadgeTone } from '@/components/ui/Badge.vue'
import type { Column } from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import Badge from '@/components/ui/Badge.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import TriggerFormModal from '@/components/triggers/TriggerFormModal.vue'
import FireTriggerModal from '@/components/triggers/FireTriggerModal.vue'
import TriggerDetailDrawer from '@/components/triggers/TriggerDetailDrawer.vue'

const ui = useUiStore()
const conn = useConnectionStore()

const search = ref('')
const showCreate = ref(false)
const fireTarget = ref<TriggerDef | null>(null)
const detailTarget = ref<TriggerDef | null>(null)
const showDetail = ref(false)
const showFire = ref(false)

const list = useAsync((signal) =>
  listTriggers({ tenant_id: conn.tenantId || undefined, limit: 200 }, signal),
)
const { data: triggers, loading, error, errorText } = list

const polling = usePolling(list.run, { intervalMs: 10_000, immediate: false })

onMounted(() => {
  void list.run()
  polling.start()
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (triggers.value ?? []).filter((t) =>
    !q || t.slug.includes(q) || t.sequence_name.toLowerCase().includes(q),
  )
})

const columns: Column[] = [
  { key: 'slug', header: 'Slug', width: '220px', mono: true },
  { key: 'trigger_type', header: 'Type', width: '160px' },
  { key: 'sequence_name', header: 'Sequence' },
  { key: 'namespace', header: 'Namespace', width: '120px', mono: true },
  { key: 'enabled', header: 'State', width: '90px' },
  { key: 'updated_at', header: 'Updated', width: '150px' },
  { key: '_actions', header: '', width: '100px', align: 'right' },
]

const typeTone: Record<TriggerType, BadgeTone> = {
  webhook: 'accent',
  event: 'purple',
  nats: 'cyan',
  file_watch: 'teal',
  activepieces_poll: 'pink',
}

function openDetail(trigger: TriggerDef) {
  detailTarget.value = trigger
  showDetail.value = true
}

function openFire(trigger: TriggerDef) {
  fireTarget.value = trigger
  showFire.value = true
}

async function handleDelete(trigger: TriggerDef) {
  const ok = await ui.confirm({
    title: `Delete trigger "${trigger.slug}"?`,
    message: 'Deleting this trigger will stop it from creating new instances. Running instances are not affected.',
    tone: 'danger',
    confirmText: 'Delete trigger',
  })
  if (!ok) return
  try {
    await deleteTrigger(trigger.slug)
    ui.success('Trigger deleted', trigger.slug)
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
      title="Triggers"
      description="Named event sources that create workflow instances on demand."
      :icon="Zap"
    >
      <template #actions>
        <IconButton label="Refresh triggers" @click="list.run()">
          <RefreshCw :size="16" :class="loading && 'animate-spin'" />
        </IconButton>
        <Button variant="primary" @click="showCreate = true">
          <template #icon><Plus :size="15" /></template>
          New trigger
        </Button>
      </template>
    </PageHeader>

    <div class="mb-4 flex items-center gap-3">
      <SearchInput v-model="search" placeholder="Search by slug or sequence…" class="max-w-sm" />
      <span v-if="triggers" class="text-[13px] text-subtle">
        {{ filtered.length }} / {{ triggers.length }}
      </span>
    </div>

    <div v-if="error" class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger">
      {{ errorText }}
      <button class="ml-2 underline" @click="list.run()">Retry</button>
    </div>

    <DataTable
      :columns="columns"
      :rows="filtered"
      :row-key="(r) => r.slug"
      :loading="loading"
      :clickable="true"
      empty-title="No triggers"
      empty-description="Create a trigger to start receiving events and launching workflow instances."
      @row-click="openDetail"
    >
      <template #cell-slug="{ row }">
        <span class="mono text-[12px] text-text">{{ row.slug }}</span>
      </template>

      <template #cell-trigger_type="{ row }">
        <Badge :tone="typeTone[row.trigger_type] ?? 'neutral'">
          {{ titleCase(row.trigger_type) }}
        </Badge>
      </template>

      <template #cell-enabled="{ row }">
        <span class="flex items-center gap-1.5">
          <StatusDot :tone="row.enabled ? 'success' : 'neutral'" />
          <span class="text-[12.5px]">{{ row.enabled ? 'Active' : 'Off' }}</span>
        </span>
      </template>

      <template #cell-updated_at="{ row }">
        <span :title="formatDateTime(row.updated_at)" class="text-subtle">
          {{ formatRelative(row.updated_at) }}
        </span>
      </template>

      <template #cell-_actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <IconButton label="View detail" size="sm" @click.stop="openDetail(row)">
            <Eye :size="14" />
          </IconButton>
          <IconButton label="Fire trigger" size="sm" @click.stop="openFire(row)" :disabled="!row.enabled">
            <Flame :size="14" />
          </IconButton>
          <IconButton label="Delete trigger" size="sm" variant="danger" @click.stop="handleDelete(row)">
            <Trash2 :size="14" />
          </IconButton>
        </div>
      </template>
    </DataTable>

    <TriggerFormModal v-model:open="showCreate" @created="onCreated" />

    <FireTriggerModal
      v-model:open="showFire"
      :trigger="fireTarget"
      @fired="() => {}"
    />

    <TriggerDetailDrawer
      v-model:open="showDetail"
      :trigger="detailTarget"
    />
  </div>
</template>
