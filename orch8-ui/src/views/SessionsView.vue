<script setup lang="ts">
/**
 * SessionsView — Session management.
 *
 * Features:
 *  - Lookup sessions by ID or by key (GET /api/v1/sessions/{id}, GET /api/v1/sessions/by-key/{tenantId}/{key})
 *  - Create session (POST /api/v1/sessions via SessionFormModal)
 *  - Session detail drawer: edit data (PATCH /sessions/{id}/data) + change state (PATCH /sessions/{id}/state)
 *    + list linked instances (GET /sessions/{id}/instances)
 *  - Empty / loading / error states
 *
 * Note: there is no GET /api/v1/sessions list endpoint in the API.
 * The view surfaces a lookup-by-key search and maintains a local working set
 * of sessions fetched during the session.
 *
 * DESIGN_REFERENCE §Sessions (human-sessions-stream.md §2)
 */
import { ref, computed } from 'vue'
import { MessagesSquare, Plus, Search, RefreshCw, X } from 'lucide-vue-next'
import { useConnectionStore } from '@/stores/connection'
import { getSessionByKey, getSession } from '@/api/sessions'
import { errorMessage, isApiError } from '@/api/errors'
import { formatRelative, formatDateTime, shortId } from '@/lib/format'
import type { Session, SessionState } from '@/api/types/sessions'
import type { Column } from '@/components/ui/DataTable.vue'
import type { BadgeTone } from '@/components/ui/Badge.vue'

import PageHeader from '@/components/ui/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Badge from '@/components/ui/Badge.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import SessionFormModal from '@/components/human/SessionFormModal.vue'
import SessionDetailDrawer from '@/components/human/SessionDetailDrawer.vue'

const conn = useConnectionStore()

// --- local working set --------------------------------------------------------
// Maintains sessions discovered/created during this browser session.
const sessions = ref<Session[]>([])

// --- lookup by key / ID -------------------------------------------------------
const lookupQuery = ref('')
const lookupError = ref<string | null>(null)
const lookupLoading = ref(false)

