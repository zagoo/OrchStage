<script setup lang="ts">
/**
 * Live SSE stream panel for an instance.
 * Uses openEventStream from @/api/sse; auto-stops on terminal state.
 * DESIGN_REFERENCE §Instances §GET /instances/{id}/stream
 */
import { ref, onUnmounted, watch, nextTick } from 'vue'
import { Play, Square, Trash2 } from 'lucide-vue-next'
import { openEventStream } from '@/api/sse'
import { instanceStreamPath } from '@/api/instancesAdvanced'
import { isTerminal } from '@/api/types/instances'
import type { InstanceState } from '@/api/types/instances'
import type { SseHandle, SseMessage } from '@/api/sse'
import type { StreamDoneEvent } from '@/api/types/instancesAdvanced'
import IconButton from '@/components/ui/IconButton.vue'
import Badge from '@/components/ui/Badge.vue'

const props = defineProps<{
  instanceId: string
  currentState: InstanceState
}>()

interface StreamLine {
  ts: string
  event: string
  data: string
  isDone?: boolean
  isError?: boolean
}

const lines = ref<StreamLine[]>([])
const streaming = ref(false)
const scrollEl = ref<HTMLDivElement | null>(null)
let handle: SseHandle | null = null

// Auto-stop when instance reaches terminal state
watch(() => props.currentState, (state) => {
  if (isTerminal(state) && streaming.value) {
    stopStream()
  }
})

function scrollBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  })
}

function startStream() {
  if (streaming.value) return
  streaming.value = true
  handle = openEventStream(
    instanceStreamPath(props.instanceId, 500),
    {
      onOpen: () => {
        lines.value.push({ ts: now(), event: '—', data: '⟶ stream opened' })
        scrollBottom()
      },
      onMessage: (msg: SseMessage) => {
        const isDone = msg.event === 'done'
        const isError = msg.event === 'error'
        lines.value.push({ ts: now(), event: msg.event, data: msg.data, isDone, isError })
        scrollBottom()
        if (isDone) {
          try {
            const d = JSON.parse(msg.data) as StreamDoneEvent
            if (isTerminal(d.state)) stopStream()
          } catch { /* ignore */ }
        }
      },
      onError: () => {
        lines.value.push({ ts: now(), event: 'error', data: '⚠ connection lost', isError: true })
        streaming.value = false
        handle = null
        scrollBottom()
      },
      onClose: () => {
        streaming.value = false
        handle = null
      },
    },
  )
}

function stopStream() {
  handle?.close()
  streaming.value = false
  handle = null
}

function clearLines() {
  lines.value = []
}

function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 23)
}

onUnmounted(() => handle?.close())

const EVENT_TONE: Record<string, string> = {
  state: 'text-info',
  output: 'text-success',
  llm_delta: 'text-purple',
  done: 'text-accent',
  error: 'text-danger',
}
</script>

<template>
  <div class="flex h-full flex-col gap-2">
    <div class="flex items-center gap-2">
      <IconButton
        v-if="!streaming"
        label="Start stream"
        size="sm"
        @click="startStream"
      >
        <Play :size="14" />
      </IconButton>
      <IconButton
        v-else
        label="Stop stream"
        size="sm"
        variant="danger"
        @click="stopStream"
      >
        <Square :size="14" />
      </IconButton>

      <Badge :tone="streaming ? 'info' : 'neutral'" class="flex items-center gap-1">
        <span v-if="streaming" class="relative flex h-2 w-2">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
          <span class="relative inline-flex h-2 w-2 rounded-full bg-info" />
        </span>
        {{ streaming ? 'Live' : 'Stopped' }}
      </Badge>

      <span class="ml-auto text-[12px] text-subtle">{{ lines.length }} events</span>

      <IconButton label="Clear events" size="sm" @click="clearLines">
        <Trash2 :size="13" />
      </IconButton>
    </div>

    <div
      ref="scrollEl"
      class="mono flex-1 overflow-y-auto rounded-lg border border-border bg-bg p-3 text-[11.5px] leading-relaxed"
      style="min-height: 300px; max-height: 520px"
    >
      <div v-if="lines.length === 0" class="text-subtle">
        Press Start to open the SSE stream for this instance.
      </div>
      <div
        v-for="(line, idx) in lines"
        :key="idx"
        class="flex gap-2"
        :class="line.isDone ? 'text-accent' : line.isError ? 'text-danger' : 'text-text'"
      >
        <span class="shrink-0 text-subtle">{{ line.ts }}</span>
        <span :class="['shrink-0 w-12 text-right', EVENT_TONE[line.event] ?? 'text-muted']">
          {{ line.event }}
        </span>
        <span class="min-w-0 break-all">{{ line.data }}</span>
      </div>
    </div>
  </div>
</template>
