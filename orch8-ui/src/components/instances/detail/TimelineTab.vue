<script setup lang="ts">
/**
 * Timeline tab — flat chronological execution view with state transitions.
 * Surfaces sentinel rows (is_sentinel=true) distinctly.
 * DESIGN_REFERENCE §Instances §GET /instances/{id}/timeline
 */
import { ref, onMounted } from 'vue'
import { RefreshCw, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-vue-next'
import { useAsync } from '@/composables/useAsync'
import { getTimeline } from '@/api/instancesAdvanced'
import { formatRelative, formatDateTime } from '@/lib/format'
import Panel from '@/components/ui/Panel.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const props = defineProps<{ instanceId: string }>()

const PAGE_SIZE = 100
const offset = ref(0)

const loader = useAsync((signal) =>
  getTimeline(props.instanceId, { offset: offset.value, limit: PAGE_SIZE }, signal),
)
const { data: timeline, loading, error } = loader

onMounted(() => void loader.run())

function prevPage() {
  if (offset.value === 0) return
  offset.value = Math.max(0, offset.value - PAGE_SIZE)
  void loader.run()
}

function nextPage() {
  if (!timeline.value?.has_more) return
  offset.value += PAGE_SIZE
  void loader.run()
}

const TRANSITION_TONE: Record<string, string> = {
  running:   'info',
  completed: 'success',
  failed:    'danger',
  cancelled: 'neutral',
  paused:    'warning',
  waiting:   'warning',
  scheduled: 'warning',
}

function transitionTone(state: string | undefined): string {
  return TRANSITION_TONE[state ?? ''] ?? 'neutral'
}

const SENTINEL_LABEL: Record<string, string> = {
  '__in_progress__': 'in-progress',
  '__retry__':       'retry',
  '__error__':       'error',
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- State transitions panel -->
    <Panel title="State Transitions">
      <template #actions>
        <IconButton label="Refresh timeline" size="sm" @click="loader.run()">
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

      <div
        v-if="timeline && timeline.state_transitions.length > 0"
        class="space-y-1"
      >
        <div
          v-for="(tr, idx) in timeline.state_transitions"
          :key="idx"
          class="flex items-center gap-3 rounded px-3 py-2 hover:bg-hover text-[12.5px]"
        >
          <span :title="formatDateTime(tr.at)" class="w-36 shrink-0 text-subtle">
            {{ formatRelative(tr.at) }}
          </span>
          <span class="text-subtle">{{ formatDateTime(tr.at) }}</span>
          <div class="ml-auto flex items-center gap-2">
            <Badge
              v-if="tr.from_state"
              :tone="(transitionTone(tr.from_state)) as 'info' | 'success' | 'danger' | 'neutral' | 'warning'"
            >
              {{ tr.from_state }}
            </Badge>
            <ChevronRight :size="12" class="text-subtle" />
            <Badge
              v-if="tr.to_state"
              :tone="(transitionTone(tr.to_state)) as 'info' | 'success' | 'danger' | 'neutral' | 'warning'"
            >
              {{ tr.to_state }}
            </Badge>
          </div>
        </div>
      </div>
      <EmptyState
        v-else-if="!loading && !error"
        title="No state transitions"
        description="State transition history is empty or audit logging is not enabled."
        compact
      />
    </Panel>

    <!-- Execution entries panel -->
    <Panel title="Execution Entries">
      <template #actions>
        <div class="flex items-center gap-1">
          <IconButton
            label="Previous page"
            size="sm"
            :disabled="offset === 0"
            @click="prevPage"
          >
            <ChevronLeft :size="13" />
          </IconButton>
          <span class="text-[12px] text-subtle">
            {{ offset + 1 }}–{{ offset + (timeline?.entries.length ?? 0) }}
          </span>
          <IconButton
            label="Next page"
            size="sm"
            :disabled="!timeline?.has_more"
            @click="nextPage"
          >
            <ChevronRight :size="13" />
          </IconButton>
        </div>
      </template>

      <div v-if="timeline && timeline.entries.length > 0" class="space-y-0.5">
        <div
          v-for="(entry, idx) in timeline.entries"
          :key="idx"
          :class="[
            'flex items-start gap-3 rounded px-3 py-2 text-[12.5px]',
            entry.is_sentinel ? 'bg-warning-soft/30' : 'hover:bg-hover',
          ]"
        >
          <span :title="formatDateTime(entry.completed_at)" class="w-36 shrink-0 text-subtle">
            {{ formatRelative(entry.completed_at) }}
          </span>
          <span class="mono w-40 shrink-0 truncate text-text">{{ entry.block_id }}</span>
          <span class="w-14 shrink-0 text-center text-subtle">attempt {{ entry.attempt }}</span>

          <div class="ml-auto flex items-center gap-2">
            <Badge
              v-if="entry.is_sentinel && entry.output_ref"
              tone="warning"
              class="flex items-center gap-1"
            >
              <AlertTriangle :size="10" />
              {{ SENTINEL_LABEL[entry.output_ref] ?? entry.output_ref }}
            </Badge>
            <Badge v-else-if="!entry.is_sentinel" tone="success">done</Badge>
          </div>
        </div>
      </div>
      <EmptyState
        v-else-if="!loading && !error"
        title="No execution entries"
        description="No blocks have been executed for this instance yet."
        compact
      />
    </Panel>
  </div>
</template>
