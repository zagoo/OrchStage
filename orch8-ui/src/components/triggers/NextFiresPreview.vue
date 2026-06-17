<script setup lang="ts">
/**
 * Shows the next N upcoming fires for a cron schedule.
 * DESIGN_REFERENCE §GET /api/v1/cron/{id}/next-fires
 */
import { ref } from 'vue'
import { CalendarClock, RefreshCw } from 'lucide-vue-next'
import { getCronNextFires } from '@/api/cron'
import { errorMessage } from '@/api/errors'
import { formatDateTime, formatRelative } from '@/lib/format'
import type { NextFiresResponse } from '@/api/types/cron'
import IconButton from '@/components/ui/IconButton.vue'
import Spinner from '@/components/ui/Spinner.vue'

const props = defineProps<{ cronId: string }>()

const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<NextFiresResponse | null>(null)

async function load() {
  if (!props.cronId) return
  loading.value = true
  error.value = null
  try {
    result.value = await getCronNextFires(props.cronId, { n: 5 })
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

// Auto-load on mount
void load()
</script>

<template>
  <div class="rounded-lg border border-border bg-surface-2 p-3">
    <div class="mb-2 flex items-center justify-between">
      <p class="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-subtle">
        <CalendarClock :size="12" /> Next fires
      </p>
      <IconButton label="Refresh next fires" size="sm" @click="load">
        <RefreshCw :size="13" :class="loading && 'animate-spin'" />
      </IconButton>
    </div>

    <div v-if="loading" class="flex justify-center py-3">
      <Spinner :size="16" />
    </div>
    <p v-else-if="error" class="text-[12px] text-danger">{{ error }}</p>
    <template v-else-if="result">
      <p class="mb-1.5 text-[11.5px] text-faint">Timezone: {{ result.timezone }}</p>
      <ol v-if="result.fires.length" class="space-y-1">
        <li
          v-for="(fire, i) in result.fires"
          :key="i"
          class="flex items-center justify-between text-[12.5px]"
        >
          <span class="mono text-text">{{ formatDateTime(fire) }}</span>
          <span class="text-subtle">{{ formatRelative(fire) }}</span>
        </li>
      </ol>
      <p v-else class="text-[12px] text-subtle">No future occurrences.</p>
    </template>
    <p v-else class="text-[12px] text-subtle">—</p>
  </div>
</template>
