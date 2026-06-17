<script setup lang="ts">
/**
 * Slide-in drawer showing full detail for a selected WorkerInfo,
 * including pending commands list and ability to delete them.
 * DESIGN_REFERENCE §GET /workers/{worker_id}/commands, §DELETE /workers/commands/{id}
 */
import { ref, watch } from 'vue'
import {
  Terminal, Cpu, Layers, Trash2, RefreshCw, Send,
} from 'lucide-vue-next'
import Drawer from '@/components/ui/Drawer.vue'
import Panel from '@/components/ui/Panel.vue'
import KeyValue from '@/components/ui/KeyValue.vue'
import Badge from '@/components/ui/Badge.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Button from '@/components/ui/Button.vue'

import Skeleton from '@/components/ui/Skeleton.vue'
import WorkerStatusBadge from './WorkerStatusBadge.vue'
import EnqueueCommandModal from './EnqueueCommandModal.vue'
import { listCommands, ackCommand } from '@/api/workers'
import { errorMessage } from '@/api/errors'
import { useAsync } from '@/composables/useAsync'
import { useUiStore } from '@/stores/ui'
import { formatRelative, formatDateTime } from '@/lib/format'
import type { WorkerInfo, WorkerCommand } from '@/api/types/workers'

const props = defineProps<{ worker: WorkerInfo | null }>()
const open = defineModel<boolean>('open', { required: true })

const ui = useUiStore()
const showEnqueue = ref(false)

const commands = useAsync((signal) =>
  props.worker ? listCommands(props.worker.worker_id, signal) : Promise.resolve([]),
)

watch(
  () => [open.value, props.worker?.worker_id],
  ([o]) => {
    if (o && props.worker) void commands.run()
  },
)

async function handleAck(cmd: WorkerCommand) {
  const ok = await ui.confirm({
    title: 'Delete command?',
    message: `Remove the pending "${cmd.command}" command from the queue.`,
    tone: 'danger',
    confirmText: 'Delete',
  })
  if (!ok) return
  try {
    await ackCommand(cmd.id)
    ui.success('Command removed', cmd.id)
    void commands.run()
  } catch (e) {
    ui.error('Delete failed', errorMessage(e))
  }
}
</script>

<template>
  <Drawer v-model:open="open" :title="worker?.worker_id ?? 'Worker'" width="560px">
    <template #actions>
      <IconButton label="Refresh commands" size="sm" @click="commands.run()">
        <RefreshCw :size="14" :class="commands.loading.value && 'animate-spin'" />
      </IconButton>
      <Button v-if="worker" size="sm" variant="ghost" @click="showEnqueue = true">
        <template #icon><Send :size="13" /></template>
        Send command
      </Button>
    </template>

    <div v-if="worker" class="flex flex-col gap-5">
      <!-- Overview -->
      <Panel title="Overview">
        <dl class="divide-y divide-border">
          <KeyValue label="Status">
            <WorkerStatusBadge :alive="worker.alive" />
          </KeyValue>
          <KeyValue label="Last heartbeat">
            <span :title="formatDateTime(worker.last_seen_at)" class="text-subtle">
              {{ formatRelative(worker.last_seen_at) }}
            </span>
          </KeyValue>
          <KeyValue label="Version">
            <span class="mono text-[12px]">{{ worker.version ?? '—' }}</span>
          </KeyValue>
          <KeyValue label="In-flight tasks">
            <span>{{ worker.in_flight }}</span>
          </KeyValue>
          <KeyValue label="Handlers" align="start">
            <div class="flex flex-wrap justify-end gap-1">
              <Badge v-for="h in worker.handlers" :key="h" tone="info">
                <Cpu :size="10" />
                {{ h }}
              </Badge>
            </div>
          </KeyValue>
          <KeyValue v-if="worker.queues.length" label="Queues" align="start">
            <div class="flex flex-wrap justify-end gap-1">
              <Badge v-for="q in worker.queues" :key="q" tone="purple">
                <Layers :size="10" />
                {{ q }}
              </Badge>
            </div>
          </KeyValue>
        </dl>
      </Panel>

      <!-- Pending commands -->
      <Panel title="Pending Commands">
        <template #actions>
          <Button size="sm" variant="ghost" @click="showEnqueue = true">
            <template #icon><Send :size="12" /></template>
            New
          </Button>
        </template>

        <div v-if="commands.loading.value" class="flex flex-col gap-2">
          <Skeleton v-for="n in 2" :key="n" height="2.5rem" />
        </div>
        <div v-else-if="!commands.data.value?.length" class="py-4 text-center text-[13px] text-subtle">
          No pending commands.
        </div>
        <div v-else class="flex flex-col gap-2">
          <div
            v-for="cmd in commands.data.value"
            :key="cmd.id"
            class="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2"
          >
            <div class="flex items-center gap-2">
              <Terminal :size="13" class="text-muted" />
              <span class="mono text-[12px] font-medium text-text">{{ cmd.command }}</span>
              <span class="text-[12px] text-subtle" :title="formatDateTime(cmd.created_at)">
                {{ formatRelative(cmd.created_at) }}
              </span>
            </div>
            <IconButton
              label="Delete command"
              size="sm"
              variant="danger"
              @click="handleAck(cmd)"
            >
              <Trash2 :size="13" />
            </IconButton>
          </div>
        </div>
      </Panel>
    </div>

    <EnqueueCommandModal
      v-if="worker"
      v-model:open="showEnqueue"
      :worker-id="worker.worker_id"
      @queued="commands.run()"
    />
  </Drawer>
</template>
