<script setup lang="ts">
/**
 * Credentials list view.
 * Features: list credentials (metadata ONLY — secrets never displayed),
 * create/update via CredentialFormModal, delete (confirm).
 * DESIGN_REFERENCE §Credentials (resources.md)
 *
 * SECURITY: This view never renders secret material. CredentialResponse has no
 * value or refresh_token field — the server compile-time guarantee is reflected here.
 */
import { ref, computed, onMounted } from 'vue'
import { KeyRound, Plus, Trash2, RefreshCw, Pencil } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useAsync } from '@/composables/useAsync'
import { listCredentials, deleteCredential } from '@/api/credentials'
import { errorMessage } from '@/api/errors'
import { formatRelative, formatDateTime } from '@/lib/format'
import type { CredentialResponse, CredentialKind } from '@/api/types/credentials'
import type { Column } from '@/components/ui/DataTable.vue'
import type { BadgeTone } from '@/components/ui/Badge.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import Badge from '@/components/ui/Badge.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import CredentialFormModal from '@/components/resources/CredentialFormModal.vue'

const ui = useUiStore()
const conn = useConnectionStore()

const search = ref('')
const showModal = ref(false)
const editingCred = ref<CredentialResponse | null>(null)

const credList = useAsync((signal) =>
  listCredentials({ tenant_id: conn.tenantId || undefined, limit: 200 }, signal),
)
const { data: credentials, loading, error, errorText } = credList

onMounted(() => void credList.run())

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (credentials.value ?? []).filter(
    (c) => !q || c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
  )
})

function openCreate() {
  editingCred.value = null
  showModal.value = true
}

function openEdit(cred: CredentialResponse) {
  editingCred.value = cred
  showModal.value = true
}

async function handleDelete(cred: CredentialResponse) {
  const ok = await ui.confirm({
    title: `Delete credential "${cred.name}"?`,
    message: `Deleting this credential will permanently remove it. Any workflow step referencing credentials://${cred.id} will fail at dispatch time.`,
    tone: 'danger',
    confirmText: 'Delete credential',
  })
  if (!ok) return
  try {
    await deleteCredential(cred.id)
    ui.success('Credential deleted', cred.name)
    void credList.run()
  } catch (e) {
    ui.error('Delete failed', errorMessage(e))
  }
}

const kindTone: Record<CredentialKind, BadgeTone> = {
  api_key: 'accent',
  oauth2: 'purple',
  basic: 'cyan',
}

const kindLabel: Record<CredentialKind, string> = {
  api_key: 'API Key',
  oauth2: 'OAuth2',
  basic: 'Basic Auth',
}

const columns: Column[] = [
  { key: 'id', header: 'ID', mono: true, width: '200px' },
  { key: 'name', header: 'Name' },
  { key: 'kind', header: 'Kind', width: '110px' },
  { key: 'enabled', header: 'Status', width: '90px' },
  { key: 'expires_at', header: 'Expires', width: '140px' },
  { key: 'updated_at', header: 'Updated', width: '140px' },
  { key: '_actions', header: '', width: '90px', align: 'right' },
]
</script>

<template>
  <div>
    <PageHeader
      title="Credentials"
      description="Manage write-only secrets. Secret material is stored server-side and never returned."
      :icon="KeyRound"
    >
      <template #actions>
        <IconButton label="Refresh credentials" @click="credList.run()">
          <RefreshCw :size="16" :class="loading && 'animate-spin'" />
        </IconButton>
        <Button variant="primary" @click="openCreate">
          <template #icon><Plus :size="15" /></template>
          New credential
        </Button>
      </template>
    </PageHeader>

    <!-- Write-only security notice -->
    <div
      class="mb-4 flex items-start gap-2 rounded-md border border-info/30 bg-info-soft px-3 py-2 text-[12px] text-info"
      role="note"
    >
      <KeyRound :size="13" class="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        Secrets are <strong>write-only</strong>. The server never returns stored credential values.
        References in workflows use the URI scheme <code class="mono">credentials://&lt;id&gt;</code>.
      </span>
    </div>

    <div class="mb-4 flex items-center gap-3">
      <SearchInput v-model="search" placeholder="Search by ID or name…" class="max-w-sm" />
      <span v-if="credentials" class="text-[13px] text-subtle">
        {{ filtered.length }} / {{ credentials.length }}
      </span>
    </div>

    <div
      v-if="error"
      class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
    >
      {{ errorText }}
      <button class="ml-2 underline" @click="credList.run()">Retry</button>
    </div>

    <DataTable
      :columns="columns"
      :rows="filtered"
      :row-key="(r) => r.id"
      :loading="loading"
      empty-title="No credentials"
      empty-description="Add a credential to let workflow steps securely access external services via credentials://&lt;id&gt;."
    >
      <template #cell-id="{ row }">
        <span class="mono text-[12px] text-text">{{ row.id }}</span>
      </template>

      <template #cell-name="{ row }">
        <span class="font-medium text-text">{{ row.name }}</span>
        <span v-if="row.description" class="ml-2 text-[12px] text-subtle">{{ row.description }}</span>
      </template>

      <template #cell-kind="{ row }">
        <Badge :tone="kindTone[row.kind] ?? 'neutral'">{{ kindLabel[row.kind] ?? row.kind }}</Badge>
      </template>

      <template #cell-enabled="{ row }">
        <span class="flex items-center gap-1.5">
          <StatusDot :tone="row.enabled ? 'success' : 'neutral'" />
          <span class="text-[12.5px]">{{ row.enabled ? 'Active' : 'Disabled' }}</span>
        </span>
      </template>

      <template #cell-expires_at="{ row }">
        <span v-if="row.expires_at">
          <Tooltip :text="formatDateTime(row.expires_at)">
            <span class="text-[12px] text-subtle">{{ formatRelative(row.expires_at) }}</span>
          </Tooltip>
        </span>
        <span v-else class="text-[12px] text-subtle">Never</span>
      </template>

      <template #cell-updated_at="{ row }">
        <Tooltip :text="formatDateTime(row.updated_at)">
          <span class="text-[12px] text-subtle">{{ formatRelative(row.updated_at) }}</span>
        </Tooltip>
      </template>

      <template #cell-_actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <IconButton label="Edit credential" size="sm" @click.stop="openEdit(row)">
            <Pencil :size="13" />
          </IconButton>
          <IconButton label="Delete credential" size="sm" variant="danger" @click.stop="handleDelete(row)">
            <Trash2 :size="13" />
          </IconButton>
        </div>
      </template>
    </DataTable>

    <CredentialFormModal
      v-model:open="showModal"
      :credential="editingCred"
      @saved="credList.run()"
    />
  </div>
</template>
