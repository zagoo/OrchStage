<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/cn'

const props = withDefaults(
  defineProps<{
    id?: string
    type?: string
    placeholder?: string
    invalid?: boolean
    disabled?: boolean
    mono?: boolean
    class?: string
  }>(),
  { type: 'text', invalid: false, disabled: false, mono: false },
)
const model = defineModel<string | number | null>()

const cls = computed(() =>
  cn(
    'h-9 w-full rounded-md border bg-surface-2 px-3 text-[13px] text-text placeholder:text-faint transition-colors',
    'focus:border-accent focus:bg-surface focus:outline-none',
    props.invalid ? 'border-danger' : 'border-border-strong hover:border-faint',
    props.disabled && 'cursor-not-allowed opacity-60',
    props.mono && 'mono',
    props.class,
  ),
)
</script>

<template>
  <input
    :id="id"
    v-model="model"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="cls"
    :aria-invalid="invalid"
  />
</template>
