<script setup lang="ts">
/**
 * Shows a JSON editor field's COMPLETE reference example (defined in blockConfig)
 * as fully-rendered, readable, copyable text — every nested level and array, not a
 * truncated placeholder. "Insert" drops the same example into the field; the copy
 * affordance comes from CodeBlock's header.
 */
import { ClipboardPaste } from 'lucide-vue-next'
import CodeBlock from '@/components/ui/CodeBlock.vue'

/** Pre-formatted (prettyJson) example string — rendered in full and used by Insert. */
defineProps<{ value: string }>()
defineEmits<{ insert: [] }>()
</script>

<template>
  <div class="mb-1.5">
    <div class="mb-1 flex items-center justify-between">
      <span class="text-[10.5px] uppercase tracking-wider text-faint">Example</span>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-subtle transition-colors hover:bg-hover hover:text-text"
        title="Insert this complete example into the field below"
        @click="$emit('insert')"
      >
        <ClipboardPaste :size="12" /> Insert
      </button>
    </div>
    <!-- Full example rendered as readable code (all nested levels), with copy. -->
    <CodeBlock :content="value" language="json" max-height="180px" />
  </div>
</template>
