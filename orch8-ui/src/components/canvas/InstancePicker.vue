<script setup lang="ts">
/**
 * Instance picker for the live-state overlay.
 * Lists recent instances for the loaded sequence; selecting one activates
 * real-time state coloring on the canvas nodes.
 *
 * DESIGN_REFERENCE §instances-core.md §3 List Instances
 */
import { computed, watch } from 'vue'
import { Activity, X } from 'lucide-vue-next'
import { useAsync } from '@/composables/useAsync'
import { listInstances } from '@/api/instances'
import type { TaskInstance } from '@/api/types/instances'
import Select from '@/components/ui/Select.vue'

const props = defineProps<{
  sequenceId: string | null
  modelValue: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string | null]
}>()

const instanceList = useAsync((signal) => {
  if (!props.sequenceId) return Promise.resolve([] as TaskInstance[])
  return listInstances({ sequence_id: props.sequenceId, limit: 50 }, signal)
})

watch(
  () => props.sequenceId,
  (id) => {
    if (id) void instanceList.run()
    else instanceList.reset()
  },
  { immediate: true },
)

const instanceOptions = computed(() =>
  (instanceList.data.value ?? []).map((inst) => ({
    value: inst.id,
    label: `${inst.id.slice(0, 8)}… — ${inst.state} (${inst.namespace})`,
  }))
)

function onClear() {
  emit('update:modelValue', null)
}
</script>

<template>
  <div v-if="sequenceId" class="flex items-center gap-1.5">
    <Activity :size="14" class="text-muted shrink-0" />
    <Select
      :model-value="modelValue ?? ''"
      :options="[{ value: '', label: 'Overlay instance…' }, ...instanceOptions]"
      class="h-7 min-w-[220px] text-[12px]"
      :disabled="instanceList.loading.value"
      @update:model-value="(v) => emit('update:modelValue', (v as string) || null)"
    />
    <button
      v-if="modelValue"
      class="flex h-5 w-5 items-center justify-center rounded text-muted hover:text-text"
      aria-label="Clear instance overlay"
      @click="onClear"
    >
      <X :size="12" />
    </button>
  </div>
</template>
