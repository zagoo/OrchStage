<script setup lang="ts">
/**
 * Create rollback policy modal.
 * Validates all fields per DESIGN_REFERENCE §POST /api/v1/rollback-policies.
 *
 * Required:
 *   sequence_name        non-empty
 *   error_rate_threshold [0.0, 1.0]
 *   time_window_secs     > 0
 * Optional:
 *   cooldown_secs        ≥ 0 (default 3600)
 *   confirmation_window_secs ≥ 0 (default 60; 0 = immediate)
 *   webhook_url          http/https URL or empty
 */
import { reactive, ref, computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { createRollbackPolicy } from '@/api/rollback'
import { validateForm, required, range, min } from '@/lib/validation'
import { errorMessage } from '@/api/errors'
import type { RollbackPolicy } from '@/api/types/ops'
import type { FieldRule } from '@/lib/validation'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [policy: RollbackPolicy]
}>()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const ui = useUiStore()

interface FormState {
  sequence_name: string
  error_rate_threshold: string
  time_window_secs: string
  cooldown_secs: string
  confirmation_window_secs: string
  webhook_url: string
}

const defaultForm = (): FormState => ({
  sequence_name: '',
  error_rate_threshold: '0.05',
  time_window_secs: '300',
  cooldown_secs: '3600',
  confirmation_window_secs: '60',
  webhook_url: '',
})

const form = reactive<FormState>(defaultForm())
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

/** Webhook URL must be http/https with a host, or empty. */
const webhookUrlRule: FieldRule = (v) => {
  if (typeof v !== 'string' || v.trim() === '') return null
  try {
    const u = new URL(v.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return 'Webhook URL must use http or https.'
    }
    if (!u.hostname) return 'Webhook URL must have a host.'
    return null
  } catch {
    return 'Webhook URL must be a valid URL.'
  }
}

function validate() {
  const { errors: e, valid } = validateForm(form as unknown as Record<string, unknown>, {
    sequence_name: [required('Sequence name')],
    error_rate_threshold: [required('Error rate threshold'), range(0, 1, 'Error rate threshold')],
    time_window_secs: [required('Time window'), min(1, 'Time window')],
    cooldown_secs: [min(0, 'Cooldown')],
    confirmation_window_secs: [min(0, 'Confirmation window')],
    webhook_url: [webhookUrlRule],
  })
  errors.value = e
  return valid
}

async function submit() {
  if (!validate()) return
  submitting.value = true
  try {
    const policy = await createRollbackPolicy({
      sequence_name: form.sequence_name.trim(),
      error_rate_threshold: Number(form.error_rate_threshold),
      time_window_secs: Number(form.time_window_secs),
      cooldown_secs: form.cooldown_secs !== '' ? Number(form.cooldown_secs) : null,
      confirmation_window_secs: form.confirmation_window_secs !== '' ? Number(form.confirmation_window_secs) : null,
      webhook_url: form.webhook_url.trim() || null,
    })
    ui.success('Policy created', policy.sequence_name)
    emit('created', policy)
    open.value = false
    Object.assign(form, defaultForm())
    errors.value = {}
  } catch (e) {
    ui.error('Failed to create policy', errorMessage(e))
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
  <Modal :open="open" title="New Rollback Policy" size="md" @update:open="onClose">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <Field
        label="Sequence name"
        :error="errors.sequence_name"
        required
        hint="The sequence this policy monitors. Must match exactly."
      >
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.sequence_name"
            placeholder="checkout-flow"
            mono
            :invalid="invalid"
          />
        </template>
      </Field>

      <Field
        label="Error rate threshold"
        :error="errors.error_rate_threshold"
        required
        hint="Fraction [0.0–1.0] of failed instances that triggers a rollback (e.g. 0.05 = 5%)."
      >
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.error_rate_threshold"
            type="number"
            step="0.01"
            min="0"
            max="1"
            placeholder="0.05"
            :invalid="invalid"
          />
        </template>
      </Field>

      <Field
        label="Time window (seconds)"
        :error="errors.time_window_secs"
        required
        hint="Rolling window over which the error rate is measured. Must be > 0."
      >
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.time_window_secs"
            type="number"
            min="1"
            placeholder="300"
            :invalid="invalid"
          />
        </template>
      </Field>

      <Field
        label="Cooldown (seconds)"
        :error="errors.cooldown_secs"
        hint="Minimum seconds between consecutive rollback triggers (default: 3600)."
      >
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.cooldown_secs"
            type="number"
            min="0"
            placeholder="3600"
            :invalid="invalid"
          />
        </template>
      </Field>

      <Field
        label="Confirmation window (seconds)"
        :error="errors.confirmation_window_secs"
        hint="Error rate must exceed threshold for this many seconds before triggering. 0 = trigger immediately (default: 60)."
      >
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.confirmation_window_secs"
            type="number"
            min="0"
            placeholder="60"
            :invalid="invalid"
          />
        </template>
      </Field>

      <Field
        label="Alert webhook URL"
        :error="errors.webhook_url"
        hint="Optional. An http/https URL that receives a POST when this policy triggers."
      >
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.webhook_url"
            type="url"
            placeholder="https://hooks.example.com/alerts"
            :invalid="invalid"
          />
        </template>
      </Field>
    </form>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">Create policy</Button>
    </template>
  </Modal>
</template>
