<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Check } from 'lucide-vue-next'
import { cn } from '@/lib/cn'

const props = withDefaults(defineProps<{ value: string; size?: number; class?: string }>(), { size: 14 })
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1400)
  } catch {
    /* clipboard unavailable */
  }
}
</script>

<template>
  <button
    type="button"
    :class="cn('inline-flex items-center justify-center rounded p-1 text-faint transition-colors hover:text-text', $props.class)"
    :aria-label="copied ? 'Copied' : 'Copy to clipboard'"
    :title="copied ? 'Copied' : 'Copy'"
    @click.stop="copy"
  >
    <Check v-if="copied" :size="size" class="text-success" />
    <Copy v-else :size="size" />
  </button>
</template>
