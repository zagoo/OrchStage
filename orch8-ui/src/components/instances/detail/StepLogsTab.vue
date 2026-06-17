<script setup lang="ts">
/**
 * Step Logs tab — live-polled log viewer with level filter and block grouping.
 * DESIGN_REFERENCE §Instances §GET /instances/{id}/logs
 */
import { ref, computed, onMounted } from 'vue'
import { RefreshCw, ScrollText } from 'lucide-vue-next'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { getInstanceLogs } from '@/api/instancesAdvanced'
import { formatDateTime } from '@/lib/format'
import type { StepLog } from '@/api/types/instancesAdvanced'
import type { InstanceState } from '@/api/types/instances'
import { isTerminal } from '@/api/types/instances'
import Panel from '@/components/ui/Panel.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Select from '@/components/ui/Select.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const props = defineProps<{ instanceId: string; currentState: InstanceState }>()

type LogLevel = 'all' | 'trace' | 'debug' | 'info' | 'warn' | 'error'
const levelFilter = ref<LogLevel>('all')
const blockFilter = ref('')

const LEVEL_OPTIONS = [
  { value: 'all',   label: 'All levels' },
  { value: 'trace', label: 'Trace' },
  { value: 'debug', label: 'Debug' },
  { value: 'info',  label: 'Info' },
  { value: 'warn',  label: 'Warn' },
  { value: 'error', label: 'Error' },
]

const LEVEL_TONE: Record<string, string> = {
  trace: 'text-faint',
  debug: 'text-subtle',
  info:  'text-text',
  warn:  'text-warning',
  error: 'text-danger',
}

const loader = useAsync((signal) => getInstanceLogs(props.instanceId, signal))
const { data: logs, loading, error } = loader

// Poll only while instance is non-terminal
const polling = usePolling(loader.run, { intervalMs: 3000, immediate: false })

onMounted(() => {
  void loader.run()
  if (!isTerminal(props.currentState)) {
    polling.start()
  }
})

const filteredLogs = computed<StepLog[]>(() => {
  let all = logs.value ?? []
  if (levelFilter.value !== 'all') {
    all = all.filter((l) => l.level === levelFilter.value)
  }
  const b = blockFilter.value.trim().toLowerCase()
  if (b) {
    all = all.filter((l) => l.block_id.toLowerCase().includes(b))
  }
  return all
})

const blockOptions = computed(() => {
  const all = logs.value ?? []
  const ids = [...new Set(all.map((l) => l.block_id))].sort()
  return [{ value: '', label: 'All blocks' }, ...ids.map((id) => ({ value: id, label: id }))]
})
</script>

<template>
  <Panel>
    <template #header>
      <div class="flex items-center gap-2">
        <ScrollText :size="15" class="text-muted" />
        <span class="text-[13px] font-semibold text-text">Step Logs</span>
      </div>
    </template>
    <template #actions>
      <Badge v-if="polling.active.value" tone="info" class="flex items-center gap-1 text-[11px]">
        <span class="relative flex h-2 w-2">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
          <span class="relative inline-flex h-2 w-2 rounded-full bg-info" />
        </span>
        Live
      </Badge>
      <Select v-model="levelFilter" :options="LEVEL_OPTIONS" class="w-28 text-[12px]" />
      <Select v-model="blockFilter" :options="blockOptions" class="w-36 text-[12px]" />
      <IconButton label="Refresh logs" size="sm" @click="loader.run()">
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

    <EmptyState
      v-if="!loading && filteredLogs.length === 0 && !error"
      :icon="ScrollText"
      title="No logs"
      description="No step logs match the current filters."
      compact
    />

    <div
      v-else
      class="mono overflow-y-auto rounded-lg border border-border bg-bg p-3 text-[11.5px] leading-relaxed"
      style="max-height: 600px"
    >
      <div
        v-for="(log, idx) in filteredLogs"
        :key="idx"
        class="flex gap-2 py-0.5"
      >
        <span class="shrink-0 text-subtle" :title="log.ts">{{ formatDateTime(log.ts) }}</span>
        <span class="w-12 shrink-0 text-right font-medium uppercase" :class="LEVEL_TONE[log.level] ?? 'text-text'">
          {{ log.level }}
        </span>
        <span class="shrink-0 w-40 truncate text-muted" :title="log.block_id">{{ log.block_id }}</span>
        <span class="min-w-0 break-words text-text">{{ log.message }}</span>
      </div>
    </div>

    <div v-if="filteredLogs.length > 0" class="mt-2 text-right text-[11.5px] text-subtle">
      {{ filteredLogs.length }} line{{ filteredLogs.length === 1 ? '' : 's' }}
    </div>
  </Panel>
</template>
