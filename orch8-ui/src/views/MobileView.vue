<script setup lang="ts">
/**
 * Mobile Sync operator console.
 *
 * Tabs:
 *  - Status     — GET /mobile/status   (live instance status reported by devices)
 *  - Devices    — GET /mobile/devices  + RegisterDeviceModal
 *  - Approvals  — GET /mobile/approvals + ResolveApprovalModal
 *  - Commands   — SendCommandModal (POST /mobile/commands trigger)
 *
 * Conditional surface: ORCH8_MOBILE_SYNC_ENABLED must be true on the server.
 * When disabled, all routes return 404. Any 404 from these endpoints is caught
 * and rendered as an EmptyState ("Mobile sync is disabled on this server").
 *
 * DESIGN_REFERENCE §Mobile Sync (mobile-sync.md)
 */
import { ref, computed, onMounted } from 'vue'
import {
  Smartphone,
  TabletSmartphone,
  BellRing,
  Terminal,
  RefreshCw,
  Plus,
  CheckCircle2,
  Clock,
  WifiOff,
} from 'lucide-vue-next'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { getMobileStatus, listDevices, listMobileApprovals } from '@/api/mobile'
import { isApiError } from '@/api/errors'
import { parsePgTimestamp } from '@/api/types/mobile'
import { formatRelative, formatDateTime } from '@/lib/format'
import type { MobileDevice, MobileApprovalRequest, MobileInstanceStatus } from '@/api/types/mobile'
import type { Column } from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Tabs from '@/components/ui/Tabs.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import RegisterDeviceModal from '@/components/mobile/RegisterDeviceModal.vue'
import SendCommandModal from '@/components/mobile/SendCommandModal.vue'
import ResolveApprovalModal from '@/components/mobile/ResolveApprovalModal.vue'

// --- disabled state -----------------------------------------------------------
// Any 404 from the mobile endpoints indicates ORCH8_MOBILE_SYNC_ENABLED is off.
// We track this globally so all tabs show the same EmptyState.
const mobileDisabled = ref(false)

// --- tab state ----------------------------------------------------------------
const activeTab = ref('status')
const tabItems = [
  { key: 'status', label: 'Status' },
  { key: 'devices', label: 'Devices' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'commands', label: 'Commands' },
]

// --- status tab (GET /mobile/status) -----------------------------------------
const statusList = useAsync((signal) => getMobileStatus({}, signal))
const { data: statuses, loading: statusLoading, error: statusError, errorText: statusErrorText } = statusList

const statusPolling = usePolling(statusList.run, { intervalMs: 10000, immediate: false })

// --- devices tab (GET /mobile/devices) ----------------------------------------
const devicesList = useAsync((signal) => listDevices({}, signal))
const { data: devices, loading: devicesLoading, error: devicesError, errorText: devicesErrorText } = devicesList

const devicesPolling = usePolling(devicesList.run, { intervalMs: 15000, immediate: false })

// --- approvals tab (GET /mobile/approvals) ------------------------------------
const approvalStateFilter = ref<'pending' | 'resolved' | 'expired' | ''>('pending')
const approvalsList = useAsync((signal) =>
  listMobileApprovals({ state: approvalStateFilter.value || undefined }, signal),
)
const { data: approvals, loading: approvalsLoading, error: approvalsError, errorText: approvalsErrorText } = approvalsList

const approvalsPolling = usePolling(approvalsList.run, { intervalMs: 10000, immediate: false })

// --- modal state --------------------------------------------------------------
const showRegisterModal = ref(false)
const showCommandModal = ref(false)
const commandPresetDeviceId = ref<string | null>(null)

const showResolveModal = ref(false)
const selectedApproval = ref<MobileApprovalRequest | null>(null)

function openSendCommand(deviceId?: string) {
  commandPresetDeviceId.value = deviceId ?? null
  showCommandModal.value = true
}

function openResolve(approval: MobileApprovalRequest) {
  selectedApproval.value = approval
  showResolveModal.value = true
}

// --- refresh all --------------------------------------------------------------
function refreshAll() {
  void statusList.run()
  void devicesList.run()
  void approvalsList.run()
}

// --- initial load -------------------------------------------------------------
onMounted(async () => {
  // Load all three lists. If any returns 404, show disabled state.
  const results = await Promise.allSettled([
    statusList.run(),
    devicesList.run(),
    approvalsList.run(),
  ])
  for (const r of results) {
    if (r.status === 'rejected' && isApiError(r.reason) && (r.reason as { status: number }).status === 404) {
      mobileDisabled.value = true
      break
    }
  }
  if (!mobileDisabled.value) {
    statusPolling.start()
    devicesPolling.start()
    approvalsPolling.start()
  }
})

