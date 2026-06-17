<script setup lang="ts">
/**
 * Modal for creating or editing a cron schedule.
 * Supports both create (POST) and update (PUT) flows.
 * DESIGN_REFERENCE §POST /api/v1/cron, §PUT /api/v1/cron/{id}
 */
import { reactive, ref, computed, watch } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { createCron, updateCron, getCronNextFires } from '@/api/cron'
import { validateForm, required, uuid, cron as cronRule, jsonRule } from '@/lib/validation'
import { errorMessage } from '@/api/errors'
import { formatDateTime, formatRelative } from '@/lib/format'
import type { CronSchedule, OverlapPolicy } from '@/api/types/cron'
import type { SelectOption } from '@/components/ui/Select.vue'
import Modal from '@/components/ui/Modal.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Button from '@/components/ui/Button.vue'
import Spinner from '@/components/ui/Spinner.vue'

const props = defineProps<{
  open: boolean
  /** Pass a CronSchedule to edit; omit/null for create. */
  schedule?: CronSchedule | null
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [id: string]
  updated: [schedule: CronSchedule]
}>()

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const conn = useConnectionStore()
const ui = useUiStore()
const isEdit = computed(() => !!props.schedule)

const defaultForm = (): {
  sequence_id: string
  namespace: string
  cron_expr: string
  timezone: string
  overlap_policy: OverlapPolicy
  enabled: boolean
  metadata: string
} => ({
  sequence_id: '',
  namespace: 'default',
  cron_expr: '',
  timezone: 'UTC',
  overlap_policy: 'allow',
  enabled: true,
  metadata: '{}',
})

const form = reactive(defaultForm())
const errors = ref<Record<string, string | null>>({})
const submitting = ref(false)

// Next-fires preview state
const previewLoading = ref(false)
const previewFires = ref<string[]>([])
const previewTz = ref('')
const previewError = ref<string | null>(null)

// Sync form when editing
watch(
  () => props.schedule,
  (s) => {
    if (s) {
      form.sequence_id = s.sequence_id
      form.namespace = s.namespace
      form.cron_expr = s.cron_expr
      form.timezone = s.timezone
      form.overlap_policy = s.overlap_policy
      form.enabled = s.enabled
      form.metadata = s.metadata ? JSON.stringify(s.metadata, null, 2) : '{}'
    }
  },
  { immediate: true },
)

const overlapPolicyOptions: SelectOption[] = [
  { value: 'allow', label: 'Allow — always fire (default)' },
  { value: 'skip', label: 'Skip — skip if previous run active' },
  { value: 'buffer_one', label: 'Buffer one — defer until previous finishes' },
  { value: 'cancel_previous', label: 'Cancel previous — cancel active run before firing' },
]

function validate() {
  const schemaBase: Record<string, unknown> = {
    cron_expr: form.cron_expr,
    metadata: form.metadata,
  }
  const rulesBase = {
    cron_expr: [required('Cron expression'), cronRule()],
    metadata: [jsonRule('Metadata JSON')],
  }

  if (!isEdit.value) {
    const { errors: e, valid } = validateForm(
      { ...schemaBase, sequence_id: form.sequence_id, namespace: form.namespace } as Record<string, unknown>,
      {
        ...rulesBase,
        sequence_id: [required('Sequence ID'), uuid('Sequence ID')],
        namespace: [required('Namespace')],
      },
    )
    errors.value = e
    return valid
  }

  const { errors: e, valid } = validateForm(schemaBase as Record<string, unknown>, rulesBase)
  errors.value = e
  return valid
}

async function previewNextFires() {
  if (!props.schedule?.id) return
  previewLoading.value = true
  previewError.value = null
  try {
    const res = await getCronNextFires(props.schedule.id, { n: 5 })
    previewFires.value = res.fires
    previewTz.value = res.timezone
  } catch (e) {
    previewError.value = errorMessage(e)
  } finally {
    previewLoading.value = false
  }
}

