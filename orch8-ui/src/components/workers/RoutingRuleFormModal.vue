<script setup lang="ts">
/**
 * Modal for creating a queue routing rule.
 * DESIGN_REFERENCE §POST /routing-rules
 */
import { ref, watch } from 'vue'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import { useUiStore } from '@/stores/ui'
import { createRoutingRule } from '@/api/queues'
import { errorMessage } from '@/api/errors'
import { validateForm, required, range, integer } from '@/lib/validation'
import type { QueueRoutingRule } from '@/api/types/queues'

const props = defineProps<{ tenantId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [rule: QueueRoutingRule] }>()

const ui = useUiStore()

interface Form {
  handler_name: string
  match_queue: string
  queue_override: string
  priority: string
  enabled: boolean
}

const form = ref<Form>({
  handler_name: '',
  match_queue: '',
  queue_override: '',
  priority: '0',
  enabled: true,
})
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

watch(open, (v) => {
  if (!v) return
  form.value = { handler_name: '', match_queue: '', queue_override: '', priority: '0', enabled: true }
  errors.value = {}
})

async function submit() {
  const { errors: e, valid } = validateForm(form.value, {
    handler_name: [required('Handler name')],
    queue_override: [required('Target queue')],
    priority: [integer('Priority'), range(-2147483648, 2147483647, 'Priority')],
  })
  errors.value = e
  if (!valid) return

  submitting.value = true
  try {
    const result = await createRoutingRule({
      tenant_id: props.tenantId,
      handler_name: form.value.handler_name.trim(),
      match_queue: form.value.match_queue.trim() || null,
      queue_override: form.value.queue_override.trim(),
      priority: Number(form.value.priority),
      enabled: form.value.enabled,
    })
    ui.success('Routing rule created', result.handler_name)
    open.value = false
    emit('created', result)
  } catch (e) {
    ui.error('Create failed', errorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal v-model:open="open" title="New Routing Rule" size="sm">
    <div class="flex flex-col gap-4">
      <p class="text-[13px] text-subtle">
        Rules are evaluated at task-enqueue time. The highest-priority matching rule wins and rewrites
        the task's queue to the target.
      </p>

      <Field label="Handler name" :error="errors.handler_name" required>
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.handler_name"
            :invalid="invalid"
            placeholder="send-email"
            class="mono"
          />
        </template>
      </Field>

      <Field
        label="Match queue (optional)"
        :error="errors.match_queue"
        hint="Leave blank to match any queue (catch-all). When set, only tasks already on this queue are routed."
      >
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.match_queue"
            :invalid="invalid"
            placeholder="(any)"
            class="mono"
          />
        </template>
      </Field>

      <Field label="Target queue" :error="errors.queue_override" required hint="The destination queue name.">
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="form.queue_override"
            :invalid="invalid"
            placeholder="bulk-email"
            class="mono"
          />
        </template>
      </Field>

      <Field label="Priority" :error="errors.priority" hint="Higher priority rules are evaluated first.">
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.priority" :invalid="invalid" type="number" placeholder="0" />
        </template>
      </Field>

      <label class="flex cursor-pointer items-center gap-2 text-[13px] text-text">
        <input v-model="form.enabled" type="checkbox" class="h-4 w-4 rounded" />
        Enabled (deactivate to store the rule without applying it)
      </label>
    </div>

    <template #footer>
      <Button variant="ghost" @click="open = false">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">
        Create rule
      </Button>
    </template>
  </Modal>
</template>
