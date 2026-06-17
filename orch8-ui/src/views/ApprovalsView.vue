<script setup lang="ts">
/**
 * ApprovalsView — Human-in-the-loop pending approvals queue.
 *
 * Features:
 *  - Polls every 5s for live approval queue (GET /api/v1/approvals)
 *  - Namespace filter + text search
 *  - ApprovalDetailDrawer for full detail
 *  - ResolveApprovalModal to submit human-input signal to the instance
 *  - Deadline countdown with warning/danger tone
 *  - Empty / loading / error states
 *
 * DESIGN_REFERENCE §Approvals (human-sessions-stream.md §1)
 * POST /instances/{id}/signals — resolve via custom:human_input:{block_id} signal
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { UserCheck, RefreshCw, Clock, AlertTriangle } from 'lucide-vue-next'
import { useConnectionStore } from '@/stores/connection'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { listApprovals } from '@/api/approvals'
import { formatRelative, formatDateTime, shortId } from '@/lib/format'
import type { ApprovalItem } from '@/api/types/approvals'
import type { Column } from '@/components/ui/DataTable.vue'
import type { BadgeTone } from '@/components/ui/Badge.vue'

import PageHeader from '@/components/ui/PageHeader.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import Badge from '@/components/ui/Badge.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import ApprovalDetailDrawer from '@/components/human/ApprovalDetailDrawer.vue'
import ResolveApprovalModal from '@/components/human/ResolveApprovalModal.vue'

const router = useRouter()
const conn = useConnectionStore()

// --- filters ------------------------------------------------------------------
const nsFilter = ref('')
const search = ref('')

// --- data fetching ------------------------------------------------------------
const loader = useAsync((signal) =>
  listApprovals(
    {
      tenant_id: conn.tenantId || undefined,
      namespace: nsFilter.value.trim() || undefined,
      limit: 200,
    },
    signal,
  ),
)
const { data, loading, error, errorText } = loader

const polling = usePolling(loader.run, { intervalMs: 5000, immediate: false })

onMounted(() => {
  void loader.run()
  polling.start()
})

// --- client-side search -------------------------------------------------------
const rows = computed<ApprovalItem[]>(() => {
  const q = search.value.trim().toLowerCase()
  const all = data.value?.items ?? []
  if (!q) return all
  return all.filter(
    (a) =>
      a.sequence_name.toLowerCase().includes(q) ||
      a.namespace.toLowerCase().includes(q) ||
      a.block_id.toLowerCase().includes(q) ||
      a.prompt.toLowerCase().includes(q) ||
      a.instance_id.toLowerCase().includes(q),
  )
})

// --- columns ------------------------------------------------------------------
const columns: Column[] = [
  { key: 'status', header: '', width: '28px' },
  { key: 'sequence_name', header: 'Sequence' },
  { key: 'namespace', header: 'Namespace', width: '130px', mono: true },
  { key: 'prompt', header: 'Prompt' },
  { key: 'choices', header: 'Options', width: '150px' },
  { key: 'waiting_since', header: 'Waiting since', width: '140px' },
  { key: 'deadline', header: 'Deadline', width: '140px' },
  { key: '_actions', header: '', width: '100px', align: 'right' },
]

// --- deadline tone -----------------------------------------------------------
function deadlineTone(deadline: string | null): BadgeTone {
  if (!deadline) return 'neutral'
  const msLeft = new Date(deadline).getTime() - Date.now()
  if (msLeft < 0) return 'danger'
  if (msLeft < 3_600_000) return 'warning' // < 1 hour
  return 'neutral'
}

// --- detail drawer ------------------------------------------------------------
const detailTarget = ref<ApprovalItem | null>(null)
const showDetail = ref(false)

function openDetail(row: ApprovalItem) {
  detailTarget.value = row
  showDetail.value = true
}

// --- resolve modal ------------------------------------------------------------
const resolveTarget = ref<ApprovalItem | null>(null)
const showResolve = ref(false)

function openResolve(row: ApprovalItem) {
  resolveTarget.value = row
  showResolve.value = true
}

function onResolved(_instanceId: string) {
  // Refresh after a short tick so the backend can update its state
  void loader.run()
}

// --- instance link -----------------------------------------------------------
function navigateToInstance(instanceId: string, event: Event) {
  event.stopPropagation()
  void router.push(`/instances/${instanceId}`)
}


</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeader
      title="Approvals"
      description="Human-in-the-loop review gates waiting for a decision. Sorted newest-waiting first."
      :icon="UserCheck"
    >
      <template #actions>
        <Tooltip text="Polling every 5s">
          <IconButton label="Refresh approvals" @click="loader.run()">
            <RefreshCw
              :size="16"
              :class="(loading || polling.active.value) && 'animate-spin'"
            />
          </IconButton>
        </Tooltip>
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="nsFilter"
        class="h-9 w-36 rounded-md border border-border-strong bg-surface-2 px-3 text-[13px] text-text placeholder-faint focus:border-accent focus:outline-none"
        placeholder="Namespace"
        @change="loader.run()"
      />
      <SearchInput
        v-model="search"
        placeholder="Search by sequence, block, prompt…"
        class="w-64"
      />
      <span v-if="data" class="ml-auto text-[12.5px] text-subtle">
        {{ rows.length }} pending
        <template v-if="data.total !== rows.length"> ({{ data.total }} total)</template>
      </span>
    </div>

    <!-- Error banner -->
    <div
      v-if="error"
      class="rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
    >
      <span class="flex items-center gap-2">
        <AlertTriangle :size="15" />
        {{ errorText }}
      </span>
      <button class="ml-1 underline" @click="loader.run()">Retry</button>
    </div>

    <!-- Table -->
    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(r) => `${r.instance_id}:${r.block_id}`"
      :loading="loading"
      :clickable="true"
      empty-title="No pending approvals"
      empty-description="All human-in-the-loop gates have been resolved. New approvals will appear here when instances reach a wait_for_input step."
      @row-click="openDetail"
    >
      <!-- Live pulse indicator -->
      <template #cell-status>
        <StatusDot tone="warning" :pulse="true" :size="8" label="Waiting for input" />
      </template>

      <template #cell-sequence_name="{ row }">
        <div class="flex flex-col gap-0.5">
          <span class="text-[13px] font-medium text-text">{{ row.sequence_name }}</span>
          <button
            class="mono text-left text-[11px] text-accent underline-offset-2 hover:underline"
            :aria-label="`Open instance ${row.instance_id}`"
            @click.stop="navigateToInstance(row.instance_id, $event)"
          >
            {{ shortId(row.instance_id) }}
          </button>
        </div>
      </template>

      <template #cell-namespace="{ row }">
        <span class="mono text-[12px] text-muted">{{ row.namespace }}</span>
      </template>

      <template #cell-prompt="{ row }">
        <span
          class="line-clamp-2 max-w-xs text-[12.5px] text-text"
          :title="row.prompt"
        >
          {{ row.prompt }}
        </span>
      </template>

      <template #cell-choices="{ row }">
        <div class="flex flex-wrap gap-1">
          <Badge
            v-for="c in row.choices.slice(0, 3)"
            :key="c.value"
            tone="neutral"
            size="sm"
          >
            {{ c.label }}
          </Badge>
          <span
            v-if="row.choices.length > 3"
            class="text-[11px] text-faint"
          >
            +{{ row.choices.length - 3 }}
          </span>
        </div>
      </template>

      <template #cell-waiting_since="{ row }">
        <span
          :title="formatDateTime(row.waiting_since)"
          class="flex items-center gap-1 text-[12.5px] text-muted"
        >
          <Clock :size="11" class="text-faint" />
          {{ formatRelative(row.waiting_since) }}
        </span>
      </template>

      <template #cell-deadline="{ row }">
        <template v-if="row.deadline">
          <Badge :tone="deadlineTone(row.deadline)" size="sm">
            {{ formatRelative(row.deadline) }}
          </Badge>
        </template>
        <span v-else class="text-[12px] text-faint">—</span>
      </template>

      <template #cell-_actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <IconButton
            label="View approval details"
            size="sm"
            @click.stop="openDetail(row)"
          >
            <!-- Eye icon inline to avoid unused import overhead -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </IconButton>
          <IconButton
            label="Resolve approval"
            size="sm"
            variant="secondary"
            @click.stop="openResolve(row)"
          >
            <UserCheck :size="14" />
          </IconButton>
        </div>
      </template>
    </DataTable>

    <!-- Detail drawer -->
    <ApprovalDetailDrawer
      v-model:open="showDetail"
      :approval="detailTarget"
    />

    <!-- Resolve modal -->
    <ResolveApprovalModal
      v-model:open="showResolve"
      :approval="resolveTarget"
      @resolved="onResolved"
    />
  </div>
</template>