async function submit() {
  if (!validate()) return
  submitting.value = true
  try {
    const metadataObj = form.metadata.trim() ? (JSON.parse(form.metadata) as unknown) : {}

    if (isEdit.value && props.schedule) {
      const updated = await updateCron(props.schedule.id, {
        cron_expr: form.cron_expr || null,
        timezone: form.timezone || null,
        enabled: form.enabled,
        metadata: metadataObj,
        overlap_policy: form.overlap_policy,
      })
      ui.success('Schedule updated', updated.id)
      emit('updated', updated)
    } else {
      const res = await createCron({
        tenant_id: conn.tenantId,
        namespace: form.namespace.trim(),
        sequence_id: form.sequence_id.trim(),
        cron_expr: form.cron_expr.trim(),
        timezone: form.timezone.trim() || 'UTC',
        metadata: metadataObj,
        enabled: form.enabled,
        overlap_policy: form.overlap_policy,
      })
      ui.success('Schedule created', res.id)
      emit('created', res.id)
    }

    open.value = false
    const fresh = defaultForm()
    Object.assign(form, fresh)
    errors.value = {}
    previewFires.value = []
  } catch (e) {
    ui.error(isEdit.value ? 'Failed to update schedule' : 'Failed to create schedule', errorMessage(e))
  } finally {
    submitting.value = false
  }
}

function onClose() {
  open.value = false
  if (!props.schedule) Object.assign(form, defaultForm())
  errors.value = {}
  previewFires.value = []
  previewError.value = null
}
</script>

<template>
  <Modal :open="open" :title="isEdit ? 'Edit Cron Schedule' : 'Create Cron Schedule'" size="lg" @update:open="onClose">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <template v-if="!isEdit">
        <Field label="Sequence ID" :error="errors.sequence_id" required hint="UUID of the sequence to instantiate.">
          <template #default="{ id, invalid }">
            <Input :id="id" v-model="form.sequence_id" placeholder="018f0000-0000-7000-0000-000000000000" mono :invalid="invalid" />
          </template>
        </Field>

        <Field label="Namespace" :error="errors.namespace" required>
          <template #default="{ id, invalid }">
            <Input :id="id" v-model="form.namespace" placeholder="default" mono :invalid="invalid" />
          </template>
        </Field>
      </template>

      <Field label="Cron expression" :error="errors.cron_expr" required hint="5-field (min hour dom mon dow) or 6/7-field with seconds/year.">
        <template #default="{ id, invalid }">
          <Input :id="id" v-model="form.cron_expr" placeholder="0 9 * * MON-FRI" mono :invalid="invalid" />
        </template>
      </Field>

      <Field label="Timezone" hint="IANA timezone name (e.g. America/New_York). Default: UTC.">
        <template #default="{ id }">
          <Input :id="id" v-model="form.timezone" placeholder="UTC" mono />
        </template>
      </Field>

      <Field label="Overlap policy">
        <template #default="{ id }">
          <Select :id="id" v-model="form.overlap_policy" :options="overlapPolicyOptions" />
        </template>
      </Field>

      <Field label="Metadata JSON" :error="errors.metadata" hint="Injected into every instance created by this schedule.">
        <template #default="{ id, invalid }">
          <Textarea :id="id" v-model="form.metadata" placeholder="{}" :rows="3" :invalid="invalid" />
        </template>
      </Field>

      <label class="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-surface-2 px-3 py-2.5">
        <input v-model="form.enabled" type="checkbox" class="accent-[var(--accent)]" />
        <span class="text-[13px] text-text">Enabled</span>
      </label>

      <!-- Next-fires preview (edit mode only — requires a saved ID) -->
      <template v-if="isEdit && schedule">
        <div class="rounded-lg border border-border bg-surface-2 p-3">
          <div class="mb-2 flex items-center justify-between">
            <p class="text-[12px] font-semibold uppercase tracking-wide text-subtle">Next fires preview</p>
            <Button variant="ghost" size="sm" :loading="previewLoading" @click.prevent="previewNextFires">Preview</Button>
          </div>
          <div v-if="previewLoading" class="flex justify-center py-2"><Spinner :size="16" /></div>
          <p v-else-if="previewError" class="text-[12px] text-danger">{{ previewError }}</p>
          <template v-else-if="previewFires.length">
            <p class="mb-1 text-[11.5px] text-faint">Timezone: {{ previewTz }}</p>
            <ol class="space-y-1">
              <li v-for="(fire, i) in previewFires" :key="i" class="flex items-center justify-between text-[12.5px]">
                <span class="mono text-text">{{ formatDateTime(fire) }}</span>
                <span class="text-subtle">{{ formatRelative(fire) }}</span>
              </li>
            </ol>
          </template>
          <p v-else class="text-[12px] text-subtle">Click "Preview" to see upcoming fire times.</p>
        </div>
      </template>
    </form>

    <template #footer="{ close }">
      <Button variant="ghost" @click="close">Cancel</Button>
      <Button variant="primary" :loading="submitting" @click="submit">
        {{ isEdit ? 'Save changes' : 'Create schedule' }}
      </Button>
    </template>
  </Modal>
</template>
