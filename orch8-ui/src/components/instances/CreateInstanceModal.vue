<script setup lang="ts">
/**
 * Create instance modal — supports single and batch (JSON array) creation.
 * Validates: required fields, UUID sequence_id, JSON context, batch array.
 * DESIGN_REFERENCE §Instances §1 Create Instance; §2 Create Instances Batch
 */
import { ref, computed, watch } from 'vue'
import { Plus, Layers, SquarePlus } from 'lucide-vue-next'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Button from '@/components/ui/Button.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { createInstance, createInstancesBatch } from '@/api/instances'
import { errorMessage, isApiError } from '@/api/errors'
import {
  validateForm,
  required,
  jsonRule,
  isValidJson,
} from '@/lib/validation'
import type { Priority } from '@/api/types/instances'
import SequenceSelect from '@/components/sequences/SequenceSelect.vue'
import { useSequencesStore } from '@/stores/sequences'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [] }>()

const ui = useUiStore()
const conn = useConnectionStore()
const seqStore = useSequencesStore()

type Mode = 'single' | 'batch'
const mode = ref<Mode>('single')

const modeSegments = [
  { value: 'single', label: 'Single', icon: SquarePlus },
  { value: 'batch',  label: 'Batch',  icon: Layers },
]

// --- single form ---
const form = ref({
  sequence_id: '',
  namespace: conn.tenantId ? '' : '',
  priority: 'Normal' as Priority,
  idempotency_key: '',
  context_data: '{}',
  context_config: '{}',
})

const errors = ref<Record<string, string | null>>({})
const saving = ref(false)

// --- batch form ---
const batchJson = ref(`[
  {
    "sequence_id": "",
    "tenant_id": "${conn.tenantId ?? ''}",
    "namespace": "default",
    "context": { "data": {} }
  }
]`)
const batchError = ref<string | null>(null)

const priorityOptions = [
  { value: 'Low',      label: 'Low' },
  { value: 'Normal',   label: 'Normal' },
  { value: 'High',     label: 'High' },
  { value: 'Critical', label: 'Critical' },
]

const canSubmit = computed(() => !saving.value)

watch(open, (v) => {
  if (v) {
    // Force a fresh catalog every time the picker opens — this is the decision point,
    // so it must show sequences (and versions) published since the page was loaded,
    // not a stale cache from when the page was first opened.
    void seqStore.loadCatalog(conn.tenantId, true)
    return
  }
  {
    // reset on close
    mode.value = 'single'
    form.value = {
      sequence_id: '',
      namespace: '',
      priority: 'Normal',
      idempotency_key: '',
      context_data: '{}',
      context_config: '{}',
    }
    errors.value = {}
    batchError.value = null
    saving.value = false
  }
})

function validateSingle(): boolean {
  const { errors: e, valid } = validateForm(
    {
      sequence_id: form.value.sequence_id,
      namespace: form.value.namespace,
      idempotency_key: form.value.idempotency_key,
      context_data: form.value.context_data,
      context_config: form.value.context_config,
    },
    {
      // Picked from the dropdown, so it is always a real catalog id — just require a choice.
      sequence_id: [required('Sequence')],
      namespace: [required('Namespace')],
      // Bug 2: Instance Key is now mandatory (and the server still dedups on it).
      idempotency_key: [required('Instance Key')],
      context_data: [jsonRule('context.data')],
      context_config: [jsonRule('context.config')],
    },
  )
  errors.value = e
  return valid
}

async function submitSingle() {
  if (!validateSingle()) return
  saving.value = true
  try {
    const data = form.value.context_data.trim() ? JSON.parse(form.value.context_data) as unknown : undefined
    const config = form.value.context_config.trim() && form.value.context_config !== '{}'
      ? JSON.parse(form.value.context_config) as unknown
      : undefined

    // Instance Key is required and is the server-side dedup key (unchanged logic):
    // re-submitting the same key returns the existing instance (`deduplicated`).
    const res = await createInstance({
      sequence_id: form.value.sequence_id.trim(),
      tenant_id: conn.tenantId ?? '',
      namespace: form.value.namespace.trim(),
      priority: form.value.priority,
      idempotency_key: form.value.idempotency_key.trim(),
      context: { data: data, config: config },
    })
    if (res.deduplicated) {
      ui.info('Instance already exists', 'Returned the existing instance for this Instance Key.')
    } else {
      ui.success('Instance created')
    }
    open.value = false
    emit('created')
  } catch (e) {
    if (isApiError(e) && e.status === 422) {
      errors.value.context_data = e.message
    } else if (isApiError(e) && e.status === 404) {
      errors.value.sequence_id = 'Sequence not found.'
    } else {
      ui.error('Create failed', errorMessage(e))
    }
  } finally {
    saving.value = false
  }
}

