<script setup lang="ts">
/**
 * API Keys management view.
 *
 * Lists API key metadata (never the secret), supports creating new keys via
 * CreateApiKeyModal (shows secret once), and revoking/deleting keys with a
 * danger confirmation.
 *
 * Admin-only: the server enforces 403 for per-tenant callers. We surface a
 * best-effort notice when the connection looks non-admin, but still allow
 * attempts (server enforces authoritatively).
 *
 * DESIGN_REFERENCE §API-key management endpoints (auth-rbac.md §8)
 */
import { ref, computed, onMounted } from 'vue'
import { KeySquare, Plus, Trash2, RefreshCw, ShieldAlert } from 'lucide-vue-next'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { useAsync } from '@/composables/useAsync'
import { listApiKeys, revokeApiKey } from '@/api/apiKeys'
import { errorMessage } from '@/api/errors'
import { formatRelative, formatDateTime, shortId } from '@/lib/format'
import type { ApiKeyInfo } from '@/api/types/apiKeys'
import type { Column } from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'

import CreateApiKeyModal from '@/components/system/CreateApiKeyModal.vue'

const conn = useConnectionStore()
const ui = useUiStore()

const showCreate = ref(false)

// Best-effort: if there's no tenant-id in connection and a key is set, it
// might be a root key. If a tenantId is set without a root key, flag it.
// Server enforces; this is only a hint.
const likelyNonAdmin = computed(
  () => conn.configured && !conn.insecure && conn.hasTenant && conn.apiKey.trim().startsWith('sk_'),
)

// The engine's GET /api-keys lists exactly ONE tenant — the required tenant_id
// query param — with no all-tenants mode, even for the root key (the root key
// AUTHORIZES the call; it does not widen its SCOPE). So the list is keyed by an
// editable tenant filter, seeded from the connection tenant but decoupled from
// it: a root operator can view tenant B/C/D's keys here without changing their
// global connection tenant in Settings.
const tenantFilter = ref(conn.tenantId.trim() || 'default')

const list = useAsync((signal) =>
  listApiKeys({ tenant_id: tenantFilter.value.trim() || 'default' }, signal),
)
const { data: keys, loading, error, errorText } = list

function loadKeys() {
  if (!tenantFilter.value.trim()) tenantFilter.value = 'default'
  void list.run()
}

onMounted(() => {
  void list.run()
})

const columns: Column[] = [
  { key: 'id', header: 'ID', width: '180px', mono: true },
  { key: 'name', header: 'Name' },
  { key: 'tenant_id', header: 'Tenant', width: '120px', mono: true },
  { key: 'status', header: 'Status', width: '90px' },
  { key: 'last_used_at', header: 'Last used', width: '150px' },
  { key: 'expires_at', header: 'Expires', width: '150px' },
  { key: 'created_at', header: 'Created', width: '150px' },
  { key: '_actions', header: '', width: '60px', align: 'right' },
]

async function handleRevoke(key: ApiKeyInfo) {
  const ok = await ui.confirm({
    title: `Revoke key "${key.name || key.id}"?`,
    message:
      'This permanently revokes the API key. Any services using it will receive 401 Unauthorized immediately. This cannot be undone.',
    tone: 'danger',
    confirmText: 'Revoke key',
  })
  if (!ok) return
  try {
    await revokeApiKey(key.id)
    ui.success('API key revoked', key.name || key.id)
    void list.run()
  } catch (e) {
    ui.error('Revoke failed', errorMessage(e))
  }
}

// A new key belongs to whatever tenant was entered in the modal, which may
// differ from the one currently listed. Switch the filter to it so the key is
// visible immediately (the "I created it for B but don't see it" report).
function onCreated(tenantId: string) {
  const t = tenantId.trim()
  if (t) tenantFilter.value = t
  void list.run()
}
</script>

