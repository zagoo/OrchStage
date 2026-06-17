<script setup lang="ts">
/**
 * Modal for injecting blocks into a running instance.
 * DESIGN_REFERENCE §Instances §Inject Blocks
 */
import { ref, watch } from 'vue'
import { SquarePlus } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { injectBlocks } from '@/api/instancesAdvanced'
import { errorMessage } from '@/api/errors'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'

const props = defineProps<{ instanceId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ injected: [] }>()

const ui = useUiStore()
const blocksJson = ref('')
const positionStr = ref('')
const submitting = ref(false)
const jsonError = ref<string | null>(null)

const EXAMPLE = JSON.stringify([
  { type: 'step', id: 'manual_approval_1', handler: 'approval_handler', params: { approver: 'ops-team' } }
], null, 2)

watch(open, (v) => {
  if (v) {
    blocksJson.value = ''
    positionStr.value = ''
    jsonError.value = null
  }
})

async function handleInject() {
  jsonError.value = null
  let blocks: unknown[]
  try {
    const parsed = JSON.parse(blocksJson.value.trim() || '[]') as unknown
    if (!Array.isArray(parsed)) throw new Error('Must be a JSON array')
    if (parsed.length === 0) { jsonError.value = 'Blocks array must not be empty.'; return }
    blocks = parsed
  } catch (e) {
    jsonError.value = e instanceof Error ? e.message : 'Invalid JSON'
    return
  }
  const position = positionStr.value.trim() ? parseInt(positionStr.value, 10) : undefined
  if (position !== undefined && (Number.isNaN(position) || position < 0)) {
    jsonError.value = 'Position must be a non-negative integer.'
    return
  }
  submitting.value = true
  try {
    const result = await injectBlocks(props.instanceId, { blocks, position: position ?? null })
    ui.success('Blocks injected', `${result.total_injected} total blocks`)
    open.value = false
    emit('injected')
  } catch (e) {
    ui.error('Inject failed', errorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Inject Blocks" size="lg">
    <div class="flex flex-col gap-4">
      <p class="text-[13px] text-muted">
        Dynamically insert blocks into the instance's sequence. Useful for ad-hoc review steps or
        compensating actions without restarting the workflow.
      </p>

      <Field label="Blocks (JSON array of BlockDefinition)" :error="jsonError" required>
        <template #default="{ id, invalid }">
          <Textarea
            :id="id"
            v-model="blocksJson"
            :rows="10"
            :invalid="!!invalid"
            class="mono text-[12px]"
            :placeholder="EXAMPLE"
          />
        </template>
      </Field>

      <Field label="Insert at position (0-indexed; leave empty to append)" :error="null">
        <template #default="{ id }">
          <Input :id="id" v-model="positionStr" placeholder="e.g. 2" type="number" min="0" class="w-40" />
        </template>
      </Field>
    </div>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="handleInject">
        <template #icon><SquarePlus :size="14" /></template>
        Inject blocks
      </Button>
    </template>
  </Modal>
</template>
