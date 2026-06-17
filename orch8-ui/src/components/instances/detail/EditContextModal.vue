<script setup lang="ts">
/**
 * Modal to edit (PATCH) an instance's ExecutionContext.
 * DESIGN_REFERENCE §Instances §8 Update Instance Context
 */
import { ref, watch } from 'vue'
import { FileCode2 } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { updateInstanceContext } from '@/api/instances'
import { errorMessage } from '@/api/errors'
import { prettyJson } from '@/lib/format'
import type { ExecutionContext } from '@/api/types/instances'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Textarea from '@/components/ui/Textarea.vue'

const props = defineProps<{ instanceId: string; context: ExecutionContext }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ updated: [] }>()

const ui = useUiStore()
const contextStr = ref('')
const jsonError = ref<string | null>(null)
const submitting = ref(false)

watch(open, (v) => {
  if (v) {
    contextStr.value = prettyJson(props.context)
    jsonError.value = null
  }
})

async function handleSave() {
  jsonError.value = null
  let context: ExecutionContext
  try {
    context = JSON.parse(contextStr.value) as ExecutionContext
    if (typeof context !== 'object' || context === null || Array.isArray(context)) {
      jsonError.value = 'Context must be a JSON object.'
      return
    }
  } catch {
    jsonError.value = 'Invalid JSON.'
    return
  }
  submitting.value = true
  try {
    await updateInstanceContext(props.instanceId, { context })
    ui.success('Context updated')
    open.value = false
    emit('updated')
  } catch (e) {
    ui.error('Update failed', errorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Edit Execution Context" size="lg">
    <div class="flex flex-col gap-4">
      <p class="text-[13px] text-muted">
        Replaces the full execution context. Max 256 KiB. The replacement must be a valid
        <span class="mono">ExecutionContext</span> object.
      </p>
      <Field label="ExecutionContext (JSON)" :error="jsonError" required>
        <template #default="{ id, invalid }">
          <Textarea
            :id="id"
            v-model="contextStr"
            :rows="16"
            :invalid="!!invalid"
            class="mono text-[12px]"
          />
        </template>
      </Field>
    </div>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="handleSave">
        <template #icon><FileCode2 :size="14" /></template>
        Save context
      </Button>
    </template>
  </Modal>
</template>
