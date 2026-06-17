<script setup lang="ts">
/**
 * Modal for adding or updating a resource within a pool.
 * DESIGN_REFERENCE §POST /api/v1/pools/{pool_id}/resources (resources.md)
 * DESIGN_REFERENCE §PUT  /api/v1/pools/{pool_id}/resources/{resource_id} (resources.md)
 *
 * When `resource` prop is provided, the modal is in edit mode (PUT).
 * Business rules enforced:
 * - resource_key and name: 1–255 chars
 * - weight >= 1
 * - warmup_start: YYYY-MM-DD or empty
 * - resource_key is immutable — shown read-only in edit mode
 */
import { reactive, ref, computed, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { addPoolResource, updatePoolResource } from '@/api/pools'
import {
  validateForm,
  required,
  maxLength,
  min,
  pattern,
} from '@/lib/validation'
import { errorMessage } from '@/api/errors'
import type { PoolResource } from '@/api/types/pools'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const props = defineProps<{
  open: boolean
  poolId: string
  resource?: PoolResource | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: [resource: PoolResource]
}>()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const ui = useUiStore()
const isEdit = computed(() => !!props.resource)

const defaultForm = () => ({
  resource_key: '',
  name: '',
  weight: '1',
  daily_cap: '0',
  warmup_start: '',
  warmup_days: '0',
  warmup_start_cap: '0',
})

const form = reactive(defaultForm())
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

// Populate form from existing resource in edit mode
watch(
  () => props.resource,
  (r) => {
    if (r) {
      form.resource_key = r.resource_key
      form.name = r.name
      form.weight = String(r.weight)
      form.daily_cap = String(r.daily_cap)
      form.warmup_start = r.warmup_start ?? ''
      form.warmup_days = String(r.warmup_days)
      form.warmup_start_cap = String(r.warmup_start_cap)
    } else {
      Object.assign(form, defaultForm())
    }
  },
  { immediate: true },
)

function validate() {
  const rules: Parameters<typeof validateForm>[1] = {
    name: [required('Name'), maxLength(255, 'Name')],
    weight: [required('Weight'), min(1, 'Weight')],
  }
  if (!isEdit.value) {
    rules.resource_key = [required('Resource key'), maxLength(255, 'Resource key')]
  }
  if (form.warmup_start.trim() !== '') {
    rules.warmup_start = [pattern(DATE_RE, 'Warmup start must be in YYYY-MM-DD format.')]
  }
  const { errors: e, valid } = validateForm(form as Record<string, unknown>, rules)
  errors.value = e
  return valid
}

async function submit() {
  if (!validate()) return
  submitting.value = true
  try {
    let saved: PoolResource
    if (isEdit.value && props.resource) {
      saved = await updatePoolResource(props.poolId, props.resource.id, {
        name: form.name.trim() || undefined,
        weight: Number(form.weight) || undefined,
        daily_cap: Number(form.daily_cap),
        warmup_start: form.warmup_start.trim() || null,
        warmup_days: Number(form.warmup_days),
        warmup_start_cap: Number(form.warmup_start_cap),
      })
      ui.success('Resource updated', saved.name)
    } else {
      saved = await addPoolResource(props.poolId, {
        resource_key: form.resource_key.trim(),
        name: form.name.trim(),
        weight: Number(form.weight),
        daily_cap: Number(form.daily_cap),
        warmup_start: form.warmup_start.trim() || null,
        warmup_days: Number(form.warmup_days),
        warmup_start_cap: Number(form.warmup_start_cap),
      })
      ui.success('Resource added', saved.name)
    }
    emit('saved', saved)
    open.value = false
  } catch (e) {
    ui.error(isEdit.value ? 'Failed to update resource' : 'Failed to add resource', errorMessage(e))
  } finally {
    submitting.value = false
  }
}

function onClose() {
  open.value = false
  errors.value = {}
}
</script>

<template>
  <Modal
    :open="open"
    :title="isEdit ? 'Edit Resource' : 'Add Resource'"
    size="md"
    @update:open="onClose"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <Field
        label="Resource key"
        :error="errors.resource_key"
        :required="!isEdit"
        hint="Opaque identifier for this resource (e.g. email address, IP). Cannot be changed after creation."
      >
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.resource_key"
            placeholder="sender@company.com"
            mono
            :invalid="invalid"
            :disabled="isEdit"
            :readonly="isEdit"
          />
        </template>
      </Field>

      <Field label="Display name" :error="errors.name" required>
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.name" placeholder="Primary Sender" :invalid="invalid" />
        </template>
      </Field>

      <div class="grid grid-cols-2 gap-3">
        <Field
          label="Weight"
          :error="errors.weight"
          required
          hint="Used for weighted rotation (≥ 1)."
        >
          <template #default="{ id, invalid }">
            <Input :id="id" v-model="form.weight" type="number" min="1" :invalid="invalid" />
          </template>
        </Field>

        <Field label="Daily cap" hint="Max assignments/day. 0 = unlimited.">
          <template #default="{ id }">
            <Input :id="id" v-model="form.daily_cap" type="number" min="0" />
          </template>
        </Field>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <Field
          label="Warmup start"
          :error="errors.warmup_start"
          hint="YYYY-MM-DD. Leave blank for no warmup."
        >
          <template #default="{ id, invalid }">
            <Input :id="id" v-model="form.warmup_start" placeholder="2026-06-17" :invalid="invalid" />
          </template>
        </Field>

        <Field label="Warmup days" hint="Duration of ramp-up period.">
          <template #default="{ id }">
            <Input :id="id" v-model="form.warmup_days" type="number" min="0" />
          </template>
        </Field>

        <Field label="Warmup start cap" hint="Starting daily cap during warmup.">
          <template #default="{ id }">
            <Input :id="id" v-model="form.warmup_start_cap" type="number" min="0" />
          </template>
        </Field>
      </div>
    </form>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">
        {{ isEdit ? 'Save changes' : 'Add resource' }}
      </Button>
    </template>
  </Modal>
</template>
