<script setup lang="ts">
/**
 * Overview tab — instance metadata KeyValues, context CodeBlock, children list.
 * DESIGN_REFERENCE §Instances §4 Get Instance, §5 Get Instance Children
 */
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Users, ExternalLink } from 'lucide-vue-next'
import { useAsync } from '@/composables/useAsync'
import { useConnectionStore } from '@/stores/connection'
import { useSequencesStore } from '@/stores/sequences'
import { getInstanceChildren } from '@/api/instances'
import { formatDateTime, formatRelative, prettyJson, shortId } from '@/lib/format'
import type { TaskInstance } from '@/api/types/instances'
import type { Column } from '@/components/ui/DataTable.vue'
import Panel from '@/components/ui/Panel.vue'
import KeyValue from '@/components/ui/KeyValue.vue'
import CodeBlock from '@/components/ui/CodeBlock.vue'
import DataTable from '@/components/ui/DataTable.vue'
import StateBadge from '@/components/instances/StateBadge.vue'

const props = defineProps<{ instance: TaskInstance }>()
const router = useRouter()
const conn = useConnectionStore()
const seqStore = useSequencesStore()

const childrenLoader = useAsync((signal) => getInstanceChildren(props.instance.id, signal))
const { data: children, loading: childrenLoading, error: childrenError } = childrenLoader

// Resolve sequence_id → name/version for the metadata rows below.
const seqInfo = computed(() => seqStore.sequenceById(props.instance.sequence_id))

onMounted(() => {
  void seqStore.loadCatalog(conn.tenantId)
  void childrenLoader.run()
})

const childColumns: Column[] = [
  { key: 'id',          header: 'ID',       mono: true, width: '200px' },
  { key: 'sequence_id', header: 'Sequence', mono: true, width: '200px' },
  { key: 'state',       header: 'State',    width: '130px' },
  { key: 'created_at',  header: 'Created',  width: '150px' },
]

