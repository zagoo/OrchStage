<script setup lang="ts">
/**
 * Modal for creating/updating a version pin for a (tenant, handler) pair.
 * DESIGN_REFERENCE §POST /workers/version-pins
 */
import { ref, watch } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import { useUiStore } from '@/stores/ui'
import { setVersionPin } from '@/api/workers'
import { errorMessage } from '@/api/errors'
import { validateForm, required } from '@/lib/validation'

const props = defineProps<{ tenantId: string; prefillHandler?: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const ui = useUiStore()

const form = ref({ handler_name: '', min_version: '' })
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

watch(open, (v) => {
  if (!v) return
  form.value = { handler_name: props.prefillHandler ?? '', min_version: '' }
  errors.value = {}
})

async function submit() {
  const { errors: e, valid } = validateForm(form.value, {
    handler_name: [required('Handler name')],
    min_version: [required('Minimum version')],
  })
  errors.value = e
  if (!valid) return

  submitting.value = true
  try {
    await setVersionPin({
      tenant_id: props.tenantId,
      handler_name: form.value.handler_name.trim(),
      min_version: form.value.min_version.trim(),
    })
    ui.success('Version pin saved', `${form.value.handler_name} ≥ ${form.value.min_version}`)
    open.value = false
    emit('saved')
  } catch (e) {
    ui.error('Failed to save pin', errorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Set Version Pin" size="sm">
    <div class="flex flex-col gap-4">
      <p class="text-[13px] text-subtle">
        Workers reporting a version below the minimum will receive an empty task list. The constraint is
        evaluated on each poll call.
      </p>

      <Field label="Handler name" :error="errors.handler_name" required>
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.handler_name"
            :invalid="invalid"
            placeholder="send-email"
            class="mono"
          />
        </template>
      </Field>

      <Field label="Minimum version" :error="errors.min_version" required hint="e.g. 1.5.0 or 2024-06-17">
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.min_version"
            :invalid="invalid"
            placeholder="1.5.0"
            class="mono"
          />
        </template>
      </Field>
    </div>

    <template #footer>
      <Button variant="ghost" @click="open = false">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">
        Save pin
      </Button>
    </template>
  </Modal>
</template>
