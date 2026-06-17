<script setup lang="ts">
/**
 * Modal for creating or updating a credential.
 * DESIGN_REFERENCE §POST /api/v1/credentials  (resources.md)
 * DESIGN_REFERENCE §PATCH /api/v1/credentials/{id}  (resources.md)
 *
 * SECURITY CONTRACT:
 * - Secret material (value, refresh_token) is WRITE-ONLY — never displayed.
 * - On update, secret fields are only sent when the user explicitly fills them.
 * - The UI makes the write-only nature explicit via helper text and placeholder.
 *
 * Business rules enforced:
 * - id: [a-zA-Z0-9\-_.], max 255, non-empty (create only)
 * - name: non-empty
 * - value: non-empty (create); optional on update (leave blank = no rotation)
 * - oauth2 + refresh_url set → refresh_token required on create
 */
import { reactive, ref, computed, watch } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { createCredential, updateCredential } from '@/api/credentials'
import { validateForm, required, maxLength, pattern } from '@/lib/validation'
import { errorMessage } from '@/api/errors'
import type { CredentialResponse, CredentialKind } from '@/api/types/credentials'
import type { SelectOption } from '@/components/ui/Select.vue'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Button from '@/components/ui/Button.vue'

// Credential id character set: [a-zA-Z0-9\-_.] (resources.md §Credential ID character set)
const CRED_ID_RE = /^[a-zA-Z0-9\-_.]+$/

const props = defineProps<{
  open: boolean
  credential?: CredentialResponse | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: [credential: CredentialResponse]
}>()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const conn = useConnectionStore()
const ui = useUiStore()
const isEdit = computed(() => !!props.credential)

const defaultForm = () => ({
  id: '',
  name: '',
  kind: 'api_key' as CredentialKind,
  value: '',
  description: '',
  expires_at: '',
  refresh_url: '',
  refresh_token: '',
})

const form = reactive(defaultForm())
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

const kindOptions: SelectOption[] = [
  { value: 'api_key', label: 'API Key' },
  { value: 'oauth2', label: 'OAuth2' },
  { value: 'basic', label: 'Basic Auth' },
]

const valuePlaceholder = computed(() =>
  isEdit.value
    ? '(leave blank to keep existing secret)'
    : '{"token": "sk_live_..."}',
)

watch(
  () => props.credential,
  (c) => {
    if (c) {
      form.id = c.id
      form.name = c.name
      form.kind = c.kind
      form.description = c.description ?? ''
      form.expires_at = c.expires_at ?? ''
      form.refresh_url = c.refresh_url ?? ''
      // Secret fields intentionally left blank in edit mode
      form.value = ''
      form.refresh_token = ''
    } else {
      Object.assign(form, defaultForm())
    }
  },
  { immediate: true },
)

function validate() {
  const rules: Parameters<typeof validateForm>[1] = {
    name: [required('Name')],
    kind: [required('Kind')],
  }

  if (!isEdit.value) {
    rules.id = [
      required('ID'),
      maxLength(255, 'ID'),
      pattern(CRED_ID_RE, 'ID may only contain letters, digits, hyphens, underscores, and dots.'),
    ]
    rules.value = [required('Secret value')]
  }

  const { errors: e, valid } = validateForm(form as Record<string, unknown>, rules)

  // oauth2 cross-field rule: refresh_url set + no refresh_token → error (create only)
  if (!isEdit.value && form.kind === 'oauth2' && form.refresh_url.trim() && !form.refresh_token.trim()) {
    e.refresh_token = 'Refresh token is required when a refresh URL is set for OAuth2.'
    return { errors: e, valid: false }
  }

  return { errors: e, valid }
}

