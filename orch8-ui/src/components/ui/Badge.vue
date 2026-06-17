<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/cn'

export type BadgeTone =
  | 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'cyan' | 'pink' | 'teal'
type Variant = 'soft' | 'solid' | 'outline'

const props = withDefaults(
  defineProps<{ tone?: BadgeTone; variant?: Variant; size?: 'sm' | 'md'; class?: string }>(),
  { tone: 'neutral', variant: 'soft', size: 'sm' },
)

const soft: Record<BadgeTone, string> = {
  neutral: 'bg-hover text-muted',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  purple: 'bg-purple/15 text-purple',
  cyan: 'bg-cyan/15 text-cyan',
  pink: 'bg-pink/15 text-pink',
  teal: 'bg-teal/15 text-teal',
}
const solid: Record<BadgeTone, string> = {
  neutral: 'bg-faint text-white',
  accent: 'bg-accent text-white',
  success: 'bg-success text-white',
  warning: 'bg-warning text-black',
  danger: 'bg-danger text-white',
  info: 'bg-info text-white',
  purple: 'bg-purple text-white',
  cyan: 'bg-cyan text-black',
  pink: 'bg-pink text-white',
  teal: 'bg-teal text-white',
}
const outline: Record<BadgeTone, string> = {
  neutral: 'border border-border-strong text-muted',
  accent: 'border border-accent/40 text-accent',
  success: 'border border-success/40 text-success',
  warning: 'border border-warning/40 text-warning',
  danger: 'border border-danger/40 text-danger',
  info: 'border border-info/40 text-info',
  purple: 'border border-purple/40 text-purple',
  cyan: 'border border-cyan/40 text-cyan',
  pink: 'border border-pink/40 text-pink',
  teal: 'border border-teal/40 text-teal',
}

const cls = computed(() => {
  const map = props.variant === 'solid' ? solid : props.variant === 'outline' ? outline : soft
  return cn(
    'inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium',
    props.size === 'sm' ? 'px-2 py-0.5 text-[11.5px]' : 'px-2.5 py-1 text-[12.5px]',
    map[props.tone],
    props.class,
  )
})
</script>

<template>
  <span :class="cls"><slot /></span>
</template>
