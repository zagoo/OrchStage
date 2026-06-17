<script setup lang="ts">
/**
 * Webhook Outbox operator console.
 *
 * Features:
 *  - Live list of parked webhook deliveries (status, attempts, target URL, last error)
 *  - Redeliver action (confirm) — removes row on success
 *  - Discard action (confirm danger) — permanently deletes row
 *  - 5-second polling for live updates
 *
 * DESIGN_REFERENCE §Webhook Outbox — ops-resilience.md §5
 */
import { onMounted } from 'vue'
import { Webhook, RefreshCw, RotateCcw, Trash2 } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { listWebhookOutbox, redeliverOutbox, discardOutbox } from '@/api/webhooks'
import { errorMessage } from '@/api/errors'
import { formatDateTime, formatRelative, shortId } from '@/lib/format'
import type { WebhookOutboxEntry } from '@/api/types/ops'
import type { Column } from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Badge from '@/components/ui/Badge.vue'
import Tooltip from '@/components/ui/Tooltip.vue'

const ui = useUiStore()

const list = useAsync((signal) => listWebhookOutbox({ limit: 100 }, signal))
const { data: entries, loading, error, errorText } = list

const polling = usePolling(list.run, { intervalMs: 5000, immediate: false })

onMounted(() => {
  void list.run()
  polling.start()
})

const columns: Column[] = [
  { key: 'id', header: 'ID', width: '130px', mono: true },
  { key: 'event_type', header: 'Event', width: '180px' },
  { key: 'url', header: 'Target URL' },
  { key: 'attempts', header: 'Attempts', width: '90px', align: 'right' },
  { key: 'last_error', header: 'Last Error', width: '220px' },
  { key: 'created_at', header: 'Parked', width: '140px' },
  { key: '_actions', header: '', width: '100px', align: 'right' },
]

async function handleRedeliver(entry: WebhookOutboxEntry) {
  const ok = await ui.confirm({
    title: `Redeliver to "${entry.url}"?`,
    message: 'This will attempt to POST the payload immediately. On success the entry is removed. On failure it is kept for retry.',
    tone: 'danger',
    confirmText: 'Redeliver',
  })
  if (!ok) return
  try {
    const res = await redeliverOutbox(entry.id)
    if (res.redelivered) {
      ui.success('Redelivered', entry.event_type)
      void list.run()
    } else {
      ui.error('Redeliver failed', 'Delivery attempt did not succeed; entry is still parked.')
    }
  } catch (e) {
    ui.error('Redeliver failed', errorMessage(e))
  }
}

async function handleDiscard(entry: WebhookOutboxEntry) {
  const ok = await ui.confirm({
    title: `Discard "${entry.event_type}"?`,
    message: 'This permanently deletes the parked delivery. No retry will be attempted. This cannot be undone.',
    tone: 'danger',
    confirmText: 'Discard permanently',
  })
  if (!ok) return
  try {
    await discardOutbox(entry.id)
    ui.success('Discarded', entry.event_type)
    void list.run()
  } catch (e) {
    ui.error('Discard failed', errorMessage(e))
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Webhook Outbox"
      description="Failed outbound webhook deliveries parked for manual redeliver or discard."
      :icon="Webhook"
    >
      <template #actions>
        <IconButton label="Refresh outbox" @click="list.run()">
          <RefreshCw :size="16" :class="loading && 'animate-spin'" />
        </IconButton>
      </template>
    </PageHeader>

    <div
      v-if="error"
      class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
    >
      {{ errorText }}
      <button class="ml-2 underline" @click="list.run()">Retry</button>
    </div>

    <DataTable
      :columns="columns"
      :rows="entries ?? []"
      :row-key="(r) => r.id"
      :loading="loading"
      empty-title="Outbox is empty"
      empty-description="No failed webhook deliveries. All outbound webhooks have been delivered successfully or exhausted retries haven't parked anything yet."
    >
      <template #cell-id="{ row }">
        <Tooltip :text="row.id">
          <span class="mono text-[11px] text-subtle">{{ shortId(row.id) }}</span>
        </Tooltip>
      </template>

      <template #cell-event_type="{ row }">
        <Badge tone="purple">{{ row.event_type }}</Badge>
      </template>

      <template #cell-url="{ row }">
        <Tooltip :text="row.url">
          <span class="mono max-w-[300px] truncate text-[11px] text-text">{{ row.url }}</span>
        </Tooltip>
      </template>

      <template #cell-attempts="{ row }">
        <span :class="row.attempts > 3 ? 'font-semibold text-danger' : 'text-text'">
          {{ row.attempts }}
        </span>
      </template>

      <template #cell-last_error="{ row }">
        <span v-if="row.last_error" class="max-w-[200px] truncate text-[11px] text-danger">
          {{ row.last_error }}
        </span>
        <span v-else class="text-subtle">—</span>
      </template>

      <template #cell-created_at="{ row }">
        <Tooltip :text="formatDateTime(row.created_at)">
          <span class="text-[12px] text-subtle">{{ formatRelative(row.created_at) }}</span>
        </Tooltip>
      </template>

      <template #cell-_actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <Tooltip text="Redeliver now">
            <IconButton
              label="Redeliver webhook"
              size="sm"
              @click.stop="handleRedeliver(row)"
            >
              <RotateCcw :size="13" />
            </IconButton>
          </Tooltip>
          <Tooltip text="Discard permanently">
            <IconButton
              label="Discard webhook entry"
              size="sm"
              variant="danger"
              @click.stop="handleDiscard(row)"
            >
              <Trash2 :size="13" />
            </IconButton>
          </Tooltip>
        </div>
      </template>
    </DataTable>
  </div>
</template>