async function submit() {
  const { errors: e, valid } = validate()
  errors.value = e
  if (!valid) return
  submitting.value = true
  try {
    let saved: CredentialResponse
    if (isEdit.value && props.credential) {
      const body: Parameters<typeof updateCredential>[1] = {
        name: form.name.trim() || undefined,
        kind: form.kind,
        description: form.description.trim() || undefined,
        expires_at: form.expires_at.trim() || undefined,
        refresh_url: form.refresh_url.trim() || undefined,
      }
      // Only send secret fields if the operator provided new values
      if (form.value.trim()) body.value = form.value.trim()
      if (form.refresh_token.trim()) body.refresh_token = form.refresh_token.trim()

      saved = await updateCredential(props.credential.id, body)
      ui.success('Credential updated', saved.name)
    } else {
      saved = await createCredential({
        id: form.id.trim(),
        name: form.name.trim(),
        kind: form.kind,
        value: form.value,
        tenant_id: conn.tenantId || undefined,
        description: form.description.trim() || null,
        expires_at: form.expires_at.trim() || null,
        refresh_url: form.refresh_url.trim() || null,
        refresh_token: form.refresh_token.trim() || null,
      })
      ui.success('Credential created', saved.name)
    }
    emit('saved', saved)
    open.value = false
    Object.assign(form, defaultForm())
    errors.value = {}
  } catch (e) {
    ui.error(isEdit.value ? 'Failed to update credential' : 'Failed to create credential', errorMessage(e))
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
    :title="isEdit ? 'Edit Credential' : 'Create Credential'"
    size="md"
    @update:open="onClose"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <!-- ID — create only; immutable after creation -->
      <Field
        v-if="!isEdit"
        label="ID"
        :error="errors.id"
        required
        hint="URL-safe identifier used in credentials:// URI scheme. Allowed: letters, digits, hyphens, underscores, dots."
      >
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.id" placeholder="stripe-prod" mono :invalid="invalid" />
        </template>
      </Field>

      <!-- Read-only ID display in edit mode -->
      <Field v-else label="ID" hint="Credential ID cannot be changed after creation.">
        <template #default="{ id }">
          <Input :id="id" :model-value="form.id" mono disabled readonly />
        </template>
      </Field>

      <Field label="Display name" :error="errors.name" required>
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.name" placeholder="Stripe Production API Key" :invalid="invalid" />
        </template>
      </Field>

      <Field label="Kind" :error="errors.kind" required>
        <template #default="{ id, invalid }">
          <Select :id="id" v-model="form.kind" :options="kindOptions" :invalid="invalid" />
        </template>
      </Field>

      <!-- Secret value — write-only -->
      <Field
        label="Secret value"
        :error="errors.value"
        :required="!isEdit"
        hint="Write-only — never displayed after saving. Provide a JSON-encoded secret matching the kind."
      >
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.value"
            type="password"
            autocomplete="new-password"
            :placeholder="valuePlaceholder"
            mono
            :invalid="invalid"
          />
        </template>
      </Field>

      <div
        class="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-[12px] text-warning"
        role="note"
        aria-live="polite"
      >
        <span class="mt-0.5 shrink-0">⚠</span>
        <span>
          Secret material is <strong>write-only</strong>. The server never returns stored secrets.
          {{ isEdit ? 'Leave the secret field blank to keep the current value.' : '' }}
        </span>
      </div>

      <Field label="Description">
        <template #default="{ id }">
          <Input :id="id" v-model="form.description" placeholder="Optional description" />
        </template>
      </Field>

      <Field label="Expires at" hint="ISO 8601 UTC datetime. Leave blank for no expiry.">
        <template #default="{ id }">
          <Input :id="id" v-model="form.expires_at" placeholder="2027-01-01T00:00:00Z" mono />
        </template>
      </Field>

      <!-- OAuth2-specific fields -->
      <template v-if="form.kind === 'oauth2'">
        <Field label="Refresh URL" hint="OAuth2 token endpoint URL.">
          <template #default="{ id }">
            <Input :id="id" v-model="form.refresh_url" placeholder="https://oauth.example.com/token" />
          </template>
        </Field>

        <Field
          label="Refresh token"
          :error="errors.refresh_token"
          hint="Write-only. Required when refresh URL is set."
        >
          <template #default="{ id, invalid }">
            <Input
              :id="id"
              v-model="form.refresh_token"
              type="password"
              autocomplete="new-password"
              :placeholder="isEdit ? '(leave blank to keep existing)' : 'rt_...'"
              mono
              :invalid="invalid"
            />
          </template>
        </Field>
      </template>
    </form>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">
        {{ isEdit ? 'Save changes' : 'Create credential' }}
      </Button>
    </template>
  </Modal>
</template>
