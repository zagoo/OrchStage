<script setup lang="ts">
/**
 * Modal for creating/updating a queue dispatch configuration.
 * DESIGN_REFERENCE §POST /queues/dispatch
 */
import { ref, watch, computed } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import { useUiStore } from '@/stores/ui'
import { setDispatch } from '@/api/queues'
import { errorMessage } from '@/api/errors'
import { validateForm, required } from '@/lib/validation'
import type { QueueDispatchConfig, DispatchMode } from '@/api/types/queues'
import type { SelectOption } from '@/components/ui/Select.vue'

const props = defineProps<{ existing?: QueueDispatchConfig | null; tenantId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [cfg: QueueDispatchConfig] }>()

const ui = useUiStore()
const isEdit = computed(() => !!props.existing)

const modeOptions: SelectOption[] = [
  { value: 'poll', label: 'Poll — workers pull tasks on schedule' },
  { value: 'push', label: 'Push — engine POSTs tasks to a URL' },
]

interface Form {
  queue_name: string
  mode: string
  push_url: string
  secret: string
}

const form = ref<Form>({ queue_name: '', mode: 'poll', push_url: '', secret: '' })
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

watch(open, (v) => {
  if (!v) return
  if (props.existing) {
    form.value = {
      queue_name: props.existing.queue_name,
      mode: props.existing.mode,
      push_url: props.existing.push_url ?? '',
      secret: '',
    }
  } else {
    form.value = { queue_name: '', mode: 'poll', push_url: '', secret: '' }
  }
  errors.value = {}
})

async function submit() {
  const schema: Parameters<typeof validateForm>[1] = {
    queue_name: [required('Queue name')],
    mode: [required('Mode')],
  }
  if (form.value.mode === 'push') {
    schema.push_url = [required('Push URL')]
  }

  const { errors: e, valid } = validateForm(form.value, schema)
  errors.value = e
  if (!valid) return

  submitting.value = true
  try {
    const body = {
      tenant_id: props.tenantId,
      queue_name: form.value.queue_name.trim(),
      mode: form.value.mode as DispatchMode,
      push_url: form.value.mode === 'push' ? form.value.push_url.trim() : null,
      secret: form.value.secret.trim() || null,
    }
    const result = await setDispatch(body)
    ui.success('Dispatch config saved', result.queue_name)
    open.value = false
    emit('saved', result)
  } catch (e) {
    ui.error('Save failed', errorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal v-model:open="open" :title="isEdit ? 'Edit Dispatch Config' : 'New Dispatch Config'" size="sm">
    <div class="flex flex-col gap-4">
      <Field label="Queue name" :error="errors.queue_name" required>
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.queue_name"
            :invalid="invalid"
            :disabled="isEdit"
            placeholder="bulk-email"
            class="mono"
          />
        </template>
      </Field>

      <Field label="Mode" :error="errors.mode" required>
        <template #default="{ id, invalid }">
          <Select :id="id" v-model="form.mode" :options="modeOptions" :invalid="invalid" />
        </template>
      </Field>

      <Field
        v-if="form.mode === 'push'"
        label="Push URL"
        :error="errors.push_url"
        required
        hint="The engine will POST signed task envelopes to this URL."
      >
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.push_url"
            :invalid="invalid"
            placeholder="https://worker.example.com/tasks"
          />
        </template>
      </Field>

      <Field
        label="HMAC secret (optional)"
        :error="errors.secret"
        hint="Write-only — not echoed in responses. Leave blank to keep the existing secret."
      >
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.secret"
            :invalid="invalid"
            type="password"
            placeholder="sk-…"
            class="mono"
          />
        </template>
      </Field>
    </div>

    <template #footer>
      <Button variant="ghost" @click="open = false">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">
        {{ isEdit ? 'Save changes' : 'Create config' }}
      </Button>
    </template>
  </Modal>
</template>