<template>
  <div>
    <PageHeader
      title="API Keys"
      description="Manage per-tenant API keys. Key management requires the root / admin key."
      :icon="KeySquare"
    >
      <template #actions>
        <IconButton label="Refresh keys" @click="list.run()">
          <RefreshCw :size="16" :class="loading && 'animate-spin'" />
        </IconButton>
        <Button variant="primary" @click="showCreate = true">
          <template #icon><Plus :size="15" /></template>
          New key
        </Button>
      </template>
    </PageHeader>

    <!-- RBAC notice: best-effort hint, server enforces authoritatively -->
    <div
      v-if="likelyNonAdmin"
      class="mb-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3.5 text-[13px] text-warning"
    >
      <ShieldAlert :size="16" class="mt-0.5 shrink-0" />
      <span>
        API key management requires the <strong>root / admin key</strong>. Your current connection
        appears to use a per-tenant key (<code class="mono text-[12px]">sk_…</code>). Requests may
        return <code class="mono">403 Forbidden</code> — the server enforces this authoritatively.
      </span>
    </div>

    <!-- 401/403 error with targeted guidance -->
    <div
      v-if="error && (error.status === 401 || error.status === 403)"
      class="mb-4 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
    >
      <ShieldAlert :size="16" class="mt-0.5 shrink-0" />
      <div>
        <strong>{{ error.status === 401 ? 'Unauthorized' : 'Forbidden' }}:</strong>
        {{ errorText }} — API key management requires the root / admin key. Update your connection
        credentials in Settings.
      </div>
    </div>

    <!-- Generic error (non-auth) -->
    <div
      v-else-if="error"
      class="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger"
    >
      {{ errorText }}
      <button class="ml-2 underline" @click="list.run()">Retry</button>
    </div>

    <!-- Tenant scope: the engine lists keys one tenant at a time (the root key can
         pick any). Decoupled from the global connection tenant so an admin can view
         B/C/D here without re-pointing their whole session. -->
    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div class="flex flex-col gap-1">
        <label for="apikeys-tenant" class="text-[12px] font-medium text-subtle">Tenant</label>
        <Input
          id="apikeys-tenant"
          v-model="tenantFilter"
          mono
          placeholder="acme"
          class="w-56"
          @keyup.enter="loadKeys"
        />
      </div>
      <Button variant="secondary" :loading="loading" @click="loadKeys">List keys</Button>
      <p class="max-w-md flex-1 text-[12px] leading-snug text-faint">
        The server returns keys for one tenant at a time — with the root key you can view any tenant.
        Change this to see another tenant's keys; creating a key for a new tenant switches here automatically.
      </p>
    </div>

    <DataTable
      :columns="columns"
      :rows="keys ?? []"
      :row-key="(r) => r.id"
      :loading="loading"
      empty-title="No API keys"
      empty-description="Create a per-tenant API key to allow services to authenticate with Orch8."
    >
      <template #cell-id="{ row }">
        <span class="mono text-[12px] text-text" :title="row.id">{{ shortId(row.id) }}</span>
      </template>

      <template #cell-name="{ row }">
        <span v-if="row.name" class="text-text">{{ row.name }}</span>
        <span v-else class="text-faint">—</span>
      </template>

      <template #cell-status="{ row }">
        <Badge :tone="row.revoked ? 'danger' : 'success'">
          {{ row.revoked ? 'Revoked' : 'Active' }}
        </Badge>
      </template>

      <template #cell-last_used_at="{ row }">
        <span
          :title="row.last_used_at ? formatDateTime(row.last_used_at) : 'Never used'"
          class="text-subtle"
        >
          {{ row.last_used_at ? formatRelative(row.last_used_at) : '—' }}
        </span>
      </template>

      <template #cell-expires_at="{ row }">
        <span
          :title="row.expires_at ? formatDateTime(row.expires_at) : 'Never expires'"
          class="text-subtle"
        >
          {{ row.expires_at ? formatRelative(row.expires_at) : 'Never' }}
        </span>
      </template>

      <template #cell-created_at="{ row }">
        <span :title="formatDateTime(row.created_at)" class="text-subtle">
          {{ formatRelative(row.created_at) }}
        </span>
      </template>

      <template #cell-_actions="{ row }">
        <div class="flex items-center justify-end">
          <IconButton
            label="Revoke API key"
            size="sm"
            variant="danger"
            :disabled="row.revoked"
            @click.stop="handleRevoke(row)"
          >
            <Trash2 :size="14" />
          </IconButton>
        </div>
      </template>
    </DataTable>

    <CreateApiKeyModal v-model:open="showCreate" @created="onCreated" />
  </div>
</template>
