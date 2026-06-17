<script setup lang="ts">
/**
 * Modal for creating a new resource pool.
 * DESIGN_REFERENCE §POST /api/v1/pools (resources.md)
 */
import { reactive, ref, computed } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { createPool } from '@/api/pools'
import { validateForm, required } from '@/lib/validation'
import { errorMessage } from '@/api/errors'
import type { ResourcePool, RotationStrategy } from '@/api/types/pools'
import type { SelectOption } from '@/components/ui/Select.vue'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [pool: ResourcePool]
}>()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const conn = useConnectionStore()
const ui = useUiStore()

const defaultForm = () => ({
  name: '',
  strategy: 'round_robin' as RotationStrategy,
})

const form = reactive(defaultForm())
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

const strategyOptions: SelectOption[] = [
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'weighted', label: 'Weighted' },
  { value: 'random', label: 'Random' },
]

function validate() {
  const { errors: e, valid } = validateForm(form as Record<string, unknown>, {
    name: [required('Name')],
  })
  errors.value = e
  return valid
}

async function submit() {
  if (!validate()) return
  submitting.value = true
  try {
    const pool = await createPool({
      name: form.name.trim(),
      strategy: form.strategy,
      tenant_id: conn.tenantId || '',
    })
    ui.success('Pool created', pool.name)
    emit('created', pool)
    open.value = false
    Object.assign(form, defaultForm())
    errors.value = {}
  } catch (e) {
    ui.error('Failed to create pool', errorMessage(e))
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
  <Modal :open="open" title="Create Resource Pool" size="sm" @update:open="onClose">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <Field label="Name" :error="errors.name" required>
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.name" placeholder="Email Sender Pool" :invalid="invalid" />
        </template>
      </Field>

      <Field label="Rotation strategy" hint="Round Robin is recommended for balanced distribution.">
        <template #default="{ id }">
          <Select :id="id" v-model="form.strategy" :options="strategyOptions" />
        </template>
      </Field>
    </form>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">Create pool</Button>
    </template>
  </Modal>
</template>
