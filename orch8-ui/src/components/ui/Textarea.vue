<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/cn'

const props = withDefaults(
  defineProps<{
    id?: string
    placeholder?: string
    rows?: number
    invalid?: boolean
    disabled?: boolean
    mono?: boolean
    class?: string
  }>(),
  { rows: 6, invalid: false, disabled: false, mono: true },
)
const model = defineModel<string>()

const cls = computed(() =>
  cn(
    'w-full rounded-md border bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-text placeholder:text-faint transition-colors',
    'focus:border-accent focus:bg-surface focus:outline-none',
    props.invalid ? 'border-danger' : 'border-border-strong hover:border-faint',
    props.disabled && 'cursor-not-allowed opacity-60',
    props.mono && 'mono',
    props.class,
  ),
)
</script>

<template>
  <textarea
    :id="id"
    v-model="model"
    :rows="rows"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="cls"
    :aria-invalid="invalid"
    spellcheck="false"
  />
</template>
