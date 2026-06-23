<script setup lang="ts">
/**
 * Sequence picker dropdown — a rich wrapper over the shared Select listbox.
 *
 * Each row shows three columns — Sequence Name · Version · Status — and the value
 * is the chosen sequence's id (so callers keep working with `sequence_id`). Used by
 * the Create Instance modal (required pick) and the Instances search bar (clearable).
 *
 * DESIGN_REFERENCE §Instances §1 Create Instance; §3 List Instances
 */
import { computed } from 'vue'
import Select, { type SelectOption } from '@/components/ui/Select.vue'
import Badge, { type BadgeTone } from '@/components/ui/Badge.vue'
import type { SequenceDefinition, SequenceStatus } from '@/api/types/sequences'

const props = withDefaults(
  defineProps<{
    /** Selected sequence id (v-model). */
    modelValue?: string
    /** The sequence catalog to choose from. */
    options: SequenceDefinition[]
    placeholder?: string
    /** Prepend an "All sequences" row (value '') so the filter can be cleared. */
    clearable?: boolean
    invalid?: boolean
    disabled?: boolean
    id?: string
    class?: string
  }>(),
  { placeholder: 'Select a sequence…', clearable: false, invalid: false, disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [id: string] }>()

const model = computed<string>({
  get: () => props.modelValue ?? '',
  set: (v) => emit('update:modelValue', v),
})

// Sort by name then version (desc) so the newest version of each sequence is first.
const sorted = computed(() =>
  [...props.options].sort((a, b) => a.name.localeCompare(b.name) || b.version - a.version),
)

const ALL_OPTION: SelectOption = { value: '', label: 'All sequences' }

const selectOptions = computed<SelectOption[]>(() => {
  const rows: SelectOption[] = sorted.value.map((s) => ({
    value: s.id,
    label: `${s.name} v${s.version}`, // fallback label (title attr, truncation, a11y)
    data: s,
  }))
  return props.clearable ? [ALL_OPTION, ...rows] : rows
})

/** Recover the SequenceDefinition stashed on an option (null for the "All" row). */
function seqOf(o: SelectOption | null | undefined): SequenceDefinition | null {
  return (o?.data as SequenceDefinition | undefined) ?? null
}

const STATUS_TONE: Record<SequenceStatus, BadgeTone> = {
  production: 'success',
  staging: 'warning',
  draft: 'neutral',
  unpublished: 'neutral',
}
function statusTone(s: SequenceStatus): BadgeTone {
  return STATUS_TONE[s] ?? 'neutral'
}
</script>

<template>
  <Select
    :id="id"
    v-model="model"
    :options="selectOptions"
    :placeholder="placeholder"
    :invalid="invalid"
    :disabled="disabled"
    :class="props.class"
  >
    <!-- Trigger: "<name> v<version>" (or the plain label for the All row). -->
    <template #value="{ selected }">
      <span v-if="seqOf(selected)" class="flex min-w-0 items-center gap-1.5">
        <span class="truncate text-text">{{ seqOf(selected)!.name }}</span>
        <span class="mono shrink-0 text-faint">v{{ seqOf(selected)!.version }}</span>
      </span>
      <span v-else :class="['block truncate', !selected && 'text-faint']">
        {{ selected?.label ?? placeholder }}
      </span>
    </template>

    <!-- Column header so the three columns are labelled. -->
    <template #listbox-header>
      <div
        class="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-faint"
      >
        <span>Sequence name</span>
        <span class="text-right">Version</span>
        <span class="text-right">Status</span>
      </div>
    </template>

    <!-- Each row: Name · Version · Status badge. -->
    <template #option="{ option }">
      <span v-if="seqOf(option)" class="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2.5">
        <span class="truncate">{{ seqOf(option)!.name }}</span>
        <span class="mono shrink-0 text-[12px] tabular-nums text-subtle">v{{ seqOf(option)!.version }}</span>
        <Badge :tone="statusTone(seqOf(option)!.status)" size="sm">{{ seqOf(option)!.status }}</Badge>
      </span>
      <span v-else class="block truncate text-muted">{{ option.label }}</span>
    </template>
  </Select>
</template>
