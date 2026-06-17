<script setup lang="ts">
withDefaults(defineProps<{ text: string; side?: 'top' | 'bottom' | 'left' | 'right' }>(), { side: 'top' })

const pos = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2',
}
</script>

<template>
  <span class="group/tt relative inline-flex">
    <slot />
    <span
      :class="[
        'pointer-events-none absolute z-[130] whitespace-nowrap rounded-md border border-border-strong bg-elevated px-2 py-1 text-[11.5px] text-text opacity-0 shadow-2 transition-opacity duration-150 group-hover/tt:opacity-100',
        pos[side],
      ]"
      role="tooltip"
    >{{ text }}</span>
  </span>
</template>
