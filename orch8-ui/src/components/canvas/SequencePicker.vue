<script setup lang="ts">
/**
 * Sequence + version picker for the canvas toolbar.
 * Lists sequences and allows picking a version to load.
 *
 * DESIGN_REFERENCE §dag-sequences.md §9.4 List Sequences
 */
import { ref, computed, onMounted } from 'vue'
import { GitBranch, Tag } from 'lucide-vue-next'
import { useConnectionStore } from '@/stores/connection'
import { useAsync } from '@/composables/useAsync'
import { listSequences, listSequenceVersions } from '@/api/sequences'
import type { SequenceDefinition } from '@/api/types/sequences'
import Select from '@/components/ui/Select.vue'

const props = defineProps<{
  modelValue: string | null // selected sequence id
  versionValue: string | null // selected version sequence id
  /** Sequence id to auto-select once the list loads (e.g. ?sequence= deep-link). */
  initialSequenceId?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string | null]
  'update:versionValue': [id: string | null]
  load: [seq: SequenceDefinition]
}>()

const conn = useConnectionStore()

const seqList = useAsync((signal) =>
  listSequences({ tenant_id: conn.tenantId || undefined, limit: 200 }, signal)
)

const versions = useAsync((signal) => {
  if (!selectedName.value || !selectedNamespace.value) return Promise.resolve([])
  return listSequenceVersions(
    { tenant_id: conn.tenantId || '', namespace: selectedNamespace.value, name: selectedName.value },
    signal,
  )
})

const selectedName = ref<string | null>(null)
const selectedNamespace = ref<string | null>(null)

const seqOptions = computed(() =>
  (seqList.data.value?.items ?? []).map((s) => ({
    value: s.id,
    label: `${s.namespace}/${s.name} (v${s.version})`,
  }))
)

const versionOptions = computed(() =>
  (versions.data.value ?? []).map((s) => ({
    value: s.id,
    label: `v${s.version} — ${s.status}${s.deprecated ? ' (deprecated)' : ''}`,
  }))
)

onMounted(async () => {
  await seqList.run()
  // Deep-link support: "Open in Canvas" navigates to /canvas?sequence=<id>. Once
  // the list is loaded, auto-select that sequence via the same path a manual pick
  // takes (emits update:modelValue + load), so the canvas renders it immediately.
  const initial = props.initialSequenceId
  if (initial && (seqList.data.value?.items ?? []).some((s) => s.id === initial)) {
    await onSequenceChange(initial)
  }
})

async function onSequenceChange(id: string) {
  emit('update:modelValue', id)
  emit('update:versionValue', null)

  const items = seqList.data.value?.items ?? []
  const found = items.find((s) => s.id === id)
  if (!found) return

  selectedName.value = found.name
  selectedNamespace.value = found.namespace

  await versions.run()

  // Auto-select this id as the default version
  emit('update:versionValue', id)
  emit('load', found)
}

async function onVersionChange(versionId: string) {
  emit('update:versionValue', versionId)
  const versionList = versions.data.value ?? []
  const found = versionList.find((s) => s.id === versionId)
  if (found) emit('load', found)
}
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Sequence selector -->
    <div class="flex items-center gap-1.5">
      <GitBranch :size="14" class="text-muted shrink-0" />
      <Select
        :model-value="modelValue ?? ''"
        :options="[{ value: '', label: 'Select sequence…' }, ...seqOptions]"
        class="h-7 min-w-[200px] text-[12px]"
        :disabled="seqList.loading.value"
        @update:model-value="(v) => v && onSequenceChange(v as string)"
      />
    </div>

    <!-- Version selector (only shown after a sequence is selected) -->
    <div v-if="modelValue" class="flex items-center gap-1.5">
      <Tag :size="13" class="text-muted shrink-0" />
      <Select
        :model-value="versionValue ?? ''"
        :options="[{ value: '', label: 'Version…' }, ...versionOptions]"
        class="h-7 min-w-[160px] text-[12px]"
        :disabled="versions.loading.value"
        @update:model-value="(v) => v && onVersionChange(v as string)"
      />
    </div>
  </div>
</template>
