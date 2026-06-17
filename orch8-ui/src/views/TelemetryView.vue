<script setup lang="ts">
/**
 * Telemetry — Mobile SDK dashboard view.
 * Wires: GET /api/v1/telemetry/mobile/dashboard (all four query_type values)
 * DESIGN_REFERENCE §Telemetry (observability.md §GET /telemetry/mobile/dashboard)
 */
import { ref, onMounted } from 'vue'
import { Activity, RefreshCw } from 'lucide-vue-next'
import { useAsync } from '@/composables/useAsync'
import { getDashboard } from '@/api/telemetry'
import type { DashboardQueryType } from '@/api/types/observability'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DashboardPanel from '@/components/observability/DashboardPanel.vue'

// One useAsync per query_type so panels load independently
function makeDashboardAsync(queryType: DashboardQueryType) {
  return useAsync((signal) => getDashboard({ query_type: queryType }, signal))
}

const syncAsync = makeDashboardAsync('sync_completed_versions')
const errorRateAsync = makeDashboardAsync('error_rate_per_sequence')
const failingStepsAsync = makeDashboardAsync('top_failing_steps')
const osBreakdownAsync = makeDashboardAsync('device_os_breakdown')

const anyLoading = ref(false)

async function refreshAll() {
  anyLoading.value = true
  await Promise.allSettled([
    syncAsync.run(),
    errorRateAsync.run(),
    failingStepsAsync.run(),
    osBreakdownAsync.run(),
  ])
  anyLoading.value = false
}

onMounted(() => {
  void refreshAll()
})
</script>

<template>
  <div>
    <PageHeader
      title="Telemetry"
      description="Mobile SDK telemetry dashboard — last 7 days. Data ingested via POST /telemetry/mobile."
      :icon="Activity"
    >
      <template #actions>
        <IconButton label="Refresh telemetry" @click="refreshAll">
          <RefreshCw :size="16" :class="anyLoading && 'animate-spin'" />
        </IconButton>
      </template>
    </PageHeader>

    <div class="grid gap-5 md:grid-cols-2">
      <!-- Sync completed versions -->
      <Panel
        title="Sync Completed Versions"
        subtitle="Distribution of completed sync versions across devices"
      >
        <div
          v-if="syncAsync.error.value"
          class="rounded-md border border-danger/30 bg-danger-soft p-3 text-[12.5px] text-danger"
        >
          {{ syncAsync.errorText.value }}
          <button class="ml-2 underline" @click="syncAsync.run()">Retry</button>
        </div>
        <DashboardPanel
          v-else
          :rows="syncAsync.data.value?.rows ?? []"
          :loading="syncAsync.loading.value"
        />
      </Panel>

      <!-- Error rate per sequence -->
      <Panel
        title="Error Rate per Sequence"
        subtitle="Per-sequence mobile error rate — triggers auto-rollback when threshold exceeded"
      >
        <div
          v-if="errorRateAsync.error.value"
          class="rounded-md border border-danger/30 bg-danger-soft p-3 text-[12.5px] text-danger"
        >
          {{ errorRateAsync.errorText.value }}
          <button class="ml-2 underline" @click="errorRateAsync.run()">Retry</button>
        </div>
        <DashboardPanel
          v-else
          :rows="errorRateAsync.data.value?.rows ?? []"
          :loading="errorRateAsync.loading.value"
        />
      </Panel>

      <!-- Top failing steps -->
      <Panel
        title="Top Failing Steps"
        subtitle="Step labels with the highest error count in the window"
      >
        <div
          v-if="failingStepsAsync.error.value"
          class="rounded-md border border-danger/30 bg-danger-soft p-3 text-[12.5px] text-danger"
        >
          {{ failingStepsAsync.errorText.value }}
          <button class="ml-2 underline" @click="failingStepsAsync.run()">Retry</button>
        </div>
        <DashboardPanel
          v-else
          :rows="failingStepsAsync.data.value?.rows ?? []"
          :loading="failingStepsAsync.loading.value"
        />
      </Panel>

      <!-- Device OS breakdown -->
      <Panel
        title="Device OS Breakdown"
        subtitle="Distribution of OS name and version across reporting devices"
      >
        <div
          v-if="osBreakdownAsync.error.value"
          class="rounded-md border border-danger/30 bg-danger-soft p-3 text-[12.5px] text-danger"
        >
          {{ osBreakdownAsync.errorText.value }}
          <button class="ml-2 underline" @click="osBreakdownAsync.run()">Retry</button>
        </div>
        <DashboardPanel
          v-else
          :rows="osBreakdownAsync.data.value?.rows ?? []"
          :loading="osBreakdownAsync.loading.value"
        />
      </Panel>
    </div>
  </div>
</template>
