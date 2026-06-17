<script setup lang="ts">
/**
 * Drawer showing trigger detail: config, poll state, metadata.
 * DESIGN_REFERENCE §GET /api/v1/triggers/{slug}
 */
import { computed } from 'vue'
import { Zap, Clock, Info } from 'lucide-vue-next'
import type { TriggerDef } from '@/api/types/triggers'
import { formatDateTime, formatRelative, prettyJson, titleCase } from '@/lib/format'
import Drawer from '@/components/ui/Drawer.vue'
import Badge from '@/components/ui/Badge.vue'
import KeyValue from '@/components/ui/KeyValue.vue'
import CodeBlock from '@/components/ui/CodeBlock.vue'

const props = defineProps<{ trigger: TriggerDef | null }>()
const open = defineModel<boolean>('open', { required: true })

const triggerTypeTone = {
  webhook: 'accent',
  event: 'purple',
  nats: 'cyan',
  file_watch: 'teal',
  activepieces_poll: 'pink',
} as const

const configJson = computed(() =>
  props.trigger?.config != null ? prettyJson(props.trigger.config) : null,
)
const pollStateJson = computed(() =>
  props.trigger?.poll_state != null ? prettyJson(props.trigger.poll_state) : null,
)
</script>

<template>
  <Drawer v-model:open="open" :title="trigger?.slug ?? 'Trigger'">
    <template v-if="trigger">
      <div class="flex items-center gap-2 mb-4">
        <Zap :size="16" class="text-accent" />
        <span class="text-[15px] font-semibold text-text mono">{{ trigger.slug }}</span>
        <Badge :tone="triggerTypeTone[trigger.trigger_type] ?? 'neutral'">{{ titleCase(trigger.trigger_type) }}</Badge>
        <Badge :tone="trigger.enabled ? 'success' : 'neutral'">{{ trigger.enabled ? 'Enabled' : 'Disabled' }}</Badge>
      </div>

      <div class="divide-y divide-border rounded-lg border border-border bg-surface mb-4">
        <KeyValue label="Sequence">{{ trigger.sequence_name }}</KeyValue>
        <KeyValue v-if="trigger.version != null" label="Version">{{ trigger.version }}</KeyValue>
        <KeyValue label="Namespace"><span class="mono">{{ trigger.namespace }}</span></KeyValue>
        <KeyValue label="Tenant ID"><span class="mono">{{ trigger.tenant_id }}</span></KeyValue>
        <KeyValue label="Secret">
          <Badge v-if="trigger.secret" tone="warning">Configured</Badge>
          <span v-else class="text-subtle">None</span>
        </KeyValue>
        <KeyValue label="Created">
          <span :title="formatDateTime(trigger.created_at)">{{ formatRelative(trigger.created_at) }}</span>
        </KeyValue>
        <KeyValue label="Updated">
          <span :title="formatDateTime(trigger.updated_at)">{{ formatRelative(trigger.updated_at) }}</span>
        </KeyValue>
      </div>

      <template v-if="configJson">
        <p class="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-subtle">
          <Info :size="12" /> Config
        </p>
        <CodeBlock :content="configJson" language="json" class="mb-4" />
      </template>

      <template v-if="trigger.trigger_type === 'activepieces_poll'">
        <p class="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-subtle">
          <Clock :size="12" /> Poll state
        </p>
        <div v-if="trigger.poll_state" class="divide-y divide-border rounded-lg border border-border bg-surface mb-4">
          <KeyValue label="Last poll">{{ formatDateTime(trigger.poll_state.last_poll_at) }}</KeyValue>
          <KeyValue label="Consecutive failures">
            <Badge :tone="trigger.poll_state.consecutive_failures > 0 ? 'danger' : 'success'">
              {{ trigger.poll_state.consecutive_failures }}
            </Badge>
          </KeyValue>
          <KeyValue v-if="trigger.poll_state.last_error" label="Last error">
            <span class="text-danger text-[12px]">{{ trigger.poll_state.last_error }}</span>
          </KeyValue>
        </div>
        <p v-else class="text-[13px] text-subtle">No poll state yet — engine hasn't polled this trigger.</p>
        <template v-if="pollStateJson">
          <CodeBlock :content="pollStateJson" language="json" />
        </template>
      </template>
    </template>
  </Drawer>
</template>