function navigateChild(row: TaskInstance) {
  void router.push(`/instances/${row.id}`)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Metadata panel -->
    <Panel title="Instance Metadata">
      <dl class="divide-y divide-border">
        <KeyValue label="ID">
          <span class="mono text-[12px]">{{ instance.id }}</span>
        </KeyValue>
        <KeyValue label="Sequence">
          <router-link
            :to="`/sequences/${instance.sequence_id}`"
            class="mono flex items-center gap-1 text-[12px] text-accent hover:underline"
          >
            {{ shortId(instance.sequence_id) }}
            <ExternalLink :size="11" />
          </router-link>
        </KeyValue>
        <KeyValue v-if="seqInfo" label="Sequence name">{{ seqInfo.name }}</KeyValue>
        <KeyValue v-if="seqInfo" label="Sequence version">
          <span class="mono">v{{ seqInfo.version }}</span>
        </KeyValue>
        <KeyValue label="Tenant">{{ instance.tenant_id }}</KeyValue>
        <KeyValue label="Namespace">
          <span class="mono">{{ instance.namespace }}</span>
        </KeyValue>
        <KeyValue label="State">
          <StateBadge :state="instance.state" :show-dot="instance.state === 'running'" />
        </KeyValue>
        <KeyValue label="Priority">{{ instance.priority }}</KeyValue>
        <KeyValue label="Timezone">{{ instance.timezone }}</KeyValue>
        <KeyValue label="Created">
          <span :title="formatDateTime(instance.created_at)">{{ formatRelative(instance.created_at) }}</span>
        </KeyValue>
        <KeyValue label="Updated">
          <span :title="formatDateTime(instance.updated_at)">{{ formatRelative(instance.updated_at) }}</span>
        </KeyValue>
        <KeyValue v-if="instance.next_fire_at" label="Next fire">
          <span :title="formatDateTime(instance.next_fire_at)">{{ formatRelative(instance.next_fire_at) }}</span>
        </KeyValue>
        <KeyValue v-if="instance.idempotency_key" label="Instance Key">
          <span class="mono text-[12px]">{{ instance.idempotency_key }}</span>
        </KeyValue>
        <KeyValue v-if="instance.concurrency_key" label="Concurrency key">
          <span class="mono text-[12px]">{{ instance.concurrency_key }}</span>
        </KeyValue>
        <KeyValue v-if="instance.max_concurrency != null" label="Max concurrency">
          {{ instance.max_concurrency }}
        </KeyValue>
        <KeyValue v-if="instance.session_id" label="Session">
          <span class="mono text-[12px]">{{ shortId(instance.session_id) }}</span>
        </KeyValue>
        <KeyValue v-if="instance.parent_instance_id" label="Parent instance">
          <router-link
            :to="`/instances/${instance.parent_instance_id}`"
            class="mono flex items-center gap-1 text-[12px] text-accent hover:underline"
          >
            {{ shortId(instance.parent_instance_id) }}
            <ExternalLink :size="11" />
          </router-link>
        </KeyValue>
      </dl>
    </Panel>

    <!-- Budget panel (conditional) -->
    <Panel v-if="instance.budget" title="Budget">
      <dl class="divide-y divide-border">
        <KeyValue v-if="instance.budget.max_input_tokens != null" label="Max input tokens">
          {{ instance.budget.max_input_tokens.toLocaleString() }}
        </KeyValue>
        <KeyValue v-if="instance.budget.max_output_tokens != null" label="Max output tokens">
          {{ instance.budget.max_output_tokens.toLocaleString() }}
        </KeyValue>
        <KeyValue v-if="instance.budget.max_total_tokens != null" label="Max total tokens">
          {{ instance.budget.max_total_tokens.toLocaleString() }}
        </KeyValue>
        <KeyValue v-if="instance.budget.max_steps != null" label="Max steps">
          {{ instance.budget.max_steps.toLocaleString() }}
        </KeyValue>
      </dl>
    </Panel>

    <!-- Context panel -->
    <Panel title="Execution Context">
      <CodeBlock :content="prettyJson(instance.context)" language="json" :max-height="'320px'" />
    </Panel>

    <!-- Metadata JSON panel (if non-empty) -->
    <Panel
      v-if="instance.metadata && typeof instance.metadata === 'object' && Object.keys(instance.metadata as object).length > 0"
      title="Metadata"
    >
      <CodeBlock :content="prettyJson(instance.metadata)" language="json" :max-height="'200px'" />
    </Panel>

    <!-- Children panel -->
    <Panel>
      <template #header>
        <div class="flex items-center gap-2">
          <Users :size="15" class="text-muted" />
          <span class="text-[13px] font-semibold text-text">Child Instances</span>
        </div>
      </template>

      <div
        v-if="childrenError"
        class="mb-3 rounded border border-danger/30 bg-danger-soft p-3 text-[12.5px] text-danger"
      >
        Failed to load children.
        <button class="ml-2 underline" @click="childrenLoader.run()">Retry</button>
      </div>

      <DataTable
        :columns="childColumns"
        :rows="children ?? []"
        :row-key="(r) => r.id"
        :loading="childrenLoading"
        :clickable="true"
        empty-title="No child instances"
        empty-description="This instance has not spawned any sub-sequence children."
        @row-click="navigateChild"
      >
        <template #cell-id="{ row }">
          <span class="mono text-[12px]">{{ shortId(row.id) }}</span>
        </template>
        <template #cell-sequence_id="{ row }">
          <span class="mono text-[12px] text-subtle">{{ shortId(row.sequence_id) }}</span>
        </template>
        <template #cell-state="{ row }">
          <StateBadge :state="row.state" />
        </template>
        <template #cell-created_at="{ row }">
          <span :title="formatDateTime(row.created_at)" class="text-subtle">
            {{ formatRelative(row.created_at) }}
          </span>
        </template>
      </DataTable>
    </Panel>
  </div>
</template>
