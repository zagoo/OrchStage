<script setup lang="ts">
/**
 * Artifacts tab — list + download binary artifacts produced by steps.
 * DESIGN_REFERENCE §Instances §GET /instances/{id}/artifacts, §GET /artifacts/{*key}
 */
import { onMounted } from 'vue'
import { RefreshCw, Download, FileBox } from 'lucide-vue-next'
import { useAsync } from '@/composables/useAsync'
import { useUiStore } from '@/stores/ui'
import { listArtifacts, fetchArtifactBytes } from '@/api/instancesAdvanced'
import { errorMessage } from '@/api/errors'
import { formatBytes } from '@/lib/format'
import type { ArtifactMeta } from '@/api/types/instancesAdvanced'
import type { Column } from '@/components/ui/DataTable.vue'
import Panel from '@/components/ui/Panel.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{ instanceId: string }>()
const ui = useUiStore()

const loader = useAsync((signal) => listArtifacts(props.instanceId, signal))
const { data: artifacts, loading, error } = loader

onMounted(() => void loader.run())

const columns: Column[] = [
  { key: 'key',  header: 'Key',  mono: true },
  { key: 'size', header: 'Size', width: '100px', align: 'right' },
  { key: '_dl',  header: '',     width: '80px',  align: 'right' },
]

async function download(artifact: ArtifactMeta) {
  try {
    const resp = await fetchArtifactBytes(artifact.key)
    if (!resp.ok) { ui.error('Download failed', `HTTP ${resp.status}`); return }
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const name = artifact.key.split('/').pop() ?? artifact.key
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    ui.error('Download failed', errorMessage(e))
  }
}
</script>

<template>
  <Panel>
    <template #header>
      <div class="flex items-center gap-2">
        <FileBox :size="15" class="text-muted" />
        <span class="text-[13px] font-semibold text-text">Artifacts</span>
      </div>
    </template>
    <template #actions>
      <IconButton label="Refresh artifacts" size="sm" @click="loader.run()">
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
      :rows="artifacts ?? []"
      :row-key="(r) => r.key"
      :loading="loading"
      empty-title="No artifacts"
      empty-description="Steps have not produced any binary artifacts for this instance."
    >
      <template #cell-key="{ row }">
        <span class="mono text-[12px] truncate">{{ row.key }}</span>
      </template>
      <template #cell-size="{ row }">
        <span class="tabular-nums text-subtle">{{ formatBytes(row.size) }}</span>
      </template>
      <template #cell-_dl="{ row }">
        <Button size="sm" variant="ghost" @click="download(row)">
          <template #icon><Download :size="12" /></template>
          Download
        </Button>
      </template>
    </DataTable>
  </Panel>
</template>
