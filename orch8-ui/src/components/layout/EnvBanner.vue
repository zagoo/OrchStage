<script setup lang="ts">
/**
 * Environment banner — a full-width colored strip rendered when the connected
 * orch8-server reports an operator-set environment label via GET /info
 * (`ORCH8_ENV_LABEL` / `ORCH8_ENV_COLOR`). Lets an operator tell prod from
 * staging at a glance. Renders nothing when no label is configured.
 *
 * The color is applied through a style-binding OBJECT (not a raw style string),
 * so an unusual value is set as a DOM property and simply ignored if invalid —
 * never interpreted as CSS text.
 */
import { computed } from 'vue'
import { useConnectionStore } from '@/stores/connection'

const conn = useConnectionStore()
const label = computed(() => conn.envLabel)
// Default to a neutral slate when a label is set without an explicit color.
const color = computed(() => conn.envColor ?? '#475569')
</script>

<template>
  <div
    v-if="label"
    class="flex shrink-0 items-center justify-center gap-2 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white"
    :style="{ backgroundColor: color }"
    :title="`Engine ${conn.engineVersion}`"
    role="status"
  >
    <span class="inline-block h-1.5 w-1.5 rounded-full bg-white/80" />
    <span>{{ label }}</span>
  </div>
</template>
