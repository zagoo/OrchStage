<script setup lang="ts">
/**
 * Checkpoints tab — list, create, restore (resume-from-block), prune.
 * DESIGN_REFERENCE §Instances §Checkpoints
 */
import { ref, onMounted } from 'vue'
import { DatabaseBackup, Plus, RotateCcw, Scissors, RefreshCw } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useAsync } from '@/composables/useAsync'
import { listCheckpoints, saveCheckpoint, pruneCheckpoints } from '@/api/instancesAdvanced'
import { resumeFromBlock } from '@/api/instances'
import { errorMessage } from '@/api/errors'
import { formatRelative, formatDateTime, prettyJson } from '@/lib/format'
import type { Checkpoint } from '@/api/types/instancesAdvanced'
import type { Column } from '@/components/ui/DataTable.vue'
import Panel from '@/components/ui/Panel.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Textarea from '@/components/ui/Textarea.vue'
import CodeBlock from '@/components/ui/CodeBlock.vue'

const props = defineProps<{ instanceId: string }>()

const ui = useUiStore()
const showCreate = ref(false)
const newCheckpointJson = ref('{}')
const createJsonError = ref<string | null>(null)
const creating = ref(false)
const showDetail = ref(false)
const selectedCp = ref<Checkpoint | null>(null)

const loader = useAsync((signal) => listCheckpoints(props.instanceId, signal))
const { data: checkpoints, loading, error } = loader

onMounted(() => void loader.run())

const columns: Column[] = [
  { key: 'id', header: 'ID', mono: true, width: '260px' },
  { key: 'created_at', header: 'Created', width: '160px' },
  { key: '_actions', header: '', width: '120px', align: 'right' },
]

async function handleCreate() {
  createJsonError.value = null
  let data: unknown
  try { data = JSON.parse(newCheckpointJson.value) } catch { createJsonError.value = 'Invalid JSON.'; return }
  creating.value = true
  try {
    await saveCheckpoint(props.instanceId, { checkpoint_data: data })
    ui.success('Checkpoint saved')
    showCreate.value = false
    void loader.run()
  } catch (e) {
    ui.error('Save failed', errorMessage(e))
  } finally {
    creating.value = false
  }
}

async function handleRestore(cp: Checkpoint) {
  const ok = await ui.confirm({
    title: 'Restore from checkpoint?',
    message: `This will resume the instance from checkpoint ${cp.id.slice(0, 8)}…. The instance must be in a quiescent state (failed/paused/completed/cancelled).`,
    tone: 'danger',
    confirmText: 'Restore',
  })
  if (!ok) return
  // A checkpoint "restore" is implemented as resume-from-block using
  // the block stored in checkpoint_data.completed_blocks (last entry).
  const data = cp.checkpoint_data as Record<string, unknown>
  const blocks = Array.isArray(data.completed_blocks) ? (data.completed_blocks as string[]) : []
  const targetBlock = blocks[blocks.length - 1]
  if (!targetBlock) { ui.error('No block in checkpoint', 'checkpoint_data.completed_blocks is empty.'); return }
  try {
    await resumeFromBlock(props.instanceId, targetBlock, {})
    ui.success('Restored', `Resuming from block: ${targetBlock}`)
    void loader.run()
  } catch (e) {
    ui.error('Restore failed', errorMessage(e))
  }
}

async function handlePrune() {
  const ok = await ui.confirm({
    title: 'Prune checkpoints?',
    message: 'Keep the 5 most recent checkpoints and delete the rest.',
    tone: 'danger',
    confirmText: 'Prune',
  })
  if (!ok) return
  try {
    const res = await pruneCheckpoints(props.instanceId, { keep: 5 })
    ui.success('Pruned', `${res.count} checkpoint(s) deleted`)
    void loader.run()
  } catch (e) {
    ui.error('Prune failed', errorMessage(e))
  }
}

function openDetail(cp: Checkpoint) {
  selectedCp.value = cp
  showDetail.value = true
}
</script>

<template>
  <Panel>
    <template #header>
      <div class="flex items-center gap-2">
        <DatabaseBackup :size="15" class="text-muted" />
        <span class="text-[13px] font-semibold text-text">Checkpoints</span>
      </div>
    </template>
    <template #actions>
      <IconButton label="Refresh checkpoints" size="sm" @click="loader.run()">
        <RefreshCw :size="13" :class="loading && 'animate-spin'" />
      </IconButton>
      <Button size="sm" variant="ghost" @click="handlePrune">
        <template #icon><Scissors :size="13" /></template>
        Prune (keep 5)
      </Button>
      <Button size="sm" variant="primary" @click="() => { newCheckpointJson = '{}'; showCreate = true }">
        <template #icon><Plus :size="13" /></template>
        Save checkpoint
      </Button>
    </template>

    <div v-if="error" class="mb-3 rounded border border-danger/30 bg-danger-soft p-3 text-[12.5px] text-danger">
      {{ error.message }}
      <button class="ml-2 underline" @click="loader.run()">Retry</button>
    </div>

    <DataTable
      :columns="columns"
      :rows="checkpoints ?? []"
      :row-key="(r) => r.id"
      :loading="loading"
      :clickable="true"
      empty-title="No checkpoints"
      empty-description="Save a checkpoint to create a recovery point for this workflow run."
      @row-click="openDetail"
    >
      <template #cell-id="{ row }">
        <span class="mono text-[12px]">{{ row.id }}</span>
      </template>
      <template #cell-created_at="{ row }">
        <span :title="formatDateTime(row.created_at)" class="text-subtle">
          {{ formatRelative(row.created_at) }}
        </span>
      </template>
      <template #cell-_actions="{ row }">
        <div class="flex justify-end gap-1">
          <IconButton label="Restore from checkpoint" size="sm" @click.stop="handleRestore(row)">
            <RotateCcw :size="13" />
          </IconButton>
        </div>
      </template>
    </DataTable>
  </Panel>

  <!-- Create modal -->
  <Modal v-model:open="showCreate" title="Save Checkpoint" size="md">
    <div class="flex flex-col gap-4">
      <Field label="Checkpoint data (JSON)" :error="createJsonError">
        <template #default="{ id, invalid }">
          <Textarea
            :id="id"
            v-model="newCheckpointJson"
            :rows="8"
            :invalid="!!invalid"
            class="mono text-[12px]"
            placeholder='{ "completed_blocks": ["fetch_user"], "context_snapshot": {} }'
          />
        </template>
      </Field>
    </div>
    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="creating" @click="handleCreate">
        <template #icon><DatabaseBackup :size="13" /></template>
        Save
      </Button>
    </template>
  </Modal>

  <!-- Detail modal -->
  <Modal v-if="selectedCp" v-model:open="showDetail" title="Checkpoint Data" size="lg">
    <CodeBlock :content="prettyJson(selectedCp.checkpoint_data)" language="json" />
  </Modal>
</template>
