<script setup lang="ts">
/**
 * Modal for creating or updating a plugin.
 * DESIGN_REFERENCE §POST /api/v1/plugins  (resources.md)
 * DESIGN_REFERENCE §PATCH /api/v1/plugins/{name}  (resources.md)
 *
 * Business rules enforced:
 * - name: non-empty; max 255 chars (create only; immutable after)
 * - plugin_type: required on create; cannot change via PATCH
 * - source: non-empty; max 2048 chars
 * - config: valid JSON when provided
 */
import { reactive, ref, computed, watch } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { createPlugin, updatePlugin } from '@/api/plugins'
import { validateForm, required, maxLength, jsonRule } from '@/lib/validation'
import { errorMessage } from '@/api/errors'
import type { PluginDef, PluginType } from '@/api/types/plugins'
import type { SelectOption } from '@/components/ui/Select.vue'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{
  open: boolean
  plugin?: PluginDef | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: [plugin: PluginDef]
}>()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const conn = useConnectionStore()
const ui = useUiStore()
const isEdit = computed(() => !!props.plugin)

const defaultForm = () => ({
  name: '',
  plugin_type: 'wasm' as PluginType,
  source: '',
  config: '',
  description: '',
})

const form = reactive(defaultForm())
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

const typeOptions: SelectOption[] = [
  { value: 'wasm', label: 'WASM (WebAssembly)' },
  { value: 'grpc', label: 'gRPC' },
]

watch(
  () => props.plugin,
  (p) => {
    if (p) {
      form.name = p.name
      form.plugin_type = p.plugin_type
      form.source = p.source
      form.config = p.config != null ? JSON.stringify(p.config, null, 2) : ''
      form.description = p.description ?? ''
    } else {
      Object.assign(form, defaultForm())
    }
  },
  { immediate: true },
)

// Source placeholder changes based on plugin type
const sourcePlaceholder = computed(() =>
  form.plugin_type === 'wasm'
    ? '/opt/plugins/my-plugin.wasm'
    : 'host:9090/Service.Method',
)

function validate() {
  const rules: Parameters<typeof validateForm>[1] = {
    source: [required('Source'), maxLength(2048, 'Source')],
    config: [jsonRule('Config JSON')],
  }
  if (!isEdit.value) {
    rules.name = [required('Name'), maxLength(255, 'Name')]
    rules.plugin_type = [required('Plugin type')]
  }
  const { errors: e, valid } = validateForm(form as Record<string, unknown>, rules)
  errors.value = e
  return valid
}

async function submit() {
  if (!validate()) return
  submitting.value = true
  try {
    let saved: PluginDef
    const configJson = form.config.trim() ? (JSON.parse(form.config) as unknown) : null

    if (isEdit.value && props.plugin) {
      saved = await updatePlugin(props.plugin.name, {
        source: form.source.trim() || undefined,
        config: configJson,
        description: form.description.trim() || undefined,
      })
      ui.success('Plugin updated', saved.name)
    } else {
      saved = await createPlugin({
        name: form.name.trim(),
        plugin_type: form.plugin_type,
        source: form.source.trim(),
        tenant_id: conn.tenantId || undefined,
        config: configJson,
        description: form.description.trim() || null,
      })
      ui.success('Plugin registered', saved.name)
    }
    emit('saved', saved)
    open.value = false
    Object.assign(form, defaultForm())
    errors.value = {}
  } catch (e) {
    ui.error(isEdit.value ? 'Failed to update plugin' : 'Failed to register plugin', errorMessage(e))
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
  <Modal
    :open="open"
    :title="isEdit ? 'Edit Plugin' : 'Register Plugin'"
    size="md"
    @update:open="onClose"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <!-- Name — create only; immutable after creation -->
      <Field
        v-if="!isEdit"
        label="Name"
        :error="errors.name"
        required
        hint="Handler name prefix. Workflows reference this plugin as wasm://name or grpc://name."
      >
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.name" placeholder="my-wasm-plugin" mono :invalid="invalid" />
        </template>
      </Field>

      <!-- Read-only name in edit mode -->
      <Field v-else label="Name" hint="Plugin name cannot be changed. Delete and recreate to rename.">
        <template #default="{ id }">
          <Input :id="id" :model-value="form.name" mono disabled readonly />
        </template>
      </Field>

      <!-- Plugin type — create only; cannot change via PATCH -->
      <Field
        v-if="!isEdit"
        label="Plugin type"
        :error="errors.plugin_type"
        required
      >
        <template #default="{ id, invalid }">
          <Select :id="id" v-model="form.plugin_type" :options="typeOptions" :invalid="invalid" />
        </template>
      </Field>

      <!-- Read-only type in edit mode -->
      <Field v-else label="Plugin type" hint="Plugin type cannot be changed via update.">
        <template #default="{ id }">
          <Input
            :id="id"
            :model-value="form.plugin_type === 'wasm' ? 'WASM (WebAssembly)' : 'gRPC'"
            disabled
            readonly
          />
        </template>
      </Field>

      <Field
        label="Source"
        :error="errors.source"
        required
        :hint="
          form.plugin_type === 'wasm'
            ? 'Absolute file path to the .wasm module (max 2048 chars).'
            : 'gRPC endpoint: host:port/Service.Method (max 2048 chars).'
        "
      >
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.source"
            :placeholder="sourcePlaceholder"
            mono
            :invalid="invalid"
          />
        </template>
      </Field>

      <Field
        label="Config JSON"
        :error="errors.config"
        hint="Optional plugin-specific configuration object. Must be valid JSON when provided."
      >
        <template #default="{ id, invalid }">
          <Textarea
            :id="id"
            v-model="form.config"
            placeholder='{"timeout_ms": 5000}'
            :rows="4"
            :invalid="invalid"
          />
        </template>
      </Field>

      <Field label="Description">
        <template #default="{ id }">
          <Input :id="id" v-model="form.description" placeholder="Optional description" />
        </template>
      </Field>
    </form>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">
        {{ isEdit ? 'Save changes' : 'Register plugin' }}
      </Button>
    </template>
  </Modal>
</template>