// --- table columns ------------------------------------------------------------
const statusColumns: Column[] = [
  { key: 'device_id', header: 'Device', mono: true },
  { key: 'instance_id', header: 'Instance', mono: true },
  { key: 'sequence_name', header: 'Sequence' },
  { key: 'state', header: 'State', width: '110px' },
  { key: 'current_step', header: 'Current Step', mono: true },
  { key: 'handler', header: 'Handler', width: '130px', mono: true },
  { key: 'updated_at', header: 'Last Update', width: '140px' },
]

const deviceColumns: Column[] = [
  { key: 'device_id', header: 'Device ID', mono: true },
  { key: 'platform', header: 'Platform', width: '110px' },
  { key: 'app_version', header: 'Version', width: '100px', mono: true },
  { key: 'active', header: 'Active', width: '90px' },
  { key: 'push_token', header: 'Push', width: '70px' },
  { key: 'last_sync_at', header: 'Last Sync', width: '140px' },
  { key: 'registered_at', header: 'Registered', width: '140px' },
  { key: '_actions', header: '', width: '70px', align: 'right' },
]

const approvalColumns: Column[] = [
  { key: 'id', header: 'ID', mono: true },
  { key: 'device_id', header: 'Device', mono: true },
  { key: 'instance_id', header: 'Instance', mono: true },
  { key: 'sequence_name', header: 'Sequence' },
  { key: 'prompt', header: 'Prompt' },
  { key: 'state', header: 'State', width: '100px' },
  { key: 'created_at', header: 'Created', width: '140px' },
  { key: '_actions', header: '', width: '80px', align: 'right' },
]

// --- helpers ------------------------------------------------------------------
function stateTone(state: string): 'info' | 'success' | 'danger' | 'warning' | 'neutral' {
  switch (state) {
    case 'running': return 'info'
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'waiting': case 'pending': return 'warning'
    default: return 'neutral'
  }
}

function approvalTone(state: string): 'warning' | 'success' | 'neutral' {
  switch (state) {
    case 'pending': return 'warning'
    case 'resolved': return 'success'
    default: return 'neutral'
  }
}

function platformLabel(platform: string): string {
  if (platform === 'ios') return 'iOS'
  if (platform === 'android') return 'Android'
  return platform
}

function formatPgTs(val: string | null): string {
  const d = parsePgTimestamp(val)
  if (!d) return '—'
  return formatRelative(d)
}

function formatPgTsFull(val: string | null): string {
  const d = parsePgTimestamp(val)
  if (!d) return '—'
  return formatDateTime(d)
}

// Reload approvals when filter changes
function onApprovalFilterChange() {
  void approvalsList.run()
}

// After resolving an approval, reload the list
function onApprovalResolved() {
  void approvalsList.run()
}

// Computed: is any error a disabled-feature 404?
const isStatusDisabled = computed(() => isApiError(statusError.value) && statusError.value.status === 404)
const isDevicesDisabled = computed(() => isApiError(devicesError.value) && devicesError.value.status === 404)
const isApprovalsDisabled = computed(() => isApiError(approvalsError.value) && approvalsError.value.status === 404)

// Show the approve filter only when on the approvals tab
const approvalFilterOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'expired', label: 'Expired' },
  { value: '', label: 'All' },
]
</script>

