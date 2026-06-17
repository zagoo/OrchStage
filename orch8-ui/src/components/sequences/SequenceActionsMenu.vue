<script setup lang="ts">
/**
 * Action buttons for a sequence: set status, promote, unpublish, delete.
 * DESIGN_REFERENCE §9.7–9.11 (dag-sequences.md)
 */
import { ref } from 'vue'
import { Rocket, BookX, Trash2, CheckCircle } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import {
  setSequenceStatus,
  promoteSequence,
  unpublishSequence,
  deleteSequence,
} from '@/api/sequences'
import { isApiError, errorMessage } from '@/api/errors'
import type { SequenceDefinition, SequenceStatus } from '@/api/types/sequences'
import Modal from '@/components/ui/Modal.vue'
import Select from '@/components/ui/Select.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import type { SelectOption } from '@/components/ui/Select.vue'

const props = defineProps<{ sequence: SequenceDefinition }>()
const emit = defineEmits<{ changed: []; deleted: [] }>()

const ui = useUiStore()
const busy = ref(false)
const showStatusModal = ref(false)
const targetStatus = ref<SequenceStatus>('staging')

// Valid transitions from dag-sequences.md §2
const transitions: Record<SequenceStatus, SequenceStatus[]> = {
  draft: ['staging', 'unpublished'],
  staging: ['production', 'unpublished'],
  production: ['unpublished'],
  unpublished: [],
}

function validTargetOptions(): SelectOption[] {
  return transitions[props.sequence.status].map((s) => ({
    value: s,
    label: s.charAt(0).toUpperCase() + s.slice(1),
  }))
}

function openStatusModal() {
  const opts = validTargetOptions()
  if (opts.length) targetStatus.value = opts[0].value as SequenceStatus
  showStatusModal.value = true
}

async function applySetStatus() {
  busy.value = true
  try {
    await setSequenceStatus(props.sequence.id, { status: targetStatus.value })
    ui.success('Status updated', `${props.sequence.name} → ${targetStatus.value}`)
    showStatusModal.value = false
    emit('changed')
  } catch (e) {
    if (isApiError(e) && e.status === 400) {
      ui.error('Invalid transition', e.message)
    } else {
      ui.error('Status update failed', errorMessage(e))
    }
  } finally {
    busy.value = false
  }
}

async function handlePromote() {
  if (props.sequence.status !== 'staging') {
    ui.warning('Cannot promote', 'Only sequences in Staging status can be promoted.')
    return
  }
  const ok = await ui.confirm({
    title: `Promote "${props.sequence.name}" to production?`,
    message: 'This will create a new version with status Production and increment the version number.',
    tone: 'default',
    confirmText: 'Promote',
  })
  if (!ok) return
  busy.value = true
  try {
    const res = await promoteSequence(props.sequence.name)
    ui.success('Promoted', `${props.sequence.name} v${res.version} is now in production`)
    emit('changed')
  } catch (e) {
    if (isApiError(e) && e.status === 400) {
      ui.error('Cannot promote', e.message)
    } else {
      ui.error('Promote failed', errorMessage(e))
    }
  } finally {
    busy.value = false
  }
}

async function handleUnpublish() {
  const ok = await ui.confirm({
    title: `Unpublish "${props.sequence.name}"?`,
    message: 'All versions of this sequence will be marked deprecated and unpublished. Running instances are not affected.',
    tone: 'danger',
    confirmText: 'Unpublish',
  })
  if (!ok) return
  busy.value = true
  try {
    await unpublishSequence(props.sequence.name, { delete: false })
    ui.success('Unpublished', props.sequence.name)
    emit('changed')
  } catch (e) {
    ui.error('Unpublish failed', errorMessage(e))
  } finally {
    busy.value = false
  }
}

async function handleDelete() {
  const ok = await ui.confirm({
    title: `Delete "${props.sequence.name}"?`,
    message: 'This sequence will be permanently deleted. This action is blocked if active instances exist.',
    tone: 'danger',
    confirmText: 'Delete sequence',
  })
  if (!ok) return
  busy.value = true
  try {
    await deleteSequence(props.sequence.id)
    ui.success('Deleted', props.sequence.name)
    emit('deleted')
  } catch (e) {
    if (isApiError(e) && e.status === 409) {
      ui.error('Cannot delete', 'Active instances reference this sequence. Complete or cancel them first.')
    } else {
      ui.error('Delete failed', errorMessage(e))
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Set status -->
    <Button
      v-if="validTargetOptions().length > 0"
      size="sm"
      variant="ghost"
      :disabled="busy"
      @click="openStatusModal"
    >
      <template #icon><CheckCircle :size="14" /></template>
      Set status
    </Button>

    <!-- Promote (staging only) -->
    <Button
      v-if="sequence.status === 'staging'"
      size="sm"
      variant="ghost"
      :disabled="busy"
      @click="handlePromote"
    >
      <template #icon><Rocket :size="14" /></template>
      Promote
    </Button>

    <!-- Unpublish -->
    <Button
      v-if="sequence.status !== 'unpublished'"
      size="sm"
      variant="ghost"
      :disabled="busy"
      @click="handleUnpublish"
    >
      <template #icon><BookX :size="14" /></template>
      Unpublish
    </Button>

    <!-- Delete -->
    <Button size="sm" variant="danger-outline" :disabled="busy" @click="handleDelete">
      <template #icon><Trash2 :size="14" /></template>
      Delete
    </Button>
  </div>

  <!-- Status change modal -->
  <Modal v-model:open="showStatusModal" title="Set sequence status" size="sm">
    <div class="flex flex-col gap-4">
      <p class="text-[13px] text-muted">
        Current status: <strong>{{ sequence.status }}</strong>
      </p>
      <Field label="New status">
        <template #default="{ id }">
          <Select
            :id="id"
            v-model="targetStatus"
            :options="validTargetOptions()"
          />
        </template>
      </Field>
    </div>
    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="busy" @click="applySetStatus">Apply</Button>
    </template>
  </Modal>
</template>
