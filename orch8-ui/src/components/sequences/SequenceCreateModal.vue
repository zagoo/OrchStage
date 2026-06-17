<script setup lang="ts">
/**
 * Modal for authoring + creating a new sequence definition.
 * Structured top-level fields + JSON editors for blocks[] and input_schema.
 * DESIGN_REFERENCE §9.1 Create Sequence (dag-sequences.md)
 */
import { reactive, ref, computed } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { createSequence } from '@/api/sequences'
import { validateForm, required, uuid, identifier, jsonRule } from '@/lib/validation'
import { isApiError, errorMessage } from '@/api/errors'
import { prettyJson } from '@/lib/format'
import type { CreateSequenceResponse } from '@/api/types/sequences'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Button from '@/components/ui/Button.vue'
import type { SelectOption } from '@/components/ui/Select.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [response: CreateSequenceResponse]
}>()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const conn = useConnectionStore()
const ui = useUiStore()

function newUuid(): string {
  // Browser crypto API — UUIDv4 (good enough for client-gen sequence ID)
  return crypto.randomUUID()
}

const defaultForm = () => ({
  id: newUuid(),
  namespace: 'default',
  name: '',
  version: '1',
  status: 'draft',
  blocksJson: prettyJson([{ type: 'step', id: 'step_1', handler: 'noop', cancellable: true }]),
  inputSchemaJson: '',
})

const form = reactive(defaultForm())
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)
const apiWarnings = ref<string[]>([])

const statusOptions: SelectOption[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'staging', label: 'Staging' },
  { value: 'production', label: 'Production' },
]

function validateBlocks(json: string): string | null {
  if (!json.trim()) return 'Blocks are required.'
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return 'Blocks must be valid JSON.'
  }
  if (!Array.isArray(parsed)) return 'Blocks must be a JSON array.'
  if (parsed.length === 0) return 'Sequence must have at least one block.'

  const ids = new Set<string>()
  function checkBlock(b: unknown): string | null {
    if (typeof b !== 'object' || b === null) return 'Each block must be an object.'
    const block = b as Record<string, unknown>
    if (typeof block.id !== 'string' || block.id.trim() === '') return 'Every block must have a non-empty id.'
    if (typeof block.type !== 'string' || block.type.trim() === '') return 'Every block must have a type.'
    if (ids.has(block.id)) return `Duplicate block id: "${block.id}".`
    ids.add(block.id)
    if (block.type === 'step' && (typeof block.handler !== 'string' || block.handler.trim() === '')) {
      return `Block "${block.id}": step handler must be non-empty.`
    }
    return null
  }

  for (const b of parsed as unknown[]) {
    const err = checkBlock(b)
    if (err) return err
  }
  return null
}

function validate(): boolean {
  const { errors: e, valid } = validateForm(form as Record<string, unknown>, {
    id: [required('ID'), uuid('Sequence ID')],
    namespace: [required('Namespace'), identifier('Namespace')],
    name: [required('Name'), identifier('Name')],
    version: [required('Version')],
    inputSchemaJson: [jsonRule('Input schema JSON')],
  })

  // Custom blocks validation
  const blocksErr = validateBlocks(form.blocksJson)
  e.blocksJson = blocksErr

  errors.value = e
  return valid && blocksErr === null
}

