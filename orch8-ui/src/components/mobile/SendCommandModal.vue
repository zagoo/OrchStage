<script setup lang="ts">
/**
 * Modal for sending an operator command to a mobile device.
 * The device application interprets command_type; payload is arbitrary JSON.
 * DESIGN_REFERENCE §POST /api/v1/mobile/commands (mobile-sync.md Endpoint 7)
 */
import { reactive, ref, computed } from 'vue'
import { Terminal } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { createMobileCommand } from '@/api/mobile'
import { validateForm, required, jsonRule } from '@/lib/validation'
import { errorMessage } from '@/api/errors'
import type { SelectOption } from '@/components/ui/Select.vue'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{
  open: boolean
  /** Pre-fill device_id when launched from a specific device row */
  presetDeviceId?: string | null
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  sent: []
}>()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const ui = useUiStore()

const presetCommandOptions: SelectOption[] = [
  { value: 'pause', label: 'pause — Pause execution on device' },
  { value: 'resume', label: 'resume — Resume execution on device' },
  { value: 'cancel', label: 'cancel — Cancel current operation' },
  { value: 'ping', label: 'ping — Keepalive probe' },
  { value: 'reload_config', label: 'reload_config — Force config reload' },
  { value: 'custom', label: '(custom) — Enter manually below' },
]

const defaultForm = () => ({
  device_id: props.presetDeviceId ?? '',
  command_type_preset: 'pause',
  command_type_custom: '',
  payload: '{}',
})

const form = reactive(defaultForm())
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

const effectiveCommandType = computed(() =>
  form.command_type_preset === 'custom'
    ? form.command_type_custom.trim()
    : form.command_type_preset,
)

function validate() {
  const formToValidate: Record<string, unknown> = {
    device_id: form.device_id,
    command_type_custom: form.command_type_preset === 'custom' ? form.command_type_custom : 'ok',
    payload: form.payload,
  }
  const { errors: e, valid } = validateForm(formToValidate, {
    device_id: [required('Device ID')],
    command_type_custom: form.command_type_preset === 'custom' ? [required('Command type')] : [],
    payload: [required('Payload'), jsonRule('Payload')],
  })
  errors.value = e
  return valid
}

async function submit() {
  if (!validate()) return
  submitting.value = true
  try {
    const parsedPayload = JSON.parse(form.payload) as unknown
    await createMobileCommand({
      device_id: form.device_id.trim(),
      command_type: effectiveCommandType.value,
      payload: parsedPayload,
    })
    ui.success('Command sent', `${effectiveCommandType.value} → ${form.device_id.trim()}`)
    emit('sent')
    open.value = false
    Object.assign(form, defaultForm())
    errors.value = {}
  } catch (e) {
    ui.error('Command failed', errorMessage(e))
  } finally {
    submitting.value = false
  }
}

function onClose() {
  open.value = false
  Object.assign(form, defaultForm())
  errors.value = {}
}
</script>

<template>
  <Modal :open="open" title="Send Command" size="md" @update:open="onClose">
    <div class="mb-4 flex items-center gap-2 text-[13px] text-subtle">
      <Terminal :size="15" />
      <span>The command is placed in the device's inbox and delivered on the next sync poll or via silent push.</span>
    </div>

    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <Field label="Device ID" :error="errors.device_id" required hint="Target device that will receive the command.">
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.device_id" placeholder="00000000-0000-0000-0000-000000000000" mono :invalid="invalid" />
        </template>
      </Field>

      <Field label="Command type" required>
        <template #default="{ id }">
          <Select :id="id" v-model="form.command_type_preset" :options="presetCommandOptions" />
        </template>
      </Field>

      <Field
        v-if="form.command_type_preset === 'custom'"
        label="Custom command type"
        :error="errors.command_type_custom"
        required
        hint="Arbitrary string — the device application must recognize it."
      >
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.command_type_custom" placeholder="my_custom_command" mono :invalid="invalid" />
        </template>
      </Field>

      <Field label="Payload (JSON)" :error="errors.payload" required hint="JSON object sent as the command payload.">
        <template #default="{ id, invalid }">
          <Textarea :id="id" v-model="form.payload" placeholder='{"key": "value"}' :rows="4" :invalid="invalid" />
        </template>
      </Field>
    </form>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">
        <template #icon><Terminal :size="14" /></template>
        Send command
      </Button>
    </template>
  </Modal>
</template>
