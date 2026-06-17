<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/cn'
import Spinner from './Spinner.vue'

type Variant = 'ghost' | 'secondary' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    label: string
    variant?: Variant
    size?: Size
    disabled?: boolean
    loading?: boolean
    active?: boolean
    class?: string
  }>(),
  { variant: 'ghost', size: 'md', disabled: false, loading: false, active: false },
)

const variants: Record<Variant, string> = {
  ghost: 'text-muted hover:bg-hover hover:text-text',
  secondary: 'bg-surface-2 border border-border-strong text-text hover:bg-hover',
  danger: 'text-muted hover:bg-danger-soft hover:text-danger',
}
const sizes: Record<Size, string> = { sm: 'h-7 w-7 rounded-md', md: 'h-9 w-9 rounded-md', lg: 'h-10 w-10 rounded-lg' }

const cls = computed(() =>
  cn(
    'inline-flex items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    variants[props.variant],
    sizes[props.size],
    props.active && 'bg-accent-soft text-accent',
    props.class,
  ),
)
</script>

<template>
  <button type="button" :class="cls" :disabled="disabled || loading" :aria-label="label" :title="label">
    <Spinner v-if="loading" :size="15" />
    <slot v-else />
  </button>
</template>
