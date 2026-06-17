<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { cn } from '@/lib/cn'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    id?: string
    options?: SelectOption[]
    placeholder?: string
    invalid?: boolean
    disabled?: boolean
    class?: string
  }>(),
  { invalid: false, disabled: false },
)
const model = defineModel<string>()

const cls = computed(() =>
  cn(
    'h-9 w-full appearance-none rounded-md border bg-surface-2 pl-3 pr-9 text-[13px] text-text transition-colors',
    'focus:border-accent focus:bg-surface focus:outline-none',
    props.invalid ? 'border-danger' : 'border-border-strong hover:border-faint',
    props.disabled && 'cursor-not-allowed opacity-60',
    props.class,
  ),
)
</script>

<template>
  <div class="relative">
    <select :id="id" v-model="model" :disabled="disabled" :class="cls" :aria-invalid="invalid">
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <template v-if="options">
        <option v-for="opt in options" :key="opt.value" :value="opt.value" :disabled="opt.disabled">
          {{ opt.label }}
        </option>
      </template>
      <slot v-else />
    </select>
    <ChevronDown :size="15" class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
  </div>
</template>
