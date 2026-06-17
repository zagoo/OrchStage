<script setup lang="ts">
/**
 * Modal to manually drive an instance's state machine (PATCH /state).
 * DESIGN_REFERENCE §Instances §7 Update Instance State
 */
import { ref, computed, watch } from 'vue'
import { Workflow } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { updateInstanceState } from '@/api/instances'
import { errorMessage } from '@/api/errors'
import type { InstanceState } from '@/api/types/instances'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Select from '@/components/ui/Select.vue'

const props = defineProps<{ instanceId: string; currentState: InstanceState }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ updated: [] }>()

const ui = useUiStore()
const targetState = ref<InstanceState>('scheduled')
const submitting = ref(false)

// Allowed transitions per state machine (instances-core.md)
const TRANSITIONS: Partial<Record<InstanceState, InstanceState[]>> = {
  scheduled: ['running', 'paused', 'cancelled'],
  running: ['scheduled', 'waiting', 'completed', 'failed', 'paused', 'cancelled'],
  waiting: ['running', 'scheduled', 'cancelled', 'failed'],
  paused: ['scheduled', 'cancelled'],
  failed: ['scheduled'],
  completed: ['scheduled'],
  cancelled: ['scheduled'],
}

const options = computed(() => {
  const allowed = TRANSITIONS[props.currentState] ?? []
  return allowed.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))
})

watch(open, (v) => {
  if (v && options.value.length) {
    targetState.value = options.value[0].value as InstanceState
  }
})

async function handleUpdate() {
  const ok = await ui.confirm({
    title: `Transition to "${targetState.value}"?`,
    message: `This will move instance from "${props.currentState}" → "${targetState.value}". Ensure this is safe before proceeding.`,
    tone: 'danger',
    confirmText: 'Apply transition',
  })
  if (!ok) return
  submitting.value = true
  try {
    await updateInstanceState(props.instanceId, { state: targetState.value })
    ui.success('State updated', `→ ${targetState.value}`)
    open.value = false
    emit('updated')
  } catch (e) {
    ui.error('State update failed', errorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Edit Instance State" size="sm">
    <div class="flex flex-col gap-4">
      <div class="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-[12.5px]">
        Current state: <span class="font-semibold text-text">{{ currentState }}</span>
      </div>

      <Field v-if="options.length" label="Target state" :error="null" required>
        <template #default="{ id }">
          <Select :id="id" v-model="targetState" :options="options" />
        </template>
      </Field>
      <p v-else class="text-[13px] text-muted">
        No valid transitions are available from "{{ currentState }}" via this endpoint.
      </p>
    </div>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button
        v-if="options.length"
        variant="primary"
        :loading="submitting"
        @click="handleUpdate"
      >
        <template #icon><Workflow :size="14" /></template>
        Apply transition
      </Button>
    </template>
  </Modal>
</template>
