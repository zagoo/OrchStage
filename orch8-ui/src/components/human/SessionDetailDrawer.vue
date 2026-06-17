<script setup lang="ts">
/**
 * Session detail drawer.
 * Shows session metadata, allows editing data (JSON) and changing state.
 * Also lists linked TaskInstances (GET /api/v1/sessions/{id}/instances).
 *
 * DESIGN_REFERENCE §Sessions §2.5 Update Session Data, §2.6 Update Session State, §2.7 List Session Instances
 */
import { ref, watch, computed } from 'vue'
import { MessagesSquare, RefreshCw, ChevronRight } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useAsync } from '@/composables/useAsync'
import { updateSessionData, updateSessionState, listSessionInstances } from '@/api/sessions'
import { errorMessage } from '@/api/errors'
import { formatRelative, formatDateTime, shortId } from '@/lib/format'
import type { Session, SessionState, TaskInstance } from '@/api/types/sessions'
import type { BadgeTone } from '@/components/ui/Badge.vue'
import Drawer from '@/components/ui/Drawer.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import KeyValue from '@/components/ui/KeyValue.vue'
import Field from '@/components/ui/Field.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'


const props = defineProps<{
  session: Session | null
}>()

const emit = defineEmits<{
  updated: [session: Session]
}>()

const open = defineModel<boolean>('open', { required: true })

const ui = useUiStore()

// --- state tone map -----------------------------------------------------------
const stateTone: Record<SessionState, BadgeTone> = {
  active: 'success',
  paused: 'warning',
  completed: 'neutral',
  expired: 'danger',
}

const stateOptions: Array<{ value: SessionState; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
]

// --- data edit ----------------------------------------------------------------
const dataJson = ref('')
const dataJsonError = ref<string | null>(null)
const savingData = ref(false)

// --- state transition ---------------------------------------------------------
const selectedState = ref<SessionState>('active')
const savingState = ref(false)

// --- linked instances ---------------------------------------------------------
const instancesLoader = useAsync((signal) =>
  props.session ? listSessionInstances(props.session.id, signal) : Promise.resolve<TaskInstance[]>([]),
)
const { data: instances, loading: loadingInstances } = instancesLoader

function instanceStateTone(state: string): BadgeTone {
  if (state === 'running') return 'info'
  if (state === 'completed') return 'success'
  if (state === 'failed') return 'danger'
  if (state === 'waiting' || state === 'paused') return 'warning'
  if (state === 'cancelled') return 'neutral'
  return 'neutral'
}

// Reset and load when session changes
watch(
  () => props.session,
  (s) => {
    if (!s) return
    // Initialise edit fields
    dataJson.value = JSON.stringify(s.data ?? {}, null, 2)
    dataJsonError.value = null
    selectedState.value = s.state
    // Load linked instances
    void instancesLoader.run()
  },
  { immediate: true },
)

watch(open, (v) => {
  if (!v) {
    dataJsonError.value = null
    dataJson.value = ''
  }
})

// --- validate and save data ---------------------------------------------------
function validateDataJson(): boolean {
  try {
    JSON.parse(dataJson.value)
    dataJsonError.value = null
    return true
  } catch {
    dataJsonError.value = 'Must be valid JSON.'
    return false
  }
}

async function saveData() {
  if (!props.session) return
  if (!validateDataJson()) return

  savingData.value = true
  try {
    const parsed = JSON.parse(dataJson.value) as unknown
    await updateSessionData(props.session.id, { data: parsed })
    ui.success('Session data saved', props.session.session_key)
    // Emit with synthesised updated session so parent can refresh
    emit('updated', { ...props.session, data: parsed, updated_at: new Date().toISOString() })
  } catch (e) {
    ui.error('Failed to save data', errorMessage(e))
  } finally {
    savingData.value = false
  }
}

// --- save state transition ----------------------------------------------------
const isTerminal = computed(() =>
  props.session ? ['completed', 'expired'].includes(props.session.state) : false,
)

async function saveState() {
  if (!props.session) return
  if (selectedState.value === props.session.state) return

  // Warn when re-activating a terminal session (no API guard — business logic)
  if (isTerminal.value) {
    const ok = await ui.confirm({
      title: 'Re-activate terminal session?',
      message: `Session is currently "${props.session.state}". The API will accept any state value — are you sure you want to transition to "${selectedState.value}"?`,
      tone: 'danger',
      confirmText: 'Change state',
    })
    if (!ok) return
  }

  savingState.value = true
  try {
    await updateSessionState(props.session.id, { state: selectedState.value })
    ui.success('Session state updated', `→ ${selectedState.value}`)
    emit('updated', { ...props.session, state: selectedState.value, updated_at: new Date().toISOString() })
  } catch (e) {
    ui.error('Failed to update state', errorMessage(e))
  } finally {
    savingState.value = false
  }
}
</script>

