<script setup lang="ts">
/**
 * Instance Detail view — rich operator console for a single workflow instance.
 * Reads :id route param and fetches the instance with live polling.
 *
 * Header: StateBadge, key timestamps, idempotency key, budget, action buttons.
 * Tabs: Overview · Execution Tree · Outputs · Step Logs · Timeline ·
 *       Checkpoints · Artifacts · Audit · Live Stream
 *
 * DESIGN_REFERENCE §Instances — instances-core.md + instances-advanced.md
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Cpu,
  RotateCcw,
  Ban,
  Pause,
  Play,
  Radio,
  GitFork,
  SquarePlus,
  FileCode2,
  Workflow,
  RefreshCw,
  ChevronLeft,
  GitBranch,
  ScrollText,
  Clock,
  DatabaseBackup,
  FileBox,
  ShieldCheck,
  Wifi,
  List,
} from 'lucide-vue-next'
import type { Component } from 'vue'

import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useSequencesStore } from '@/stores/sequences'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { getInstance, retryInstance, sendSignal, getExecutionTree } from '@/api/instances'
import { errorMessage } from '@/api/errors'
import { formatRelative, formatDateTime, shortId } from '@/lib/format'
import { isTerminal } from '@/api/types/instances'
import type { TaskInstance } from '@/api/types/instances'
import type { TabItem } from '@/components/ui/Tabs.vue'

import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Tabs from '@/components/ui/Tabs.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Tooltip from '@/components/ui/Tooltip.vue'

import StateBadge from '@/components/instances/StateBadge.vue'

// Per-tab panels
import OverviewTab from '@/components/instances/detail/OverviewTab.vue'
import ExecutionTreePanel from '@/components/instances/detail/ExecutionTreePanel.vue'
import OutputsTab from '@/components/instances/detail/OutputsTab.vue'
import StepLogsTab from '@/components/instances/detail/StepLogsTab.vue'
import TimelineTab from '@/components/instances/detail/TimelineTab.vue'
import CheckpointsTab from '@/components/instances/detail/CheckpointsTab.vue'
import ArtifactsTab from '@/components/instances/detail/ArtifactsTab.vue'
import AuditTab from '@/components/instances/detail/AuditTab.vue'
import LiveStreamPanel from '@/components/instances/detail/LiveStreamPanel.vue'

// Modals / action dialogs
import SendSignalModal from '@/components/instances/detail/SendSignalModal.vue'
import ForkModal from '@/components/instances/detail/ForkModal.vue'
import InjectBlocksModal from '@/components/instances/detail/InjectBlocksModal.vue'
import EditContextModal from '@/components/instances/detail/EditContextModal.vue'
import EditStateModal from '@/components/instances/detail/EditStateModal.vue'

// --- Route & stores -----------------------------------------------------------
const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const conn = useConnectionStore()
const seqStore = useSequencesStore()

const instanceId = computed(() => route.params.id as string)

// --- Data fetching ------------------------------------------------------------
const loader = useAsync((signal) => getInstance(instanceId.value, signal))
const { data: instance, loading, error } = loader

const is404 = computed(() => error.value?.status === 404)

// Poll while non-terminal; stop when terminal
const polling = usePolling(loader.run, { intervalMs: 5000, immediate: false })

watch(
  () => instance.value?.state,
  (state) => {
    if (state && isTerminal(state)) {
      polling.stop()
    }
  },
)

onMounted(() => {
  // Catalog resolves this instance's sequence_id → name/version for the header + overview.
  void seqStore.loadCatalog(conn.tenantId)
  void loader.run()
  polling.start()
})

// Stop polling when leaving
// (Vue Router handles scope dispose via onScopeDispose in usePolling)

// --- Tabs --------------------------------------------------------------------
type TabKey =
  | 'overview'
  | 'tree'
  | 'outputs'
  | 'logs'
  | 'timeline'
  | 'checkpoints'
  | 'artifacts'
  | 'audit'
  | 'stream'

const activeTab = ref<TabKey>('overview')

const tabs: TabItem[] = [
  { key: 'overview',    label: 'Overview',        icon: List as Component },
  { key: 'tree',        label: 'Execution Tree',  icon: GitBranch as Component },
  { key: 'outputs',     label: 'Outputs',         icon: Workflow as Component },
  { key: 'logs',        label: 'Step Logs',       icon: ScrollText as Component },
  { key: 'timeline',    label: 'Timeline',        icon: Clock as Component },
  { key: 'checkpoints', label: 'Checkpoints',     icon: DatabaseBackup as Component },
  { key: 'artifacts',   label: 'Artifacts',       icon: FileBox as Component },
  { key: 'audit',       label: 'Audit',           icon: ShieldCheck as Component },
  { key: 'stream',      label: 'Live Stream',     icon: Wifi as Component },
]

// --- Execution tree ----------------------------------------------------------

const treeLoader = useAsync((signal) => getExecutionTree(instanceId.value, signal))
const { data: treeNodes, loading: treeLoading, error: treeError } = treeLoader

watch(activeTab, (tab) => {
  if (tab === 'tree' && !treeNodes.value) {
    void treeLoader.run()
  }
})

// --- Action modals -----------------------------------------------------------
const showSignal    = ref(false)
const showFork      = ref(false)
const showInject    = ref(false)
const showCtx       = ref(false)
const showState     = ref(false)

// --- Action handlers ---------------------------------------------------------
const retrying = ref(false)

async function handleRetry() {
  const ok = await ui.confirm({
    title: 'Retry instance?',
    message: 'This will clear stale execution markers and re-schedule the instance from the beginning. Completed step outputs are preserved.',
    tone: 'danger',
    confirmText: 'Retry',
  })
  if (!ok) return
  retrying.value = true
  try {
    await retryInstance(instanceId.value)
    ui.success('Instance retried', 'Re-scheduled to run again.')
    void loader.run()
  } catch (e) {
    ui.error('Retry failed', errorMessage(e))
  } finally {
    retrying.value = false
  }
}

async function sendPause() {
  const ok = await ui.confirm({
    title: 'Pause instance?',
    message: 'The instance will be paused at the next scheduler tick.',
    tone: 'danger',
    confirmText: 'Pause',
  })
  if (!ok) return
  try {
    await sendSignal(instanceId.value, { signal_type: 'pause' })
    ui.success('Paused', 'Pause signal sent.')
    void loader.run()
  } catch (e) {
    ui.error('Pause failed', errorMessage(e))
  }
}

async function sendResume() {
  try {
    await sendSignal(instanceId.value, { signal_type: 'resume' })
    ui.success('Resumed', 'Resume signal sent.')
    void loader.run()
  } catch (e) {
    ui.error('Resume failed', errorMessage(e))
  }
}

async function handleCancel() {
  const ok = await ui.confirm({
    title: 'Cancel instance?',
    message: 'This will cancel the instance. This cannot be undone.',
    tone: 'danger',
    confirmText: 'Cancel instance',
  })
  if (!ok) return
  try {
    await sendSignal(instanceId.value, { signal_type: 'cancel' })
    ui.success('Cancel signal sent')
    void loader.run()
  } catch (e) {
    ui.error('Cancel failed', errorMessage(e))
  }
}

function onRefresh() {
  void loader.run()
  if (activeTab.value === 'tree') void treeLoader.run()
}

// Helpers
const inst = computed(() => instance.value as TaskInstance | null)
// Resolve the sequence this instance runs, for the name/version shown at the top.
const seqInfo = computed(() => seqStore.sequenceById(inst.value?.sequence_id))
const seqLabel = computed(() => {
  const s = seqInfo.value
  if (s) return `${s.name} v${s.version}`
  return inst.value ? `Sequence ${shortId(inst.value.sequence_id)}` : ''
})
const canRetry  = computed(() => inst.value?.state === 'failed')
const canCancel = computed(() => inst.value && !isTerminal(inst.value.state))
const canPause  = computed(() => inst.value?.state === 'running' || inst.value?.state === 'waiting' || inst.value?.state === 'scheduled')
const canResume = computed(() => inst.value?.state === 'paused')
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 404 page -->
    <template v-if="is404">
      <div class="flex flex-col items-center justify-center py-24 text-center">
        <div class="mb-4 text-5xl font-light text-faint">404</div>
        <p class="text-[15px] font-medium text-text">Instance not found</p>
        <p class="mt-1.5 text-[13px] text-subtle">
          The instance <span class="mono">{{ instanceId }}</span> does not exist or is not
          accessible with the current credentials.
        </p>
        <Button class="mt-5" variant="secondary" @click="router.back()">
          <template #icon><ChevronLeft :size="14" /></template>
          Go back
        </Button>
      </div>
    </template>

    <!-- Main content -->
    <template v-else>
      <!-- Page header -->
      <PageHeader
        :title="inst ? shortId(inst.id) : 'Instance'"
        :description="inst ? `${seqLabel} · ${inst.tenant_id} / ${inst.namespace}` : undefined"
        :icon="Cpu"
      >
        <template #breadcrumb>
          <router-link to="/instances" class="hover:text-text">Instances</router-link>
          <span class="mx-1.5 text-faint">/</span>
          <span class="mono text-text">{{ shortId(instanceId) }}</span>
        </template>

        <template #actions>
          <!-- State badge -->
          <StateBadge v-if="inst" :state="inst.state" show-dot />

          <Tooltip v-if="polling.active.value" text="Polling every 5s">
            <IconButton label="Refresh" @click="onRefresh">
              <RefreshCw :size="16" :class="(loading || polling.active.value) && 'animate-spin'" />
            </IconButton>
          </Tooltip>
          <IconButton v-else label="Refresh" @click="onRefresh">
            <RefreshCw :size="16" :class="loading && 'animate-spin'" />
          </IconButton>

          <!-- Retry (only failed) -->
          <Button v-if="canRetry" variant="secondary" :loading="retrying" @click="handleRetry">
            <template #icon><RotateCcw :size="14" /></template>
            Retry
          </Button>

          <!-- Cancel (any non-terminal) -->
          <Button v-if="canCancel" variant="danger-outline" @click="handleCancel">
            <template #icon><Ban :size="14" /></template>
            Cancel
          </Button>

          <!-- Pause (running/waiting/scheduled) -->
          <Button v-if="canPause" variant="secondary" @click="sendPause">
            <template #icon><Pause :size="14" /></template>
            Pause
          </Button>

          <!-- Resume (paused) -->
          <Button v-if="canResume" variant="secondary" @click="sendResume">
            <template #icon><Play :size="14" /></template>
            Resume
          </Button>

          <!-- Signal modal -->
          <Button variant="secondary" @click="showSignal = true">
            <template #icon><Radio :size="14" /></template>
            Signal
          </Button>

          <!-- Fork modal -->
          <Button variant="secondary" @click="showFork = true">
            <template #icon><GitFork :size="14" /></template>
            Fork
          </Button>

          <!-- Inject blocks -->
          <Button variant="secondary" @click="showInject = true">
            <template #icon><SquarePlus :size="14" /></template>
            Inject
          </Button>

          <!-- Edit context -->
          <Button variant="secondary" @click="showCtx = true">
            <template #icon><FileCode2 :size="14" /></template>
            Context
          </Button>

          <!-- Edit state -->
          <Button variant="secondary" @click="showState = true">
            <template #icon><Workflow :size="14" /></template>
            State
          </Button>
        </template>
      </PageHeader>

      <!-- Key timestamps strip -->
      <div v-if="inst" class="flex flex-wrap items-center gap-x-6 gap-y-1 text-[12.5px] text-subtle">
        <!-- Bug 5: Instance Key + Sequence name/version surfaced at the top. -->
        <span v-if="inst.idempotency_key" class="mono">
          Instance Key: <span class="text-text">{{ inst.idempotency_key }}</span>
        </span>
        <span v-if="seqInfo">
          Sequence: <span class="text-text">{{ seqInfo.name }}</span>
        </span>
        <span v-if="seqInfo">
          Version: <span class="mono text-text">v{{ seqInfo.version }}</span>
        </span>
        <span>
          Created: <span class="text-text" :title="formatDateTime(inst.created_at)">{{ formatRelative(inst.created_at) }}</span>
        </span>
        <span>
          Updated: <span class="text-text" :title="formatDateTime(inst.updated_at)">{{ formatRelative(inst.updated_at) }}</span>
        </span>
        <span v-if="inst.next_fire_at">
          Next fire: <span class="text-text" :title="formatDateTime(inst.next_fire_at)">{{ formatRelative(inst.next_fire_at) }}</span>
        </span>
        <template v-if="inst.budget">
          <span v-if="inst.budget.max_steps != null">
            Budget steps: <span class="text-text">{{ inst.context.runtime?.total_steps_executed ?? 0 }} / {{ inst.budget.max_steps }}</span>
          </span>
          <span v-if="inst.budget.max_total_tokens != null">
            Budget tokens: <span class="text-text">{{ inst.budget.max_total_tokens.toLocaleString() }}</span>
          </span>
        </template>
        <Badge v-if="inst.context.runtime?.dry_run" tone="purple">dry-run</Badge>
      </div>

      <!-- Skeleton while loading -->
      <div v-if="loading && !inst" class="flex flex-col gap-3">
        <Skeleton class="h-8 w-1/3" />
        <Skeleton class="h-4 w-1/4" />
        <Skeleton class="h-56 w-full" />
      </div>

      <!-- Error banner (non-404) -->
      <div
        v-if="error && !is404"
        class="rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
      >
        {{ error.message }}
        <button class="ml-2 underline" @click="loader.run()">Retry</button>
      </div>

      <!-- Tabs -->
      <template v-if="inst">
        <Tabs v-model="activeTab" :tabs="tabs" />

        <!-- Tab panels -->
        <div class="min-h-[300px]">
          <!-- Overview -->
          <OverviewTab v-if="activeTab === 'overview'" :instance="inst" />

          <!-- Execution Tree -->
          <template v-else-if="activeTab === 'tree'">
            <div v-if="treeError" class="rounded border border-danger/30 bg-danger-soft p-3 text-[12.5px] text-danger">
              {{ treeError.message }}
              <button class="ml-2 underline" @click="treeLoader.run()">Retry</button>
            </div>
            <div v-else-if="treeLoading" class="flex flex-col gap-2 py-4">
              <Skeleton v-for="i in 6" :key="i" class="h-8 w-full" />
            </div>
            <div v-else-if="!treeNodes || treeNodes.length === 0" class="flex flex-col items-center justify-center py-16 text-center">
              <p class="text-[13px] text-subtle">No execution tree nodes yet.</p>
            </div>
            <ExecutionTreePanel v-else :nodes="treeNodes" />
          </template>

          <!-- Outputs -->
          <OutputsTab v-else-if="activeTab === 'outputs'" :instance-id="inst.id" />

          <!-- Step Logs -->
          <StepLogsTab
            v-else-if="activeTab === 'logs'"
            :instance-id="inst.id"
            :current-state="inst.state"
          />

          <!-- Timeline -->
          <TimelineTab v-else-if="activeTab === 'timeline'" :instance-id="inst.id" />

          <!-- Checkpoints -->
          <CheckpointsTab v-else-if="activeTab === 'checkpoints'" :instance-id="inst.id" />

          <!-- Artifacts -->
          <ArtifactsTab v-else-if="activeTab === 'artifacts'" :instance-id="inst.id" />

          <!-- Audit -->
          <AuditTab v-else-if="activeTab === 'audit'" :instance-id="inst.id" />

          <!-- Live Stream -->
          <div v-else-if="activeTab === 'stream'" class="rounded-lg border border-border bg-surface p-4">
            <LiveStreamPanel :instance-id="inst.id" :current-state="inst.state" />
          </div>
        </div>
      </template>
    </template>

    <!-- Action modals (mounted in the view layer; instance must exist) -->
    <template v-if="inst">
      <SendSignalModal
        v-model:open="showSignal"
        :instance-id="inst.id"
        @sent="loader.run()"
      />

      <ForkModal
        v-model:open="showFork"
        :instance-id="inst.id"
        @forked="(r) => router.push(`/instances/${r.id}`)"
      />

      <InjectBlocksModal
        v-model:open="showInject"
        :instance-id="inst.id"
        @injected="loader.run()"
      />

      <EditContextModal
        v-model:open="showCtx"
        :instance-id="inst.id"
        :context="inst.context"
        @updated="loader.run()"
      />

      <EditStateModal
        v-model:open="showState"
        :instance-id="inst.id"
        :current-state="inst.state"
        @updated="loader.run()"
      />
    </template>
  </div>
</template>
