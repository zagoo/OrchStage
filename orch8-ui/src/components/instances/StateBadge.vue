<script setup lang="ts">
/**
 * Instance state badge — maps every InstanceState to a semantic tone + icon.
 * Import TERMINAL_STATES from here to reuse the canonical terminal-state set.
 * DESIGN_REFERENCE §Instances §State Machine — instances-core.md
 */
import { computed } from 'vue'
import {
  Clock,
  Play,
  Pause,
  Hourglass,
  CheckCircle2,
  XCircle,
  Ban,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import type { BadgeTone } from '@/components/ui/Badge.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import type { DotTone } from '@/components/ui/StatusDot.vue'
import type { InstanceState } from '@/api/types/instances'

const props = defineProps<{ state: InstanceState; showDot?: boolean }>()

type StateMeta = { tone: DotTone & BadgeTone; label: string; icon: Component; pulse: boolean }

const META: Record<InstanceState, StateMeta> = {
  scheduled: { tone: 'warning', label: 'Scheduled', icon: Clock,        pulse: false },
  running:   { tone: 'info',    label: 'Running',   icon: Play,          pulse: true  },
  waiting:   { tone: 'warning', label: 'Waiting',   icon: Hourglass,     pulse: false },
  paused:    { tone: 'warning', label: 'Paused',    icon: Pause,         pulse: false },
  completed: { tone: 'success', label: 'Completed', icon: CheckCircle2,  pulse: false },
  failed:    { tone: 'danger',  label: 'Failed',    icon: XCircle,       pulse: false },
  cancelled: { tone: 'neutral', label: 'Cancelled', icon: Ban,           pulse: false },
}

const meta = computed<StateMeta>(() => META[props.state] ?? { tone: 'neutral', label: props.state, icon: Clock, pulse: false })
</script>

<script lang="ts">
// Re-export so callers can import TERMINAL_STATES from this component file
export { TERMINAL_STATES, isTerminal } from '@/api/types/instances'
</script>

<template>
  <Badge :tone="meta.tone" class="gap-1">
    <StatusDot v-if="showDot" :tone="meta.tone" :pulse="meta.pulse" class="mr-0.5" />
    <component :is="meta.icon" :size="11" />
    {{ meta.label }}
  </Badge>
</template>