async function submitBatch() {
  batchError.value = null
  if (!isValidJson(batchJson.value)) {
    batchError.value = 'Must be a valid JSON array.'
    return
  }
  const parsed = JSON.parse(batchJson.value) as unknown
  if (!Array.isArray(parsed)) {
    batchError.value = 'Must be a JSON array of instance objects.'
    return
  }
  saving.value = true
  try {
    const res = await createInstancesBatch({ instances: parsed as never[] })
    ui.success('Batch created', `${res.count} instance(s) created`)
    open.value = false
    emit('created')
  } catch (e) {
    if (isApiError(e) && (e.status === 400 || e.status === 422)) {
      batchError.value = e.message
    } else {
      ui.error('Batch create failed', errorMessage(e))
    }
  } finally {
    saving.value = false
  }
}

function submit() {
  if (mode.value === 'single') return submitSingle()
  return submitBatch()
}
</script>

<template>
  <Modal v-model:open="open" title="Create Instance" size="lg">
    <div class="space-y-4">
      <SegmentedControl v-model="mode" :segments="modeSegments" />

      <!-- Single mode -->
      <template v-if="mode === 'single'">
        <!-- Bug 1: pick a sequence by Name · Version · Status; its id is filled in below. -->
        <div>
          <Field
            label="Sequence"
            :error="errors.sequence_id"
            required
            hint="Choose by name + version; the Sequence ID is populated automatically."
          >
            <template #default="{ id, invalid }">
              <SequenceSelect
                :id="id"
                v-model="form.sequence_id"
                :options="seqStore.catalog"
                :invalid="invalid"
                placeholder="Select a sequence…"
              />
            </template>
          </Field>
          <p v-if="form.sequence_id" class="mt-1.5 text-[11.5px] text-subtle">
            Sequence ID: <span class="mono text-text">{{ form.sequence_id }}</span>
          </p>
        </div>

        <Field label="Namespace" :error="errors.namespace" required>
          <template #default="{ id, invalid }">
            <Input
              :id="id"
              v-model="form.namespace"
              :invalid="invalid"
              placeholder="e.g. orders"
            />
          </template>
        </Field>

        <Field label="Priority">
          <template #default="{ id }">
            <Select :id="id" v-model="form.priority" :options="priorityOptions" />
          </template>
        </Field>

        <!-- Bug 2: "Instance Key" (was "Idempotency Key") — required, still the dedup key. -->
        <Field
          label="Instance Key"
          :error="errors.idempotency_key"
          required
          hint="Required — a unique key for this instance. Reusing a key returns the existing instance instead of creating a duplicate."
        >
          <template #default="{ id, invalid }">
            <Input :id="id" v-model="form.idempotency_key" :invalid="invalid" placeholder="e.g. order-ORD-42-fulfill" />
          </template>
        </Field>

        <Field label="context.data (JSON)" :error="errors.context_data" hint="Arbitrary workflow input data.">
          <template #default="{ id, invalid }">
            <Textarea :id="id" v-model="form.context_data" :invalid="invalid" :rows="5" class="mono text-[12px]" />
          </template>
        </Field>

        <Field label="context.config (JSON)" :error="errors.context_config" hint="Read-only configuration for the workflow.">
          <template #default="{ id, invalid }">
            <Textarea :id="id" v-model="form.context_config" :invalid="invalid" :rows="3" class="mono text-[12px]" />
          </template>
        </Field>
      </template>

      <!-- Batch mode -->
      <template v-else>
        <Field
          label="Instances JSON Array"
          :error="batchError"
          hint="Array of CreateInstanceRequest objects. Max 10,000 items."
        >
          <template #default="{ id, invalid }">
            <Textarea
              :id="id"
              v-model="batchJson"
              :invalid="invalid"
              :rows="16"
              class="mono text-[12px]"
            />
          </template>
        </Field>
      </template>
    </div>

    <template #footer="{ close }">
      <Button variant="secondary" @click="close">Cancel</Button>
      <Button variant="primary" :disabled="!canSubmit" :loading="saving" @click="submit">
        <template #icon><Plus :size="15" /></template>
        {{ mode === 'single' ? 'Create instance' : 'Create batch' }}
      </Button>
    </template>
  </Modal>
</template>
