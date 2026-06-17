<script setup lang="ts">
/**
 * Drawer showing approval item details: instance link, prompt, choices,
 * metadata, and deadline countdown.
 * DESIGN_REFERENCE §Approvals §1.1 ApprovalItem Schema
 */
import { Clock, MessageSquareDot } from 'lucide-vue-next'
import { formatRelative, formatDateTime, shortId } from '@/lib/format'
import type { ApprovalItem } from '@/api/types/approvals'
import Drawer from '@/components/ui/Drawer.vue'
import Badge from '@/components/ui/Badge.vue'
import KeyValue from '@/components/ui/KeyValue.vue'
import CodeBlock from '@/components/ui/CodeBlock.vue'

defineProps<{
  approval: ApprovalItem | null
}>()

const open = defineModel<boolean>('open', { required: true })

function deadlineTone(deadline: string | null): 'danger' | 'warning' | 'neutral' {
  if (!deadline) return 'neutral'
  const msLeft = new Date(deadline).getTime() - Date.now()
  if (msLeft < 0) return 'danger'
  if (msLeft < 3_600_000) return 'warning' // < 1h
  return 'neutral'
}
</script>

<template>
  <Drawer v-model:open="open" :title="approval?.sequence_name ?? 'Approval'" width="520px">
    <template v-if="approval">
      <!-- header metadata -->
      <div class="mb-4 rounded-md border border-border bg-surface-2 px-4 py-3">
        <p class="text-[13px] font-medium leading-snug text-text">{{ approval.prompt }}</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <Badge tone="info">{{ approval.namespace }}</Badge>
          <Badge v-if="approval.allow_comment" tone="purple">
            <MessageSquareDot :size="11" class="mr-1 inline" />
            Comment allowed
          </Badge>
        </div>
      </div>

      <!-- key-value details -->
      <dl class="divide-y divide-border rounded-md border border-border bg-surface">
        <KeyValue label="Instance ID">
          <span class="mono text-[12px]">{{ shortId(approval.instance_id) }}</span>
        </KeyValue>
        <KeyValue label="Sequence">
          <span class="mono text-[12px]">{{ approval.sequence_name }}</span>
        </KeyValue>
        <KeyValue label="Block ID">
          <span class="mono text-[12px]">{{ approval.block_id }}</span>
        </KeyValue>
        <KeyValue label="Store result as">
          <span class="mono text-[12px]">{{ approval.store_as ?? approval.block_id }}</span>
        </KeyValue>
        <KeyValue label="Waiting since">
          <span :title="formatDateTime(approval.waiting_since)" class="text-text">
            {{ formatRelative(approval.waiting_since) }}
          </span>
        </KeyValue>
        <KeyValue v-if="approval.deadline" label="Deadline">
          <Badge :tone="deadlineTone(approval.deadline)">
            <Clock :size="11" class="mr-1 inline" />
            {{ formatRelative(approval.deadline) }}
          </Badge>
        </KeyValue>
        <KeyValue v-if="approval.escalation_handler" label="Escalation handler">
          <span class="mono text-[12px]">{{ approval.escalation_handler }}</span>
        </KeyValue>
      </dl>

      <!-- choices -->
      <div class="mt-4">
        <p class="mb-2 text-[12.5px] font-medium text-muted">Available choices</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="c in approval.choices"
            :key="c.value"
            class="rounded-md border border-border-strong bg-surface-2 px-2.5 py-1 text-[12.5px] text-text"
          >
            {{ c.label }}
            <span class="ml-1 text-faint">({{ c.value }})</span>
          </span>
        </div>
      </div>

      <!-- metadata -->
      <div v-if="approval.metadata && Object.keys(approval.metadata as Record<string, unknown>).length" class="mt-4">
        <p class="mb-2 text-[12.5px] font-medium text-muted">Instance metadata</p>
        <CodeBlock :content="approval.metadata" language="json" />
      </div>
    </template>

    <div v-else class="text-[13px] text-subtle">No approval selected.</div>
  </Drawer>
</template>
