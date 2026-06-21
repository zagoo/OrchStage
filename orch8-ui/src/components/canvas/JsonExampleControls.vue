<script setup lang="ts">
/**
 * Shows a JSON editor field's COMPLETE reference example (defined in blockConfig)
 * as fully-rendered, readable, copyable text — every nested level and array, not a
 * truncated placeholder. "Insert" drops the same example into the field; the copy
 * affordance comes from CodeBlock's header.
 */
import { ClipboardPaste } from 'lucide-vue-next'
import CodeBlock from '@/components/ui/CodeBlock.vue'

/**
 * Pre-formatted (prettyJson) example string — rendered in full and used by Insert.
 * `params` (optional) is the COMPLETE parameter reference for the handler: EVERY param
 * the engine reads — name, required flag, type/enum/range/default summary, description —
 * shown under the example so the full parameter surface is always visible, not just the
 * fields the JSON example happens to include.
 */
defineProps<{
  value: string
  params?: { name: string; required: boolean; meta: string; desc: string }[]
}>()
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
    <!-- COMPLETE parameter reference: every param the engine reads (name · required ·
         type/enum/range/default · description) — so nothing is hidden behind the example. -->
    <div v-if="params && params.length" class="mt-1.5">
      <span class="text-[10.5px] uppercase tracking-wider text-faint">All parameters ({{ params.length }})</span>
      <ul class="mt-1 space-y-1">
        <li v-for="p in params" :key="p.name" class="text-[10.5px] leading-snug">
          <span class="flex flex-wrap items-baseline gap-x-1.5">
            <span class="mono text-muted">{{ p.name }}</span>
            <span
              v-if="p.required"
              class="rounded bg-danger-soft px-1 text-[9px] font-semibold uppercase tracking-wide text-danger"
              >required</span
            >
            <span class="text-faint">{{ p.meta }}</span>
          </span>
          <span class="block text-subtle">{{ p.desc }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