async function submit() {
  if (!validate()) return
  submitting.value = true
  apiWarnings.value = []

  try {
    const parsedBlocks = JSON.parse(form.blocksJson)
    let inputSchema: unknown = undefined
    if (form.inputSchemaJson.trim()) {
      const parsed = JSON.parse(form.inputSchemaJson)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        errors.value.inputSchemaJson = 'Input schema must be a JSON object.'
        return
      }
      inputSchema = parsed
    }

    const body = {
      id: form.id.trim(),
      tenant_id: conn.tenantId,
      namespace: form.namespace.trim(),
      name: form.name.trim(),
      version: parseInt(form.version, 10),
      deprecated: false,
      status: form.status as 'draft' | 'staging' | 'production',
      blocks: parsedBlocks,
      input_schema: inputSchema,
      created_at: new Date().toISOString(),
    }

    const response = await createSequence(body)
    if (response.warnings?.length) {
      apiWarnings.value = response.warnings
    }

    ui.success('Sequence created', body.name)
    emit('created', response)
    open.value = false
    Object.assign(form, defaultForm())
    errors.value = {}
  } catch (e) {
    if (isApiError(e) && e.status === 409) {
      ui.error('Conflict', 'A sequence with this ID or name already exists.')
    } else if (isApiError(e) && e.status === 400) {
      ui.error('Validation error', e.message)
    } else {
      ui.error('Failed to create sequence', errorMessage(e))
    }
  } finally {
    submitting.value = false
  }
}

function onClose() {
  open.value = false
  Object.assign(form, defaultForm())
  errors.value = {}
  apiWarnings.value = []
}
</script>

<template>
  <Modal :open="open" title="Create Sequence" size="xl" @update:open="onClose">
    <div class="flex flex-col gap-5">
      <!-- warnings from a previous submit -->
      <div
        v-if="apiWarnings.length"
        class="rounded-lg border border-warning/30 bg-warning-soft p-3 text-[12.5px] text-warning"
      >
        <p class="font-semibold mb-1">Lint warnings (sequence saved):</p>
        <ul class="list-disc pl-4 space-y-0.5">
          <li v-for="w in apiWarnings" :key="w">{{ w }}</li>
        </ul>
      </div>

      <!-- Structured top-level fields -->
      <div class="grid grid-cols-2 gap-4">
        <Field label="Sequence ID" :error="errors.id" required hint="UUIDv4 — pre-generated, can override.">
          <template #default="{ id, invalid }">
            <Input :id="id" v-model="form.id" mono :invalid="invalid" />
          </template>
        </Field>

        <Field label="Namespace" :error="errors.namespace" required>
          <template #default="{ id, invalid }">
            <Input :id="id" v-model="form.namespace" placeholder="default" mono :invalid="invalid" />
          </template>
        </Field>

        <Field label="Name" :error="errors.name" required hint="Workflow name identifier.">
          <template #default="{ id, invalid }">
            <Input :id="id" v-model="form.name" placeholder="my-workflow" :invalid="invalid" />
          </template>
        </Field>

        <Field label="Version" :error="errors.version" required>
          <template #default="{ id, invalid }">
            <Input :id="id" v-model="form.version" type="number" min="1" :invalid="invalid" />
          </template>
        </Field>

        <Field label="Initial status" :error="errors.status">
          <template #default="{ id }">
            <Select :id="id" v-model="form.status" :options="statusOptions" />
          </template>
        </Field>
      </div>

      <!-- Blocks JSON -->
      <Field
        label="Blocks JSON"
        :error="errors.blocksJson"
        required
        hint="Array of BlockDefinition objects. Every block needs type + id; step blocks need handler. Block IDs must be unique."
      >
        <template #default="{ id, invalid }">
          <Textarea
            :id="id"
            v-model="form.blocksJson"
            :rows="10"
            mono
            :invalid="invalid"
            placeholder='[{"type":"step","id":"step_1","handler":"noop","cancellable":true}]'
          />
        </template>
      </Field>

      <!-- Input Schema JSON -->
      <Field
        label="Input schema (optional)"
        :error="errors.inputSchemaJson"
        hint="JSON Schema object validated against context.data when creating instances. Must be a JSON object (not array)."
      >
        <template #default="{ id, invalid }">
          <Textarea
            :id="id"
            v-model="form.inputSchemaJson"
            :rows="5"
            mono
            :invalid="invalid"
            placeholder='{"type":"object","properties":{"email":{"type":"string"}},"required":["email"]}'
          />
        </template>
      </Field>
    </div>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">Create sequence</Button>
    </template>
  </Modal>
</template>
