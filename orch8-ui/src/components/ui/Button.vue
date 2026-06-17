<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/cn'
import Spinner from './Spinner.vue'

type Variant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger' | 'danger-outline'
type Size = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    size?: Size
    type?: 'button' | 'submit' | 'reset'
    loading?: boolean
    disabled?: boolean
    block?: boolean
    class?: string
  }>(),
  { variant: 'secondary', size: 'md', type: 'button', loading: false, disabled: false, block: false },
)

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong shadow-[var(--shadow-1)]',
  secondary: 'bg-surface-2 border border-border-strong text-text hover:bg-hover',
  ghost: 'text-muted hover:bg-hover hover:text-text',
  subtle: 'text-muted hover:text-text',
  danger: 'bg-danger text-white hover:brightness-110 shadow-[var(--shadow-1)]',
  'danger-outline': 'border border-danger/40 text-danger hover:bg-danger-soft',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[12.5px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-md',
  lg: 'h-10 px-4 text-sm gap-2 rounded-lg',
}

const cls = computed(() =>
  cn(
    'inline-flex select-none items-center justify-center font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2',
    variants[props.variant],
    sizes[props.size],
    props.block && 'w-full',
    props.class,
  ),
)
const spinnerSize = computed(() => (props.size === 'lg' ? 16 : 14))
</script>

<template>
  <button :type="type" :class="cls" :disabled="disabled || loading">
    <Spinner v-if="loading" :size="spinnerSize" />
    <slot v-else name="icon" />
    <slot />
  </button>
</template>
