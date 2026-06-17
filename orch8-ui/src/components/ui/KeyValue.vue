<script setup lang="ts">
withDefaults(defineProps<{ label: string; align?: 'start' | 'center' }>(), { align: 'center' })
</script>

<template>
  <div
    :class="[
      'flex justify-between gap-4 py-2',
      align === 'center' ? 'items-center' : 'items-start',
    ]"
  >
    <dt class="shrink-0 text-[12.5px] text-subtle">{{ label }}</dt>
    <dd class="min-w-0 text-right text-[13px] text-text">
      <slot />
    </dd>
  </div>
</template>