/**
 * UUID-like pattern: if the query looks like a UUID, try getSession(id);
 * otherwise try getSessionByKey(tenantId, key).
 * Both paths surface their session into the working set.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function handleLookup() {
  const q = lookupQuery.value.trim()
  if (!q) return

  lookupError.value = null
  lookupLoading.value = true

  try {
    let found: Session
    if (UUID_RE.test(q)) {
      // Lookup by ID
      found = await getSession(q)
    } else {
      // Lookup by key — requires a tenant
      const tenantId = conn.tenantId
      if (!tenantId) {
        lookupError.value = 'Connect with a tenant-scoped key to look up sessions by key.'
        return
      }
      found = await getSessionByKey(tenantId, q)
    }

    // Upsert into working set
    const existing = sessions.value.findIndex((s) => s.id === found.id)
    if (existing >= 0) {
      sessions.value[existing] = found
    } else {
      sessions.value.unshift(found)
    }
    lookupQuery.value = ''
  } catch (e) {
    if (isApiError(e) && e.status === 404) {
      lookupError.value = `No session found for "${lookupQuery.value.trim()}".`
    } else {
      lookupError.value = errorMessage(e)
    }
  } finally {
    lookupLoading.value = false
  }
}

function clearLookup() {
  lookupQuery.value = ''
  lookupError.value = null
}

// --- create modal -------------------------------------------------------------
const showCreate = ref(false)

function onCreated(session: Session) {
  sessions.value.unshift(session)
}

// --- detail drawer ------------------------------------------------------------
const detailTarget = ref<Session | null>(null)
const showDetail = ref(false)

function openDetail(row: Session) {
  detailTarget.value = row
  showDetail.value = true
}

function onSessionUpdated(updated: Session) {
  const idx = sessions.value.findIndex((s) => s.id === updated.id)
  if (idx >= 0) {
    sessions.value[idx] = updated
  }
  // Keep detail target in sync
  if (detailTarget.value?.id === updated.id) {
    detailTarget.value = updated
  }
}

// --- remove from working set --------------------------------------------------
function removeFromSet(session: Session) {
  sessions.value = sessions.value.filter((s) => s.id !== session.id)
}

// --- state tone & label -------------------------------------------------------
const stateTone: Record<SessionState, BadgeTone> = {
  active: 'success',
  paused: 'warning',
  completed: 'neutral',
  expired: 'danger',
}

// active sessions get a live pulse
const isLive = (s: Session) => s.state === 'active'

// --- columns ------------------------------------------------------------------
const columns: Column[] = [
  { key: 'status', header: '', width: '28px' },
  { key: 'session_key', header: 'Session key' },
  { key: 'tenant_id', header: 'Tenant', width: '130px', mono: true },
  { key: 'state', header: 'State', width: '110px' },
  { key: 'expires_at', header: 'Expires', width: '140px' },
  { key: 'updated_at', header: 'Updated', width: '140px' },
  { key: '_actions', header: '', width: '80px', align: 'right' },
]

// --- computed rows with optional search ---------------------------------------
const rowSearch = ref('')
const rows = computed<Session[]>(() => {
  const q = rowSearch.value.trim().toLowerCase()
  if (!q) return sessions.value
  return sessions.value.filter(
    (s) =>
      s.session_key.toLowerCase().includes(q) ||
      s.tenant_id.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q),
  )
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeader
      title="Sessions"
      description="Persistent shared-data stores grouping related workflow instances. Look up by session key or UUID."
      :icon="MessagesSquare"
    >
      <template #actions>
        <Button variant="primary" @click="showCreate = true">
          <template #icon><Plus :size="15" /></template>
          New session
        </Button>
      </template>
    </PageHeader>

    <!-- Lookup form -->
    <div class="rounded-lg border border-border bg-surface p-4">
      <p class="mb-2 text-[12.5px] font-medium text-muted">
        Look up a session by key or UUID
      </p>
      <div class="flex items-start gap-2">
        <Field :error="lookupError" class="flex-1">
          <template #default="{ id, invalid }">
            <Input
              :id="id"
              v-model="lookupQuery"
              :invalid="invalid"
              placeholder="user:123:onboarding  or  018f4e3a-…"
              :disabled="lookupLoading"
              @keydown.enter="handleLookup"
              @input="lookupError = null"
            />
          </template>
        </Field>
        <Button
          variant="primary"
          :loading="lookupLoading"
          :disabled="!lookupQuery.trim()"
          @click="handleLookup"
        >
          <template #icon><Search :size="15" /></template>
          Look up
        </Button>
        <IconButton
          v-if="lookupQuery || lookupError"
          label="Clear lookup"
          @click="clearLookup"
        >
          <X :size="15" />
        </IconButton>
      </div>
    </div>

    <!-- Row search (client-side over working set) -->
    <div v-if="sessions.length > 0" class="flex items-center gap-2">
      <input
        v-model="rowSearch"
        class="h-9 w-64 rounded-md border border-border-strong bg-surface-2 px-3 text-[13px] text-text placeholder-faint focus:border-accent focus:outline-none"
        placeholder="Filter working set…"
      />
      <span class="text-[12.5px] text-subtle">{{ rows.length }} / {{ sessions.length }}</span>
    </div>

    <!-- Sessions table -->
    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(r) => r.id"
      :clickable="true"
      empty-title="No sessions in working set"
      empty-description="Use the look-up form above to find a session by key or UUID, or create a new session."
      @row-click="openDetail"
    >
      <!-- Live dot -->
      <template #cell-status="{ row }">
        <StatusDot
          :tone="isLive(row) ? 'success' : 'neutral'"
          :pulse="isLive(row)"
          :size="8"
          :label="row.state"
        />
      </template>

      <template #cell-session_key="{ row }">
        <span class="mono text-[12px] text-text">{{ row.session_key }}</span>
        <span class="ml-2 text-[11px] text-faint">{{ shortId(row.id) }}</span>
      </template>

      <template #cell-tenant_id="{ row }">
        <span class="mono text-[12px] text-muted">{{ row.tenant_id }}</span>
      </template>

      <template #cell-state="{ row }">
        <Badge :tone="stateTone[row.state]">{{ row.state }}</Badge>
      </template>

      <template #cell-expires_at="{ row }">
        <template v-if="row.expires_at">
          <span :title="formatDateTime(row.expires_at)" class="text-[12.5px] text-muted">
            {{ formatRelative(row.expires_at) }}
          </span>
        </template>
        <span v-else class="text-[12px] text-faint">—</span>
      </template>

      <template #cell-updated_at="{ row }">
        <span :title="formatDateTime(row.updated_at)" class="text-[12.5px] text-subtle">
          {{ formatRelative(row.updated_at) }}
        </span>
      </template>

      <template #cell-_actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <IconButton
            label="Open session detail"
            size="sm"
            @click.stop="openDetail(row)"
          >
            <RefreshCw :size="14" />
          </IconButton>
          <IconButton
            label="Remove from working set"
            size="sm"
            variant="danger"
            @click.stop="removeFromSet(row)"
          >
            <X :size="14" />
          </IconButton>
        </div>
      </template>
    </DataTable>

    <!-- Create modal -->
    <SessionFormModal v-model:open="showCreate" @created="onCreated" />

    <!-- Detail drawer -->
    <SessionDetailDrawer
      v-model:open="showDetail"
      :session="detailTarget"
      @updated="onSessionUpdated"
    />
  </div>
</template>
