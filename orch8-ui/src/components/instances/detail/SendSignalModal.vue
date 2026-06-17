<script setup lang="ts">
/**
 * Modal to send a signal (pause/resume/cancel/custom) to an instance.
 * Validates that custom signals include the "custom:" prefix.
 * DESIGN_REFERENCE §Instances §11 Send Signal
 */
import { ref, computed, watch } from 'vue'
import { Radio } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { sendSignal } from '@/api/instances'
import { errorMessage } from '@/api/errors'
import { validateForm, required } from '@/lib/validation'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Select from '@/components/ui/Select.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'

const props = defineProps<{ instanceId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ sent: [] }>()

const ui = useUiStore()

const signalType = ref<string>('pause')
const customName = ref('')
const payloadStr = ref('{}')
const submitting = ref(false)
const errors = ref<Record<string, string | null>>({})

const SIGNAL_OPTIONS = [
  { value: 'pause', label: 'Pause' },
  { value: 'resume', label: 'Resume' },
  { value: 'cancel', label: 'Cancel' },
  { value: 'update_context', label: 'Update Context' },
  { value: 'custom', label: 'Custom signal…' },
]

const isCustom = computed(() => signalType.value === 'custom')
const needsPayload = computed(() => ['update_context', 'custom'].includes(signalType.value))

watch(open, (v) => {
  if (v) {
    signalType.value = 'pause'
    customName.value = ''
    payloadStr.value = '{}'
    errors.value = {}
  }
})

function validate(): boolean {
  const schema: Record<string, ReturnType<typeof required>[]> = {}
  if (isCustom.value) {
    schema.customName = [required('Custom signal name')]
  }
  if (needsPayload.value) {
    schema.payloadStr = [required('Payload'), (v: unknown) => {
      try { JSON.parse(v as string); return null } catch { return 'Payload must be valid JSON.' }
    }]
  }
  const form: Record<string, unknown> = { customName: customName.value, payloadStr: payloadStr.value }
  const res = validateForm(form, schema)
  errors.value = res.errors
  return res.valid
}

async function handleSend() {
  if (!validate()) return
  const wireType = isCustom.value ? `custom:${customName.value.trim()}` : signalType.value
  let payload: unknown = {}
  if (needsPayload.value) {
    try { payload = JSON.parse(payloadStr.value) } catch { return }
  }
  submitting.value = true
  try {
    await sendSignal(props.instanceId, { signal_type: wireType, payload })
    ui.success('Signal sent', wireType)
    open.value = false
    emit('sent')
  } catch (e) {
    ui.error('Signal failed', errorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Send Signal" size="sm">
    <div class="flex flex-col gap-4">
      <Field label="Signal type" :error="null" required>
        <template #default="{ id }">
          <Select :id="id" v-model="signalType" :options="SIGNAL_OPTIONS" />
        </template>
      </Field>

      <Field v-if="isCustom" label="Custom signal name" :error="errors.customName">
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="customName"
            placeholder="e.g. order_approved"
            :invalid="!!invalid"
          />
        </template>
      </Field>
      <p v-if="isCustom" class="text-[12px] text-subtle -mt-2">
        Wire format: <span class="mono">custom:{{ customName || '…' }}</span>
      </p>

      <Field v-if="needsPayload" label="Payload (JSON)" :error="errors.payloadStr">
        <template #default="{ id, invalid }">
          <Textarea
            :id="id"
            v-model="payloadStr"
            :rows="6"
            :invalid="!!invalid"
            class="mono text-[12px]"
          />
        </template>
      </Field>
    </div>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="handleSend">
        <template #icon><Radio :size="14" /></template>
        Send signal
      </Button>
    </template>
  </Modal>
</template>
