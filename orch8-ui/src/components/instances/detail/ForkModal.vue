<script setup lang="ts">
/**
 * Modal for forking an instance.
 * Collects from_block_id, optional context patch, dry_run toggle.
 * DESIGN_REFERENCE §Instances §Fork Instance
 */
import { ref, watch } from 'vue'
import { GitFork } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { forkInstance } from '@/api/instancesAdvanced'
import { errorMessage } from '@/api/errors'
import { validateForm, required, jsonRule } from '@/lib/validation'
import type { ForkResponse } from '@/api/types/instancesAdvanced'
import Modal from '@/components/ui/Modal.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'

const props = defineProps<{ instanceId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ forked: [result: ForkResponse] }>()

const ui = useUiStore()

const fromBlockId = ref('')
const contextPatch = ref('')
const dryRun = ref(true)
const submitting = ref(false)
const errors = ref<Record<string, string | null>>({})

watch(open, (v) => {
  if (v) {
    fromBlockId.value = ''
    contextPatch.value = ''
    dryRun.value = true
    errors.value = {}
  }
})

function validate(): boolean {
  const res = validateForm(
    { fromBlockId: fromBlockId.value, contextPatch: contextPatch.value },
    {
      fromBlockId: [required('Block ID')],
      contextPatch: [jsonRule('Context patch')],
    },
  )
  errors.value = res.errors
  return res.valid
}

async function handleFork() {
  if (!validate()) return
  let context: Record<string, unknown> | null = null
  if (contextPatch.value.trim()) {
    try { context = JSON.parse(contextPatch.value) as Record<string, unknown> } catch { return }
  }
  submitting.value = true
  try {
    const result = await forkInstance(props.instanceId, {
      from_block_id: fromBlockId.value.trim(),
      context,
      dry_run: dryRun.value,
    })
    ui.success('Fork created', `Instance ${result.id.slice(0, 8)}… (dry_run=${result.dry_run})`)
    open.value = false
    emit('forked', result)
  } catch (e) {
    ui.error('Fork failed', errorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Fork Instance" size="md">
    <div class="flex flex-col gap-4">
      <p class="text-[13px] text-muted">
        Create a sandbox copy resuming from a chosen block. The source instance is never mutated.
        Pre-fork outputs are reused; subsequent blocks re-execute.
      </p>

      <Field label="Resume from block ID" :error="errors.fromBlockId" required>
        <template #default="{ id, invalid }">
          <Input
            :id="id"
            v-model="fromBlockId"
            placeholder="e.g. enrich_profile"
            :invalid="!!invalid"
            class="mono"
          />
        </template>
      </Field>

      <Field
        label="Context patch (JSON object, shallow-merged into context.data)"
        :error="errors.contextPatch"
        hint="Leave empty to inherit context as-is."
      >
        <template #default="{ id, invalid }">
          <Textarea :id="id" v-model="contextPatch" :rows="4" :invalid="!!invalid" class="mono text-[12px]" placeholder='{ "feature_flag": true }' />
        </template>
      </Field>

      <label class="flex cursor-pointer items-center gap-2.5 text-[13px] text-text">
        <input v-model="dryRun" type="checkbox" class="h-4 w-4 accent-[var(--accent)]" />
        <span>Dry-run mode <span class="text-subtle">(prevents re-firing real side-effects)</span></span>
      </label>
    </div>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="handleFork">
        <template #icon><GitFork :size="14" /></template>
        Fork instance
      </Button>
    </template>
  </Modal>
</template>
