<script setup lang="ts">
/**
 * Sticky action bar that appears when one or more rows are selected.
 * Emits batch-action events for: pause, resume, cancel, retry, bulk-state.
 * Destructive actions (cancel, retry) are confirmed by the caller via ui.confirm.
 * DESIGN_REFERENCE §Instances §14 Batch Action; §12 Bulk Update State
 */
import { Play, Pause, Ban, RotateCcw, X } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import type { BatchAction } from '@/api/types/instances'

defineProps<{ count: number; loading: boolean }>()
const emit = defineEmits<{
  action: [action: BatchAction]
  clear: []
}>()
</script>

<template>
  <Transition name="slide-up">
    <div
      v-if="count > 0"
      class="sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-2 rounded-xl border border-border-strong bg-elevated px-4 py-2.5 shadow-pop"
    >
      <span class="mr-1 text-[13px] font-medium text-text">
        {{ count }} selected
      </span>

      <Button
        size="sm"
        variant="secondary"
        :disabled="loading"
        aria-label="Resume selected instances"
        @click="emit('action', 'resume')"
      >
        <template #icon><Play :size="14" /></template>
        Resume
      </Button>

      <Button
        size="sm"
        variant="secondary"
        :disabled="loading"
        aria-label="Pause selected instances"
        @click="emit('action', 'pause')"
      >
        <template #icon><Pause :size="14" /></template>
        Pause
      </Button>

      <Button
        size="sm"
        variant="danger"
        :disabled="loading"
        aria-label="Cancel selected instances"
        @click="emit('action', 'cancel')"
      >
        <template #icon><Ban :size="14" /></template>
        Cancel
      </Button>

      <Button
        size="sm"
        variant="secondary"
        :disabled="loading"
        aria-label="Retry selected failed instances"
        @click="emit('action', 'retry')"
      >
        <template #icon><RotateCcw :size="14" /></template>
        Retry
      </Button>

      <button
        class="ml-1 rounded p-1 text-faint transition-colors hover:text-text"
        aria-label="Clear selection"
        @click="emit('clear')"
      >
        <X :size="16" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
