<script setup lang="ts">
/**
 * Drawer showing full details of a single audit log entry.
 * The `details` field is rendered as a CodeBlock for arbitrary JSON.
 * DESIGN_REFERENCE §Audit (instances-advanced.md §GET /api/v1/instances/{id}/audit)
 */
import { computed } from 'vue'
import { ClipboardList, ArrowRight, Layers } from 'lucide-vue-next'
import type { AuditLogEntry } from '@/api/types/observability'
import { formatDateTime, formatRelative, titleCase } from '@/lib/format'
import Drawer from '@/components/ui/Drawer.vue'
import Badge from '@/components/ui/Badge.vue'
import KeyValue from '@/components/ui/KeyValue.vue'
import CodeBlock from '@/components/ui/CodeBlock.vue'
import type { BadgeTone } from '@/components/ui/Badge.vue'

const { entry } = defineProps<{ entry: AuditLogEntry | null }>()
const open = defineModel<boolean>('open', { required: true })

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

function tonFor(eventType: string): BadgeTone {
  return eventTypeTone[eventType] ?? 'neutral'
}

const hasDetails = computed(() => {
  const d = entry?.details
  return d !== null && d !== undefined && (typeof d !== 'object' || Object.keys(d as Record<string, unknown>).length > 0)
})
</script>

<template>
  <Drawer v-model:open="open" :title="entry ? titleCase(entry.event_type) : 'Audit Entry'" width="580px">
    <template v-if="entry">
      <div class="mb-4 flex items-center gap-2">
        <ClipboardList :size="16" class="text-accent" />
        <Badge :tone="tonFor(entry.event_type)">{{ titleCase(entry.event_type) }}</Badge>
      </div>

      <div class="divide-y divide-border rounded-lg border border-border bg-surface mb-4">
        <KeyValue label="Entry ID">
          <span class="mono text-[11.5px]">{{ entry.id }}</span>
        </KeyValue>
        <KeyValue label="Instance">
          <span class="mono text-[11.5px]">{{ entry.instance_id }}</span>
        </KeyValue>
        <KeyValue label="Tenant">
          <span class="mono">{{ entry.tenant_id }}</span>
        </KeyValue>
        <KeyValue v-if="entry.block_id" label="Block">
          <span class="flex items-center gap-1">
            <Layers :size="12" class="text-subtle" />
            <span class="mono">{{ entry.block_id }}</span>
          </span>
        </KeyValue>
        <template v-if="entry.from_state || entry.to_state">
          <KeyValue label="State change">
            <span class="flex items-center gap-1.5 mono text-[12px]">
              <Badge v-if="entry.from_state" tone="neutral">{{ entry.from_state }}</Badge>
              <ArrowRight v-if="entry.from_state && entry.to_state" :size="12" class="text-subtle" />
              <Badge v-if="entry.to_state" tone="info">{{ entry.to_state }}</Badge>
            </span>
          </KeyValue>
        </template>
        <KeyValue label="Recorded">
          <span :title="formatDateTime(entry.created_at)">{{ formatRelative(entry.created_at) }}</span>
        </KeyValue>
        <KeyValue label="Exact time">
          <span class="mono text-[11.5px]">{{ formatDateTime(entry.created_at) }}</span>
        </KeyValue>
      </div>

      <template v-if="hasDetails">
        <p class="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subtle">Details</p>
        <CodeBlock :content="entry.details" language="json" max-height="320px" />
      </template>
      <p v-else class="text-[13px] text-subtle">No additional details for this event.</p>
    </template>
  </Drawer>
</template>
