<script setup lang="ts">
/**
 * Outputs tab — block outputs with sentinel row highlighting.
 * DESIGN_REFERENCE §Instances §GET /instances/{id}/outputs
 */
import { onMounted } from 'vue'
import { RefreshCw, AlertTriangle } from 'lucide-vue-next'
import { useAsync } from '@/composables/useAsync'
import { getOutputs } from '@/api/instancesAdvanced'
import { formatRelative, formatDateTime, prettyJson, formatBytes } from '@/lib/format'
import type { BlockOutput } from '@/api/types/instancesAdvanced'
import type { Column } from '@/components/ui/DataTable.vue'
import Panel from '@/components/ui/Panel.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Badge from '@/components/ui/Badge.vue'
import Tooltip from '@/components/ui/Tooltip.vue'

const props = defineProps<{ instanceId: string }>()

const loader = useAsync((signal) => getOutputs(props.instanceId, signal))
const { data: outputs, loading, error } = loader

onMounted(() => void loader.run())

const columns: Column[] = [
  { key: 'block_id',   header: 'Block',    mono: true, width: '200px' },
  { key: 'attempt',    header: 'Attempt',  width: '80px', align: 'center' },
  { key: 'output_ref', header: 'Ref/Sentinel', width: '150px' },
  { key: 'output_size', header: 'Size',   width: '80px', align: 'right' },
  { key: 'created_at', header: 'Completed', width: '150px' },
  { key: '_preview',   header: 'Output',   width: '260px' },
]

const SENTINEL_TONE: Record<string, string> = {
  '__in_progress__': 'warning',
  '__retry__':       'warning',
  '__error__':       'danger',
}

function isSentinel(row: BlockOutput): boolean {
  return row.output_ref === '__in_progress__' || row.output_ref === '__retry__' || row.output_ref === '__error__'
}
</script>

<template>
  <Panel>
    <template #header>
      <span class="text-[13px] font-semibold text-text">Block Outputs</span>
    </template>
    <template #actions>
      <IconButton label="Refresh outputs" size="sm" @click="loader.run()">
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

    <DataTable
      :columns="columns"
      :rows="outputs ?? []"
      :row-key="(r) => `${r.id}-${r.attempt}`"
      :loading="loading"
      empty-title="No outputs"
      empty-description="No block outputs have been recorded for this instance yet."
    >
      <template #cell-block_id="{ row }">
        <span class="mono text-[12px]">{{ row.block_id }}</span>
      </template>

      <template #cell-attempt="{ row }">
        <span class="tabular-nums text-subtle">{{ row.attempt }}</span>
      </template>

      <template #cell-output_ref="{ row }">
        <Badge
          v-if="row.output_ref"
          :tone="(SENTINEL_TONE[row.output_ref] ?? 'neutral') as 'warning' | 'danger' | 'neutral'"
          class="mono text-[10px]"
        >
          <AlertTriangle v-if="isSentinel(row)" :size="10" />
          {{ row.output_ref }}
        </Badge>
        <span v-else class="text-subtle">—</span>
      </template>

      <template #cell-output_size="{ row }">
        <span class="tabular-nums text-subtle">{{ formatBytes(row.output_size) }}</span>
      </template>

      <template #cell-created_at="{ row }">
        <span :title="formatDateTime(row.created_at)" class="text-subtle">
          {{ formatRelative(row.created_at) }}
        </span>
      </template>

      <template #cell-_preview="{ row }">
        <Tooltip v-if="!isSentinel(row) && row.output != null" :text="prettyJson(row.output)">
          <span class="mono truncate text-[11px] text-subtle" style="max-width: 240px; display: block">
            {{ prettyJson(row.output).slice(0, 80) }}
          </span>
        </Tooltip>
        <span v-else-if="isSentinel(row)" class="text-[11px] text-faint italic">sentinel row</span>
        <span v-else class="text-subtle">—</span>
      </template>
    </DataTable>
  </Panel>
</template>
