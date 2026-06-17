<script setup lang="ts">
/**
 * Modal for creating a new per-tenant API key.
 *
 * Admin-only: the server enforces 403 for per-tenant callers. We capture that
 * error and surface it contextually rather than pre-blocking the UI.
 *
 * CRITICAL: the generated secret is shown ONCE in this dialog. After the user
 * acknowledges, it is cleared and can never be recovered.
 *
 * DESIGN_REFERENCE §POST /api-keys (auth-rbac.md §8.1)
 */
import { reactive, ref, computed } from 'vue'
import { KeyRound, Copy, ShieldAlert } from 'lucide-vue-next'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { createApiKey } from '@/api/apiKeys'
import { validateForm, required, maxLength } from '@/lib/validation'
import { errorMessage } from '@/api/errors'
import type { CreatedApiKey } from '@/api/types/apiKeys'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  created: []
}>()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const conn = useConnectionStore()
const ui = useUiStore()

// Form state
const defaultForm = () => ({
  name: '',
  tenant_id: conn.tenantId,
  expires_at: '',
})

const form = reactive(defaultForm())
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

// After creation: show the generated secret once
const createdKey = ref<CreatedApiKey | null>(null)
const acknowledged = ref(false)

function validate(): boolean {
  const { errors: e, valid } = validateForm(form as Record<string, unknown>, {
    tenant_id: [required('Tenant ID')],
    name: [maxLength(255, 'Name')],
  })
  errors.value = e
  return valid
}

async function submit() {
  if (!validate()) return
  submitting.value = true
  try {
    const key = await createApiKey({
      tenant_id: form.tenant_id.trim(),
      name: form.name.trim() || undefined,
      expires_at: form.expires_at.trim() || null,
    })
    createdKey.value = key
    acknowledged.value = false
    ui.success('API key created', `"${key.name || key.id}" — copy the secret now!`)
    emit('created')
  } catch (e) {
    ui.error('Failed to create key', errorMessage(e))
  } finally {
    submitting.value = false
  }
}

function dismiss() {
  createdKey.value = null
  acknowledged.value = false
  open.value = false
  Object.assign(form, defaultForm())
  errors.value = {}
}

function onClose() {
  if (createdKey.value && !acknowledged.value) return // block backdrop close if secret hasn't been copied
  dismiss()
}
</script>

<template>
  <!-- Phase 1: create form -->
  <Modal
    v-if="!createdKey"
    :open="open"
    title="Create API Key"
    size="md"
    @update:open="onClose"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <Field label="Tenant ID" :error="errors.tenant_id" required hint="The tenant this key will be scoped to.">
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.tenant_id" placeholder="acme" mono :invalid="invalid" />
        </template>
      </Field>

      <Field label="Name" :error="errors.name" hint="Optional human-readable label for this key.">
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.name" placeholder="CI deploy key" :invalid="invalid" />
        </template>
      </Field>

      <Field label="Expires at" hint="Leave blank for a non-expiring key. ISO 8601 UTC, e.g. 2027-01-01T00:00:00Z">
        <template #default="{ id }">
          <Input :id="id" v-model="form.expires_at" placeholder="2027-01-01T00:00:00Z" mono />
        </template>
      </Field>
    </form>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">
        <template #icon><KeyRound :size="14" /></template>
        Create key
      </Button>
    </template>
  </Modal>

  <!-- Phase 2: show the generated secret ONE TIME -->
  <Modal
    v-else
    :open="open"
    title="API Key Created — Save Your Secret"
    size="md"
    :close-on-backdrop="false"
    @update:open="() => {}"
  >
    <div class="flex flex-col gap-4">
      <!-- Warning banner -->
      <div class="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3.5">
        <ShieldAlert :size="18" class="mt-0.5 shrink-0 text-warning" />
        <p class="text-[13px] text-warning">
          This is the <strong>only time</strong> the secret will be shown. The server stores only a hash.
          Copy it now and store it securely — it cannot be retrieved again.
        </p>
      </div>

      <!-- Secret display -->
      <div class="rounded-lg border border-border bg-surface-2 p-3">
        <div class="mb-1.5 flex items-center justify-between">
          <span class="text-[11.5px] font-semibold uppercase tracking-wide text-subtle">API Secret</span>
          <div class="flex items-center gap-1">
            <CopyButton :value="createdKey.secret" :size="15" />
          </div>
        </div>
        <p class="break-all font-mono text-[12.5px] text-text">{{ createdKey.secret }}</p>
      </div>

      <!-- Key metadata -->
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-surface p-3 text-[12.5px]">
        <dt class="text-subtle">Key ID</dt>
        <dd class="mono text-text">{{ createdKey.id }}</dd>
        <dt class="text-subtle">Tenant</dt>
        <dd class="text-text">{{ createdKey.tenant_id }}</dd>
        <dt class="text-subtle">Name</dt>
        <dd class="text-text">{{ createdKey.name || '—' }}</dd>
        <dt class="text-subtle">Expires</dt>
        <dd class="text-text">{{ createdKey.expires_at ?? 'Never' }}</dd>
      </dl>

      <label class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface-2 p-3">
        <input v-model="acknowledged" type="checkbox" class="accent-[var(--accent)]" />
        <span class="text-[13px] text-text">I have copied the secret and stored it safely</span>
      </label>
    </div>

    <template #footer>
      <Button variant="primary" :disabled="!acknowledged" @click="dismiss">
        <template #icon><Copy :size="14" /></template>
        Done
      </Button>
    </template>
  </Modal>
</template>
