<script setup lang="ts">
/**
 * A compact header row for a JSON editor field. Surfaces the field's COMPLETE
 * reference example (defined in blockConfig) so the user can either drop it into
 * the field ("Insert") or copy it to the clipboard ("Copy") — satisfying the
 * requirement that the full JSON example is both shown and copyable.
 */
import { ClipboardPaste } from 'lucide-vue-next'
import CopyButton from '@/components/ui/CopyButton.vue'

defineProps<{ value: string }>()
defineEmits<{ insert: [] }>()
</script>

<template>
  <div class="mb-1 flex items-center justify-between">
    <span class="text-[10.5px] uppercase tracking-wider text-faint">Example</span>
    <div class="flex items-center gap-0.5">
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-subtle transition-colors hover:bg-hover hover:text-text"
        title="Insert the complete example into this field"
        @click="$emit('insert')"
      >
        <ClipboardPaste :size="12" /> Insert
      </button>
      <CopyButton :value="value" :size="12" />
    </div>
  </div>
</template>
