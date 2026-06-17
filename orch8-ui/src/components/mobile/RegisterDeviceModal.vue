<script setup lang="ts">
/**
 * Modal for registering (or re-registering) a mobile device.
 * Upsert semantics: same device_id updates push_token, platform, app_version.
 * DESIGN_REFERENCE §POST /api/v1/mobile/devices/register (mobile-sync.md Endpoint 2)
 */
import { reactive, ref, computed } from 'vue'
import { Smartphone } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { registerDevice } from '@/api/mobile'
import { validateForm, required } from '@/lib/validation'
import { errorMessage } from '@/api/errors'
import type { SelectOption } from '@/components/ui/Select.vue'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  registered: []
}>()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const ui = useUiStore()

const platformOptions: SelectOption[] = [
  { value: 'ios', label: 'iOS (APNs)' },
  { value: 'android', label: 'Android (FCM)' },
]

const defaultForm = () => ({
  device_id: '',
  platform: 'ios',
  push_token: '',
  app_version: '',
})

const form = reactive(defaultForm())
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

function validate() {
  const { errors: e, valid } = validateForm(form as Record<string, unknown>, {
    device_id: [required('Device ID')],
    platform: [required('Platform')],
  })
  errors.value = e
  return valid
}

async function submit() {
  if (!validate()) return
  submitting.value = true
  try {
    await registerDevice({
      device_id: form.device_id.trim(),
      platform: form.platform,
      push_token: form.push_token.trim() || undefined,
      app_version: form.app_version.trim() || undefined,
    })
    ui.success('Device registered', form.device_id.trim())
    emit('registered')
    open.value = false
    Object.assign(form, defaultForm())
    errors.value = {}
  } catch (e) {
    ui.error('Registration failed', errorMessage(e))
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
  <Modal :open="open" title="Register Device" size="md" @update:open="onClose">
    <div class="mb-4 flex items-center gap-2 text-[13px] text-subtle">
      <Smartphone :size="15" />
      <span>Re-registering an existing device ID updates its push token and app version.</span>
    </div>

    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <Field label="Device ID" :error="errors.device_id" required hint="Stable client-generated identifier (e.g. UUID or vendor device ID).">
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.device_id" placeholder="00000000-0000-0000-0000-000000000000" mono :invalid="invalid" />
        </template>
      </Field>

      <Field label="Platform" :error="errors.platform" required>
        <template #default="{ id, invalid }">
          <Select :id="id" v-model="form.platform" :options="platformOptions" :invalid="invalid" />
        </template>
      </Field>

      <Field label="Push Token" hint="APNs device token (iOS) or FCM registration token (Android). Optional — devices without tokens use polling only.">
        <template #default="{ id }">
          <Input :id="id" v-model="form.push_token" placeholder="Leave blank for polling-only mode" mono />
        </template>
      </Field>

      <Field label="App Version" hint="Semver string e.g. 2.3.1. Used for diagnostics.">
        <template #default="{ id }">
          <Input :id="id" v-model="form.app_version" placeholder="2.3.1" />
        </template>
      </Field>
    </form>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">Register</Button>
    </template>
  </Modal>
</template>
