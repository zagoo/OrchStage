<script setup lang="ts">
/**
 * Modal for sending a control command (drain/reload/ping) to a specific worker.
 * DESIGN_REFERENCE §POST /workers/commands
 */
import { ref, watch } from 'vue'
import { Terminal } from 'lucide-vue-next'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { useUiStore } from '@/stores/ui'
import { enqueueCommand } from '@/api/workers'
import { errorMessage } from '@/api/errors'
import { validateForm, required } from '@/lib/validation'
import type { WorkerCommandKind } from '@/api/types/workers'
import type { SelectOption } from '@/components/ui/Select.vue'

const props = defineProps<{ workerId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ queued: [] }>()

const ui = useUiStore()

const commandOptions: SelectOption[] = [
  { value: 'ping', label: 'Ping — liveness probe (instant ack)' },
  { value: 'reload', label: 'Reload — re-read config and re-register' },
  { value: 'drain', label: 'Drain — stop claiming new tasks then idle' },
]

interface Form {
  command: string
  payload: string
}

const form = ref<Form>({ command: 'ping', payload: '' })
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

watch(open, (v) => {
  if (!v) return
  form.value = { command: 'ping', payload: '' }
  errors.value = {}
})

async function submit() {
  const { errors: e, valid } = validateForm(form.value, {
    command: [required('Command')],
  })
  errors.value = e
  if (!valid) return

  let payload: unknown = {}
  if (form.value.payload.trim()) {
    try {
      payload = JSON.parse(form.value.payload) as unknown
    } catch {
      errors.value.payload = 'Payload must be valid JSON.'
      return
    }
  }

  submitting.value = true
  try {
    await enqueueCommand({
      worker_id: props.workerId,
      command: form.value.command as WorkerCommandKind,
      payload,
    })
    ui.success('Command queued', `${form.value.command} → ${props.workerId}`)
    open.value = false
    emit('queued')
  } catch (e) {
    ui.error('Command failed', errorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Send Worker Command" size="sm">
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
        <Terminal :size="14" class="shrink-0 text-muted" />
        <span class="mono text-[12px] text-text">{{ workerId }}</span>
      </div>

      <Field label="Command" :error="errors.command" required>
        <template #default="{ id, invalid }">
          <Select
            :id="id"
            v-model="form.command"
            :options="commandOptions"
            :invalid="invalid"
          />
        </template>
      </Field>

      <Field
        label="Payload (optional JSON)"
        :error="errors.payload"
        hint="e.g. { &quot;deadline&quot;: &quot;2026-06-17T11:00:00Z&quot; } for drain"
      >
        <template #default="{ id, invalid }">
          <Textarea
            :id="id"
            v-model="form.payload"
            :invalid="invalid"
            placeholder="{}"
            class="mono min-h-[80px] text-[12px]"
          />
        </template>
      </Field>
    </div>

    <template #footer>
      <Button variant="ghost" @click="open = false">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">
        Send command
      </Button>
    </template>
  </Modal>
</template>
