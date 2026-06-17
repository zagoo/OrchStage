<script setup lang="ts">
/**
 * Modal for resolving a pending approval by sending a human-input signal.
 * Signal type: custom:human_input:{block_id}
 * DESIGN_REFERENCE §Approvals §1.2 Human-in-the-Loop Gate Flow
 */
import { ref, computed, watch } from 'vue'
import { CheckCircle2, ChevronRight } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { resolveApproval } from '@/api/approvals'
import { errorMessage } from '@/api/errors'
import { validateForm, required } from '@/lib/validation'
import type { ApprovalItem } from '@/api/types/approvals'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Badge from '@/components/ui/Badge.vue'

const props = defineProps<{
  approval: ApprovalItem | null
}>()

const emit = defineEmits<{
  resolved: [instanceId: string]
}>()

const open = defineModel<boolean>('open', { required: true })

const ui = useUiStore()

// form state
const selectedChoice = ref('')
const comment = ref('')
const submitting = ref(false)
const errors = ref<Record<string, string | null>>({})

// reset state when modal opens or approval changes
watch(
  () => props.approval,
  () => {
    selectedChoice.value = ''
    comment.value = ''
    errors.value = {}
  },
)

watch(open, (v) => {
  if (!v) {
    selectedChoice.value = ''
    comment.value = ''
    errors.value = {}
  }
})

const choices = computed(() => props.approval?.choices ?? [])

const validationSchema = computed(() => ({
  choice: [required('A choice')],
}))

async function handleSubmit() {
  if (!props.approval) return

  const formValues = { choice: selectedChoice.value }
  const { errors: formErrors, valid } = validateForm(formValues, validationSchema.value)
  errors.value = formErrors
  if (!valid) return

  submitting.value = true
  try {
    const payload: { choice: string; comment?: string } = { choice: selectedChoice.value }
    if (props.approval.allow_comment && comment.value.trim()) {
      payload.comment = comment.value.trim()
    }

    await resolveApproval(props.approval.instance_id, props.approval.block_id, payload)

    const choiceLabel = choices.value.find((c) => c.value === selectedChoice.value)?.label ?? selectedChoice.value
    ui.success('Approval resolved', `Submitted "${choiceLabel}" for ${props.approval.sequence_name}`)
    emit('resolved', props.approval.instance_id)
    open.value = false
  } catch (e) {
    ui.error('Failed to resolve approval', errorMessage(e))
  } finally {
    submitting.value = false
  }
}

function handleCancel() {
  open.value = false
}
</script>

<template>
  <Modal v-model:open="open" title="Resolve Approval" size="md">
    <div v-if="approval" class="flex flex-col gap-4">
      <!-- context block -->
      <div class="rounded-md border border-border bg-surface-2 px-4 py-3">
        <p class="text-[13px] font-medium text-text">{{ approval.prompt }}</p>
        <p class="mt-1 text-[12px] text-subtle">
          Sequence: <span class="mono text-muted">{{ approval.sequence_name }}</span>
          · Block: <span class="mono text-muted">{{ approval.block_id }}</span>
        </p>
      </div>

      <!-- choice selection -->
      <Field label="Choose a response" :error="errors.choice" required>
        <div class="mt-1 flex flex-wrap gap-2">
          <button
            v-for="choice in choices"
            :key="choice.value"
            type="button"
            :class="[
              'flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-[13px] font-medium transition-all',
              selectedChoice === choice.value
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border-strong bg-surface-2 text-muted hover:border-faint hover:text-text',
            ]"
            @click="selectedChoice = choice.value; errors.choice = null"
          >
            <CheckCircle2 v-if="selectedChoice === choice.value" :size="14" />
            <ChevronRight v-else :size="14" class="text-faint" />
            {{ choice.label }}
          </button>
        </div>
      </Field>

      <!-- optional comment -->
      <Field
        v-if="approval.allow_comment"
        label="Comment (optional)"
        hint="Add context or notes for the audit trail."
      >
        <template #default="{ id }">
          <Textarea
            :id="id"
            v-model="comment"
            :rows="3"
            placeholder="Enter reviewer notes…"
            :disabled="submitting"
          />
        </template>
      </Field>

      <!-- deadline warning -->
      <div
        v-if="approval.deadline"
        class="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[12.5px] text-warning"
      >
        <Badge tone="warning">Deadline</Badge>
        {{ approval.deadline }}
      </div>
    </div>

    <template #footer>
      <Button variant="ghost" :disabled="submitting" @click="handleCancel">Cancel</Button>
      <Button
        variant="primary"
        :disabled="!selectedChoice || submitting"
        :loading="submitting"
        @click="handleSubmit"
      >
        Submit response
      </Button>
    </template>
  </Modal>
</template>
