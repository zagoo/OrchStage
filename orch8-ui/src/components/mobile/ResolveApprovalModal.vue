<script setup lang="ts">
/**
 * Modal for resolving a pending mobile approval request.
 * Operator selects from the approval's choices (or provides free-form output).
 * DESIGN_REFERENCE §POST /api/v1/mobile/approvals/{id}/resolve (mobile-sync.md Endpoint 5)
 */
import { ref, computed } from 'vue'
import { CheckCircle, AlertTriangle } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { resolveApproval } from '@/api/mobile'
import { errorMessage } from '@/api/errors'
import type { MobileApprovalRequest } from '@/api/types/mobile'
import type { SelectOption } from '@/components/ui/Select.vue'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Button from '@/components/ui/Button.vue'
import KeyValue from '@/components/ui/KeyValue.vue'
import Badge from '@/components/ui/Badge.vue'

const props = defineProps<{
  open: boolean
  approval: MobileApprovalRequest | null
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  resolved: []
}>()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const ui = useUiStore()
const submitting = ref(false)
const selectedChoice = ref('')
const freeformOutput = ref('')
const outputError = ref<string | null>(null)

const parsedChoices = computed((): string[] => {
  if (!props.approval?.choices) return []
  try {
    const parsed = JSON.parse(props.approval.choices) as unknown
    if (Array.isArray(parsed)) return parsed.map(String)
    return []
  } catch {
    return []
  }
})

const choiceOptions = computed((): SelectOption[] =>
  parsedChoices.value.map((c) => ({ value: c, label: c })),
)

const hasChoices = computed(() => choiceOptions.value.length > 0)

function validate(): boolean {
  if (hasChoices.value) {
    if (!selectedChoice.value) {
      outputError.value = 'Please select a choice.'
      return false
    }
    outputError.value = null
    return true
  }
  // Free-form: must be non-empty
  if (!freeformOutput.value.trim()) {
    outputError.value = 'Output is required.'
    return false
  }
  try {
    JSON.parse(freeformOutput.value)
    outputError.value = null
    return true
  } catch {
    outputError.value = 'Must be valid JSON.'
    return false
  }
}

function buildOutput(): unknown {
  if (hasChoices.value) return selectedChoice.value
  try {
    return JSON.parse(freeformOutput.value) as unknown
  } catch {
    return freeformOutput.value
  }
}

async function submit() {
  if (!props.approval || !validate()) return
  submitting.value = true
  try {
    await resolveApproval(props.approval.id, { output: buildOutput() })
    ui.success('Approval resolved', props.approval.id)
    emit('resolved')
    open.value = false
    selectedChoice.value = ''
    freeformOutput.value = ''
    outputError.value = null
  } catch (e) {
    ui.error('Resolve failed', errorMessage(e))
  } finally {
    submitting.value = false
  }
}

function onClose() {
  open.value = false
  selectedChoice.value = ''
  freeformOutput.value = ''
  outputError.value = null
}
</script>

<template>
  <Modal :open="open" title="Resolve Approval" size="md" @update:open="onClose">
    <div v-if="!approval" class="text-[13px] text-subtle">No approval selected.</div>

    <template v-else>
      <div class="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning">
        <AlertTriangle :size="15" class="mt-0.5 shrink-0" />
        <span>Resolving this approval will notify the device and advance the workflow instance.</span>
      </div>

      <div class="mb-4 grid grid-cols-2 gap-x-4 gap-y-2">
        <KeyValue label="Approval ID" :value="approval.id" mono />
        <KeyValue label="Instance" :value="approval.instance_id" mono />
        <KeyValue label="Sequence" :value="approval.sequence_name ?? '—'" />
        <KeyValue label="Block" :value="approval.block_id" mono />
        <KeyValue v-if="approval.store_as" label="Store as" :value="approval.store_as" mono />
        <div v-if="approval.timeout_secs" class="col-span-2 flex items-center gap-2">
          <span class="text-[12px] text-subtle">Timeout:</span>
          <Badge tone="warning">{{ approval.timeout_secs }}s</Badge>
        </div>
      </div>

      <div v-if="approval.prompt" class="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-[13px] text-text">
        <p class="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-subtle">Prompt</p>
        {{ approval.prompt }}
      </div>

      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <Field v-if="hasChoices" label="Your decision" :error="outputError" required>
          <template #default="{ id, invalid }">
            <Select :id="id" v-model="selectedChoice" :options="choiceOptions" placeholder="Select…" :invalid="invalid" />
          </template>
        </Field>

        <Field v-else label="Output (JSON)" :error="outputError" required hint="Enter any JSON value as the resolution output.">
          <template #default="{ id, invalid }">
            <Textarea :id="id" v-model="freeformOutput" placeholder='"approve"' :rows="3" :invalid="invalid" />
          </template>
        </Field>
      </form>
    </template>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button
        v-if="approval"
        variant="primary"
        :loading="submitting"
        :disabled="approval.state !== 'pending'"
        @click="submit"
      >
        <template #icon><CheckCircle :size="14" /></template>
        Resolve
      </Button>
    </template>
  </Modal>
</template>
