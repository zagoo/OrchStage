<script setup lang="ts">
/**
 * Modal for creating a new trigger.
 * No update endpoint exists (triggers are immutable after creation).
 * DESIGN_REFERENCE §POST /api/v1/triggers
 */
import { reactive, ref, computed } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { createTrigger } from '@/api/triggers'
import { validateForm, required, slug, maxLength, jsonRule } from '@/lib/validation'
import { errorMessage } from '@/api/errors'
import type { TriggerDef, TriggerType } from '@/api/types/triggers'
import type { SelectOption } from '@/components/ui/Select.vue'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [trigger: TriggerDef]
}>()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const conn = useConnectionStore()
const ui = useUiStore()

const defaultForm = () => ({
  slug: '',
  sequence_name: '',
  trigger_type: 'webhook' as TriggerType,
  namespace: 'default',
  config: '',
  secret: '',
})

const form = reactive(defaultForm())
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

const triggerTypeOptions: SelectOption[] = [
  { value: 'webhook', label: 'Webhook' },
  { value: 'event', label: 'Event (in-process)' },
  { value: 'nats', label: 'NATS' },
  { value: 'file_watch', label: 'File Watch' },
  { value: 'activepieces_poll', label: 'ActivePieces Poll' },
]

function validate() {
  const { errors: e, valid } = validateForm(form as Record<string, unknown>, {
    slug: [required('Slug'), slug('Slug'), maxLength(255, 'Slug')],
    sequence_name: [required('Sequence name'), maxLength(255, 'Sequence name')],
    trigger_type: [required('Trigger type')],
    config: [jsonRule('Config JSON')],
  })
  errors.value = e
  return valid
}

async function submit() {
  if (!validate()) return
  submitting.value = true
  try {
    const configJson = form.config.trim() ? (JSON.parse(form.config) as unknown) : null
    const trigger = await createTrigger({
      slug: form.slug.trim(),
      sequence_name: form.sequence_name.trim(),
      trigger_type: form.trigger_type,
      namespace: form.namespace.trim() || 'default',
      config: configJson,
      secret: form.secret.trim() || null,
      tenant_id: conn.tenantId,
    })
    ui.success('Trigger created', trigger.slug)
    emit('created', trigger)
    open.value = false
    Object.assign(form, defaultForm())
    errors.value = {}
  } catch (e) {
    ui.error('Failed to create trigger', errorMessage(e))
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
  <Modal :open="open" title="Create Trigger" size="md" @update:open="onClose">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <Field label="Slug" :error="errors.slug" required hint="URL-safe identifier: lowercase letters, digits, hyphens.">
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.slug" placeholder="on-push" mono :invalid="invalid" />
        </template>
      </Field>

      <Field label="Sequence name" :error="errors.sequence_name" required>
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.sequence_name" placeholder="ci-pipeline" :invalid="invalid" />
        </template>
      </Field>

      <Field label="Trigger type" :error="errors.trigger_type" required>
        <template #default="{ id, invalid }">
          <Select :id="id" v-model="form.trigger_type" :options="triggerTypeOptions" :invalid="invalid" />
        </template>
      </Field>

      <Field label="Namespace" hint="Namespace for created instances (default: 'default').">
        <template #default="{ id }">
          <Input :id="id" v-model="form.namespace" placeholder="default" mono />
        </template>
      </Field>

      <Field label="Config JSON" :error="errors.config" hint="Type-specific configuration object. Leave blank for webhook/event.">
        <template #default="{ id, invalid }">
          <Textarea :id="id" v-model="form.config" placeholder='{"piece":"stripe","trigger":"new_payment"}' :rows="4" :invalid="invalid" />
        </template>
      </Field>

      <Field label="Secret" hint="Optional. Callers must pass X-Trigger-Secret matching this value.">
        <template #default="{ id }">
          <Input :id="id" v-model="form.secret" type="password" placeholder="(leave blank for no secret)" />
        </template>
      </Field>
    </form>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">Create trigger</Button>
    </template>
  </Modal>
</template>