<template>
  <Drawer v-model:open="open" :title="session?.session_key ?? 'Session'" width="560px">
    <template v-if="session">
      <!-- Summary -->
      <dl class="mb-4 divide-y divide-border rounded-md border border-border bg-surface">
        <KeyValue label="ID">
          <span class="mono text-[12px]">{{ shortId(session.id) }}</span>
        </KeyValue>
        <KeyValue label="Tenant">
          <span class="mono text-[12px]">{{ session.tenant_id }}</span>
        </KeyValue>
        <KeyValue label="State">
          <Badge :tone="stateTone[session.state]">{{ session.state }}</Badge>
        </KeyValue>
        <KeyValue label="Created">
          <span :title="formatDateTime(session.created_at)" class="text-text">
            {{ formatRelative(session.created_at) }}
          </span>
        </KeyValue>
        <KeyValue label="Updated">
          <span :title="formatDateTime(session.updated_at)" class="text-text">
            {{ formatRelative(session.updated_at) }}
          </span>
        </KeyValue>
        <KeyValue v-if="session.expires_at" label="Expires">
          <span :title="formatDateTime(session.expires_at)" class="text-text">
            {{ formatRelative(session.expires_at) }}
          </span>
        </KeyValue>
      </dl>

      <!-- Edit data -->
      <div class="mb-4 rounded-md border border-border bg-surface p-4">
        <p class="mb-2 text-[12.5px] font-medium text-muted">Session data (full replacement)</p>
        <Field :error="dataJsonError">
          <template #default="{ id, invalid }">
            <Textarea
              :id="id"
              v-model="dataJson"
              :invalid="invalid"
              :rows="8"
              class="mono text-[12px]"
              :disabled="savingData"
              @blur="validateDataJson"
            />
          </template>
        </Field>
        <div class="mt-2 flex justify-end">
          <Button
            variant="primary"
            size="sm"
            :loading="savingData"
            :disabled="!!dataJsonError"
            @click="saveData"
          >
            Save data
          </Button>
        </div>
      </div>

      <!-- State transition -->
      <div class="mb-4 rounded-md border border-border bg-surface p-4">
        <p class="mb-2 text-[12.5px] font-medium text-muted">Change state</p>
        <p class="mb-3 text-[12px] text-subtle">
          No API-layer transition guard — any state value is accepted. Business logic should
          prevent re-activating terminal sessions where required.
        </p>
        <div class="flex items-center gap-2">
          <Select
            v-model="selectedState"
            :options="stateOptions"
            class="w-40"
            :disabled="savingState"
          />
          <ChevronRight :size="14" class="text-faint" />
          <Button
            variant="ghost"
            size="sm"
            :loading="savingState"
            :disabled="selectedState === session.state"
            @click="saveState"
          >
            Apply
          </Button>
        </div>
      </div>

      <!-- Linked instances -->
      <div class="rounded-md border border-border bg-surface">
        <div class="flex items-center justify-between px-4 py-2">
          <p class="text-[12.5px] font-medium text-muted">
            <MessagesSquare :size="13" class="mr-1 inline" />
            Linked instances
          </p>
          <button
            class="text-[12px] text-accent hover:underline"
            :aria-label="loadingInstances ? 'Loading instances…' : 'Refresh instances'"
            @click="instancesLoader.run()"
          >
            <RefreshCw :size="12" :class="loadingInstances && 'animate-spin'" />
          </button>
        </div>

        <template v-if="instances && instances.length > 0">
          <ul class="divide-y divide-border">
            <li
              v-for="inst in instances"
              :key="inst.id"
              class="flex items-center justify-between px-4 py-2"
            >
              <span class="mono text-[12px] text-muted">{{ shortId(inst.id) }}</span>
              <span class="text-[12px] text-subtle">{{ inst.namespace }}</span>
              <Badge :tone="instanceStateTone(inst.state)" size="sm">{{ inst.state }}</Badge>
              <span :title="formatDateTime(inst.updated_at)" class="text-[11.5px] text-faint">
                {{ formatRelative(inst.updated_at) }}
              </span>
            </li>
          </ul>
        </template>
        <div v-else-if="loadingInstances" class="px-4 py-3 text-[12.5px] text-subtle">
          Loading…
        </div>
        <div v-else class="px-4 py-3 text-[12.5px] text-subtle">
          No instances linked to this session.
        </div>
      </div>
    </template>

    <div v-else class="text-[13px] text-subtle">No session selected.</div>
  </Drawer>
</template>
