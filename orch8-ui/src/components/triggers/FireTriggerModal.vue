<script setup lang="ts">
/**
 * Modal for firing a trigger with an optional JSON payload.
 * DESIGN_REFERENCE §POST /api/v1/triggers/{slug}/fire
 */
import { ref, computed } from 'vue'
import { Flame } from 'lucide-vue-next'
import { fireTrigger } from '@/api/triggers'
import { useUiStore } from '@/stores/ui'
import { errorMessage } from '@/api/errors'
import { validateForm, jsonRule } from '@/lib/validation'
import type { TriggerDef, FireTriggerResponse } from '@/api/types/triggers'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'

const props = defineProps<{ open: boolean; trigger: TriggerDef | null }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  fired: [response: FireTriggerResponse]
}>()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const ui = useUiStore()

const payload = ref('{}')
const triggerSecret = ref('')
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)
const result = ref<FireTriggerResponse | null>(null)

const hasSecret = computed(() => !!props.trigger?.secret)

function validate() {
  const { errors: e, valid } = validateForm(
    { payload: payload.value } as Record<string, unknown>,
    { payload: [jsonRule('Payload')] },
  )
  errors.value = e
  return valid
}

async function fire() {
  if (!props.trigger) return
  if (!validate()) return
  submitting.value = true
  result.value = null
  try {
    const body = payload.value.trim() ? (JSON.parse(payload.value) as unknown) : {}
    const response = await fireTrigger(
      props.trigger.slug,
      body,
      triggerSecret.value.trim() || null,
    )
    result.value = response
    ui.success('Trigger fired', `Instance ${response.instance_id} created`)
    emit('fired', response)
  } catch (e) {
    ui.error('Fire failed', errorMessage(e))
  } finally {
    submitting.value = false
  }
}

function onClose() {
  open.value = false
  payload.value = '{}'
  triggerSecret.value = ''
  errors.value = {}
  result.value = null
}
</script>

<template>
  <Modal :open="open" :title="`Fire trigger: ${trigger?.slug ?? ''}`" size="md" @update:open="onClose">
    <div v-if="result" class="mb-4 rounded-lg border border-success/30 bg-success-soft p-4 text-[13px]">
      <p class="font-semibold text-success">Instance created</p>
      <p class="mt-1 font-mono text-[12px] text-text">{{ result.instance_id }}</p>
      <p class="mt-0.5 text-subtle">Sequence: {{ result.sequence_name }}</p>
    </div>

    <form class="flex flex-col gap-4" @submit.prevent="fire">
      <div v-if="trigger" class="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <span>Fires sequence:</span>
        <Badge tone="accent">{{ trigger.sequence_name }}</Badge>
        <span>in namespace</span>
        <Badge tone="neutral">{{ trigger.namespace }}</Badge>
      </div>

      <Field label="Payload JSON" :error="errors.payload" hint="Becomes context.data of the created instance.">
        <template #default="{ id, invalid }">
          <Textarea :id="id" v-model="payload" placeholder="{}" :rows="5" :invalid="invalid" />
        </template>
      </Field>

      <Field v-if="hasSecret" label="Trigger secret" hint="Required — this trigger has a secret configured.">
        <template #default="{ id }">
          <Input :id="id" v-model="triggerSecret" type="password" placeholder="X-Trigger-Secret value" />
        </template>
      </Field>
    </form>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="fire">
        <template #icon><Flame :size="15" /></template>
        Fire
      </Button>
    </template>
  </Modal>
</template>
