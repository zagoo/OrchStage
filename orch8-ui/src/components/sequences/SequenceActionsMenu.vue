<script setup lang="ts">
/**
 * Action buttons for a sequence: set status, promote, unpublish, delete.
 * DESIGN_REFERENCE §9.7–9.11 (dag-sequences.md)
 */
import { ref, computed } from 'vue'
import { Rocket, BookX, Trash2, CheckCircle, RotateCcw } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import {
  setSequenceStatus,
  promoteSequence,
  deleteSequence,
  createSequence,
} from '@/api/sequences'
import { isApiError, errorMessage } from '@/api/errors'
import type { SequenceDefinition, SequenceStatus, CreateSequenceRequest } from '@/api/types/sequences'
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

const ALL_STATUSES: SequenceStatus[] = ['draft', 'staging', 'production', 'unpublished']

// The server's status state machine is strictly FORWARD + in-place (verified live):
//   draft → staging|unpublished, staging → production|unpublished,
//   production → unpublished, unpublished → ∅ (terminal).
// Any other target (going backward, or reviving an unpublished sequence) is reached
// by publishing a NEW VERSION at that status — there is no in-place path.
const inPlaceTransitions: Record<SequenceStatus, SequenceStatus[]> = {
  draft: ['staging', 'unpublished'],
  staging: ['production', 'unpublished'],
  production: ['unpublished'],
  unpublished: [],
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const isUnpublished = computed(() => props.sequence.status === 'unpublished')
const targetIsInPlace = computed(() => inPlaceTransitions[props.sequence.status].includes(targetStatus.value))

// Offer EVERY status except the current one, so the full lifecycle is reachable.
// Non-forward targets are labelled "(new version)" so the effect is explicit.
function statusOptions(): SelectOption[] {
  const allowed = inPlaceTransitions[props.sequence.status]
  return ALL_STATUSES.filter((s) => s !== props.sequence.status).map((s) => ({
    value: s,
    label: allowed.includes(s) ? cap(s) : `${cap(s)} (new version)`,
  }))
}

function openStatusModal() {
  const opts = statusOptions()
  if (opts.length) targetStatus.value = opts[0].value as SequenceStatus
  showStatusModal.value = true
}

async function applySetStatus() {
  busy.value = true
  try {
    if (targetIsInPlace.value) {
      // Server-supported in-place forward transition.
      await setSequenceStatus(props.sequence.id, { status: targetStatus.value })
      ui.success('Status updated', `${props.sequence.name} → ${targetStatus.value}`)
    } else {
      // No in-place path (backward, or reviving a terminal 'unpublished' sequence) —
      // publish a NEW VERSION at the target status. This is how republishing works.
      const seq = props.sequence
      const body: CreateSequenceRequest = {
        ...seq,
        id: crypto.randomUUID(),
        version: seq.version + 1,
        status: targetStatus.value,
        deprecated: false,
        created_at: new Date().toISOString(),
      }
      const res = await createSequence(body)
      const warn = res.warnings?.length ? ` · ${res.warnings.join('; ')}` : ''
      ui.success(
        isUnpublished.value ? 'Republished' : 'New version published',
        `${seq.name} v${body.version} → ${targetStatus.value}${warn}`,
      )
    }
    showStatusModal.value = false
    emit('changed')
  } catch (e) {
    if (isApiError(e) && e.status === 400) {
      ui.error('Invalid transition', e.message)
    } else if (isApiError(e) && e.status === 409) {
      ui.error('Version exists', `A v${props.sequence.version + 1} already exists for "${props.sequence.name}".`)
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
    message: 'Sets this version’s status to Unpublished. Running instances are not affected.',
    tone: 'danger',
    confirmText: 'Unpublish',
  })
  if (!ok) return
  busy.value = true
  try {
    // The standalone POST /unpublish endpoint is a near no-op on a single version;
    // the real unpublish is the in-place status transition (same path as
    // "Set status → Unpublished"), which every non-terminal status permits.
    await setSequenceStatus(props.sequence.id, { status: 'unpublished' })
    ui.success('Unpublished', `${props.sequence.name} → unpublished`)
    emit('changed')
  } catch (e) {
    if (isApiError(e) && e.status === 400) {
      ui.error('Cannot unpublish', e.message)
    } else {
      ui.error('Unpublish failed', errorMessage(e))
    }
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
    <!-- Set status / Republish (always available — full lifecycle is reachable) -->
    <Button size="sm" variant="ghost" :disabled="busy" @click="openStatusModal">
      <template #icon><component :is="isUnpublished ? RotateCcw : CheckCircle" :size="14" /></template>
      {{ isUnpublished ? 'Republish' : 'Set status' }}
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
  <Modal
    v-model:open="showStatusModal"
    :title="isUnpublished ? 'Republish sequence' : 'Set sequence status'"
    size="sm"
  >
    <div class="flex flex-col gap-4">
      <p class="text-[13px] text-muted">
        Current status: <strong>{{ sequence.status }}</strong>
      </p>
      <Field label="New status">
        <template #default="{ id }">
          <Select :id="id" v-model="targetStatus" :options="statusOptions()" />
        </template>
      </Field>
      <p class="text-[12px] leading-relaxed text-muted">
        <template v-if="targetIsInPlace">Updates the current version’s status in place.</template>
        <template v-else>
          Publishes a new version (<strong>v{{ sequence.version + 1 }}</strong>) at “{{ targetStatus }}” — the server has
          no in-place path from “{{ sequence.status }}”.
        </template>
      </p>
    </div>
    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="busy" @click="applySetStatus">
        {{ targetIsInPlace ? 'Apply' : 'Publish new version' }}
      </Button>
    </template>
  </Modal>
</template>