<template>
  <div>
    <PageHeader
      title="Mobile Sync"
      description="Monitor device connections, approve mobile workflow requests, and send commands to devices."
      :icon="TabletSmartphone"
    >
      <template #actions>
        <IconButton label="Refresh all" @click="refreshAll">
          <RefreshCw
            :size="16"
            :class="(statusLoading || devicesLoading || approvalsLoading) && 'animate-spin'"
          />
        </IconButton>
        <Button
          v-show="activeTab === 'devices'"
          variant="primary"
          :disabled="mobileDisabled"
          @click="showRegisterModal = true"
        >
          <template #icon><Plus :size="15" /></template>
          Register device
        </Button>
        <Button
          v-show="activeTab === 'commands'"
          variant="primary"
          :disabled="mobileDisabled"
          @click="openSendCommand()"
        >
          <template #icon><Terminal :size="15" /></template>
          Send command
        </Button>
      </template>
    </PageHeader>

    <!-- Global disabled state — shown when ORCH8_MOBILE_SYNC_ENABLED is off -->
    <EmptyState
      v-if="mobileDisabled"
      title="Mobile sync is disabled on this server"
      description="Set ORCH8_MOBILE_SYNC_ENABLED=true on the server process and restart to enable the mobile sync surface."
      :icon="WifiOff"
    />

    <template v-else>
      <!-- Tab navigation -->
      <Tabs :tabs="tabItems" v-model="activeTab" class="mb-5" />

      <!-- ========== STATUS TAB ========== -->
      <div v-show="activeTab === 'status'">
        <!-- Per-tab disabled fallback (404 after initial load) -->
        <EmptyState
          v-if="isStatusDisabled"
          title="Mobile sync is disabled on this server"
          description="Set ORCH8_MOBILE_SYNC_ENABLED=true on the server process and restart."
          :icon="WifiOff"
        />

        <template v-else>
          <div
            v-if="statusError && !isStatusDisabled"
            class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
          >
            {{ statusErrorText }}
            <button class="ml-2 underline" @click="statusList.run()">Retry</button>
          </div>

          <DataTable
            :columns="statusColumns"
            :rows="statuses?.items ?? []"
            :row-key="(r: MobileInstanceStatus) => `${r.device_id}::${r.instance_id}`"
            :loading="statusLoading"
            empty-title="No instance statuses"
            empty-description="Device status updates appear here after devices begin syncing. Each row reflects the most-recent heartbeat for a device–instance pair."
          >
            <template #cell-device_id="{ row }">
              <span class="mono text-[12px] font-medium text-text">{{ row.device_id }}</span>
            </template>

            <template #cell-instance_id="{ row }">
              <span class="mono text-[12px] text-subtle">{{ row.instance_id }}</span>
            </template>

            <template #cell-sequence_name="{ row }">
              <span class="text-[12px] text-text">{{ row.sequence_name ?? '—' }}</span>
            </template>

            <template #cell-state="{ row }">
              <Badge :tone="stateTone(row.state)">
                <StatusDot :pulse="row.state === 'running'" :tone="stateTone(row.state)" />
                {{ row.state }}
              </Badge>
            </template>

            <template #cell-current_step="{ row }">
              <span class="mono text-[12px] text-subtle">{{ row.current_step ?? '—' }}</span>
            </template>

            <template #cell-handler="{ row }">
              <span class="mono text-[12px] text-subtle">{{ row.handler ?? '—' }}</span>
            </template>

            <template #cell-updated_at="{ row }">
              <Tooltip :text="formatPgTsFull(row.updated_at)">
                <span class="text-[12px] text-subtle">{{ formatPgTs(row.updated_at) }}</span>
              </Tooltip>
            </template>
          </DataTable>
        </template>
      </div>

      <!-- ========== DEVICES TAB ========== -->
      <div v-show="activeTab === 'devices'">
        <EmptyState
          v-if="isDevicesDisabled"
          title="Mobile sync is disabled on this server"
          description="Set ORCH8_MOBILE_SYNC_ENABLED=true on the server process and restart."
          :icon="WifiOff"
        />

        <template v-else>
          <div
            v-if="devicesError && !isDevicesDisabled"
            class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
          >
            {{ devicesErrorText }}
            <button class="ml-2 underline" @click="devicesList.run()">Retry</button>
          </div>

          <DataTable
            :columns="deviceColumns"
            :rows="devices?.items ?? []"
            :row-key="(r: MobileDevice) => r.device_id"
            :loading="devicesLoading"
            empty-title="No registered devices"
            empty-description="Devices appear here after calling POST /mobile/devices/register. Use the Register device button to add one from the console."
          >
            <template #cell-device_id="{ row }">
              <span class="mono text-[12px] font-medium text-text">{{ row.device_id }}</span>
            </template>

            <template #cell-platform="{ row }">
              <div class="flex items-center gap-1.5">
                <Smartphone :size="13" class="shrink-0 text-subtle" />
                <span class="text-[12px] text-text">{{ platformLabel(row.platform) }}</span>
              </div>
            </template>

            <template #cell-app_version="{ row }">
              <span class="mono text-[12px] text-subtle">{{ row.app_version ?? '—' }}</span>
            </template>

            <template #cell-active="{ row }">
              <Badge :tone="row.active ? 'success' : 'neutral'">
                {{ row.active ? 'Active' : 'Stale' }}
              </Badge>
            </template>

            <template #cell-push_token="{ row }">
              <Tooltip :text="row.push_token ?? 'No push token — polling only'">
                <Badge :tone="row.push_token ? 'info' : 'neutral'" class="cursor-default">
                  <BellRing :size="10" />
                  {{ row.push_token ? 'Yes' : 'No' }}
                </Badge>
              </Tooltip>
            </template>

            <template #cell-last_sync_at="{ row }">
              <Tooltip :text="formatPgTsFull(row.last_sync_at)">
                <span class="text-[12px] text-subtle">{{ row.last_sync_at ? formatPgTs(row.last_sync_at) : 'Never' }}</span>
              </Tooltip>
            </template>

            <template #cell-registered_at="{ row }">
              <Tooltip :text="formatPgTsFull(row.registered_at)">
                <span class="text-[12px] text-subtle">{{ formatPgTs(row.registered_at) }}</span>
              </Tooltip>
            </template>

            <template #cell-_actions="{ row }">
              <div class="flex items-center justify-end gap-1">
                <Tooltip text="Send command to this device">
                  <IconButton label="Send command" size="sm" @click.stop="openSendCommand(row.device_id)">
                    <Terminal :size="13" />
                  </IconButton>
                </Tooltip>
              </div>
            </template>
          </DataTable>
        </template>
      </div>

      <!-- ========== APPROVALS TAB ========== -->
      <div v-show="activeTab === 'approvals'">
        <EmptyState
          v-if="isApprovalsDisabled"
          title="Mobile sync is disabled on this server"
          description="Set ORCH8_MOBILE_SYNC_ENABLED=true on the server process and restart."
          :icon="WifiOff"
        />

        <template v-else>
          <!-- State filter -->
          <div class="mb-4 flex items-center gap-2">
            <span class="text-[12px] text-subtle">Show:</span>
            <div class="flex gap-1">
              <button
                v-for="opt in approvalFilterOptions"
                :key="opt.value"
                class="rounded-md px-3 py-1 text-[12px] font-medium transition-colors"
                :class="
                  approvalStateFilter === opt.value
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-subtle hover:bg-hover'
                "
                @click="approvalStateFilter = opt.value as typeof approvalStateFilter; onApprovalFilterChange()"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div
            v-if="approvalsError && !isApprovalsDisabled"
            class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
          >
            {{ approvalsErrorText }}
            <button class="ml-2 underline" @click="approvalsList.run()">Retry</button>
          </div>

          <DataTable
            :columns="approvalColumns"
            :rows="approvals?.items ?? []"
            :row-key="(r: MobileApprovalRequest) => r.id"
            :loading="approvalsLoading"
            empty-title="No approval requests"
            empty-description="Approval requests appear here when a device reaches a wait_for_input step and sends an approval_request via POST /mobile/sync."
          >
            <template #cell-id="{ row }">
              <span class="mono text-[11.5px] text-subtle">{{ row.id }}</span>
            </template>

            <template #cell-device_id="{ row }">
              <span class="mono text-[12px] font-medium text-text">{{ row.device_id }}</span>
            </template>

            <template #cell-instance_id="{ row }">
              <span class="mono text-[12px] text-subtle">{{ row.instance_id }}</span>
            </template>

            <template #cell-sequence_name="{ row }">
              <span class="text-[12px] text-text">{{ row.sequence_name ?? '—' }}</span>
            </template>

            <template #cell-prompt="{ row }">
              <span class="text-[12px] text-text line-clamp-2">{{ row.prompt ?? '—' }}</span>
            </template>

            <template #cell-state="{ row }">
              <Badge :tone="approvalTone(row.state)">
                <Clock v-if="row.state === 'pending'" :size="10" />
                <CheckCircle2 v-else-if="row.state === 'resolved'" :size="10" />
                {{ row.state }}
              </Badge>
            </template>

            <template #cell-created_at="{ row }">
              <Tooltip :text="formatPgTsFull(row.created_at)">
                <span class="text-[12px] text-subtle">{{ formatPgTs(row.created_at) }}</span>
              </Tooltip>
            </template>

            <template #cell-_actions="{ row }">
              <div class="flex items-center justify-end gap-1">
                <Button
                  v-if="row.state === 'pending'"
                  size="sm"
                  variant="primary"
                  @click.stop="openResolve(row)"
                >
                  <template #icon><CheckCircle2 :size="12" /></template>
                  Resolve
                </Button>
                <span v-else class="text-[12px] text-subtle">—</span>
              </div>
            </template>
          </DataTable>
        </template>
      </div>

      <!-- ========== COMMANDS TAB ========== -->
      <div v-show="activeTab === 'commands'">
        <EmptyState
          title="Send a command to any device"
          description="Use the Send command button to enqueue a command in a device's inbox. Commands are delivered on the next sync poll or via silent push notification. Choose from built-in types (pause, resume, cancel) or send a custom command payload."
          :icon="Terminal"
        >
          <template #action>
            <Button variant="primary" @click="openSendCommand()">
              <template #icon><Terminal :size="15" /></template>
              Send command
            </Button>
          </template>
        </EmptyState>
      </div>
    </template>

    <!-- ========== MODALS ========== -->
    <RegisterDeviceModal
      v-model:open="showRegisterModal"
      @registered="devicesList.run()"
    />

    <SendCommandModal
      v-model:open="showCommandModal"
      :preset-device-id="commandPresetDeviceId"
      @sent="() => {}"
    />

    <ResolveApprovalModal
      v-model:open="showResolveModal"
      :approval="selectedApproval"
      @resolved="onApprovalResolved"
    />
  </div>
</template>
