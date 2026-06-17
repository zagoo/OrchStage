<script setup lang="ts">
/**
 * Create a new session.
 * Validates session_key (1-512 chars) and optional expires_at.
 * DESIGN_REFERENCE §Sessions §2.2 Create Session
 */
import { ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { createSession } from '@/api/sessions'
import { errorMessage } from '@/api/errors'
import { validateForm, required, minLength, maxLength } from '@/lib/validation'
import type { Session } from '@/api/types/sessions'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'

const emit = defineEmits<{
  created: [session: Session]
}>()

const open = defineModel<boolean>('open', { required: true })

const ui = useUiStore()
const conn = useConnectionStore()

const form = ref({
  session_key: '',
  data: '{}',
  expires_at: '',
})
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

watch(open, (v) => {
  if (!v) {
    form.value = { session_key: '', data: '{}', expires_at: '' }
    errors.value = {}
  }
})

function validateDataJson(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null // empty = OK (defaults to {})
  try {
    JSON.parse(v)
    return null
  } catch {
    return 'Data must be valid JSON.'
  }
}

async function handleSubmit() {
  const { errors: formErrors, valid } = validateForm(form.value, {
    session_key: [required('Session key'), minLength(1, 'Session key'), maxLength(512, 'Session key')],
    data: [validateDataJson],
  })
  errors.value = formErrors
  if (!valid) return

  submitting.value = true
  try {
    let parsedData: unknown = {}
    if (form.value.data.trim()) {
      try { parsedData = JSON.parse(form.value.data) } catch { /* validated above */ }
    }

    const body = {
      tenant_id: conn.tenantId || '',
      session_key: form.value.session_key,
      data: parsedData,
      ...(form.value.expires_at ? { expires_at: form.value.expires_at } : {}),
    }

    const session = await createSession(body)
    ui.success('Session created', session.session_key)
    emit('created', session)
    open.value = false
  } catch (e) {
    ui.error('Failed to create session', errorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Create Session" size="md">
    <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
      <Field label="Session key" :error="errors.session_key" required hint="Unique lookup key, e.g. user:123:onboarding. Max 512 characters.">
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.session_key"
            :invalid="invalid"
            placeholder="user:123:onboarding"
            :disabled="submitting"
          />
        </template>
      </Field>

      <Field label="Initial data (JSON)" :error="errors.data" hint="Optional initial shared data blob. Default: {}">
        <template #default="{ id, invalid }">
          <Textarea
            :id="id"
            v-model="form.data"
            :invalid="invalid"
            :rows="5"
            placeholder="{}"
            :disabled="submitting"
          />
        </template>
      </Field>

      <Field label="Expires at (optional)" hint="ISO 8601 timestamp, e.g. 2026-12-31T23:59:59Z">
        <template #default="{ id }">
          <Input
            :id="id"
            v-model="form.expires_at"
            placeholder="2026-12-31T23:59:59Z"
            :disabled="submitting"
          />
        </template>
      </Field>
    </form>

    <template #footer>
      <Button variant="ghost" :disabled="submitting" @click="open = false">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="handleSubmit">
        Create session
      </Button>
    </template>
  </Modal>
</template>
