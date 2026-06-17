<script setup lang="ts">
/**
 * Settings view — three panels:
 * 1. Connection: edit server URL / API key / tenant ID / insecure mode.
 *    Saves via useConnectionStore().setConnection(); "Test connection" calls .check().
 * 2. Preferences: theme toggle + sidebar preference via useUiStore.
 * 3. Danger Zone: Disconnect clears the connection and redirects to /connect.
 *
 * Follows ConnectView patterns for the connection form.
 * DESIGN_REFERENCE §Connection store (stores/connection.ts)
 */
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Settings, Plug, LogOut, ShieldAlert, CheckCircle, XCircle, Loader2 } from 'lucide-vue-next'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { validateForm, required } from '@/lib/validation'
import PageHeader from '@/components/ui/PageHeader.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'

const conn = useConnectionStore()
const ui = useUiStore()
const router = useRouter()

// --- Connection panel ---------------------------------------------------------

const connForm = reactive({
  baseUrl: conn.baseUrl,
  apiKey: conn.apiKey,
  tenantId: conn.tenantId,
  insecure: conn.insecure,
})

const connErrors = ref<Record<string, string | null>>({})
const connSaving = ref(false)
const connTesting = computed(() => conn.status === 'checking')

function saveConnection() {
  const { errors, valid } = validateForm(connForm, {
    apiKey: connForm.insecure ? [] : [required('API key')],
  })
  connErrors.value = errors
  if (!valid) return
  conn.setConnection({
    baseUrl: connForm.baseUrl.trim(),
    apiKey: connForm.apiKey.trim(),
    tenantId: connForm.tenantId.trim(),
    insecure: connForm.insecure,
  })
  ui.success('Connection saved', 'Settings updated. Run "Test connection" to verify.')
}

async function testConnection() {
  // Flush form into store before testing so the HTTP client has fresh credentials.
  conn.setConnection({
    baseUrl: connForm.baseUrl.trim(),
    apiKey: connForm.apiKey.trim(),
    tenantId: connForm.tenantId.trim(),
    insecure: connForm.insecure,
  })
  const ok = await conn.check()
  if (ok) {
    ui.success('Connection OK', `Orch8 engine ${conn.engineVersion}`)
  } else {
    ui.error('Connection failed', conn.lastError ?? 'Could not reach the Orch8 server.')
  }
}

// --- Danger Zone: Disconnect --------------------------------------------------

async function handleDisconnect() {
  const ok = await ui.confirm({
    title: 'Disconnect from Orch8?',
    message:
      'This will clear your server URL, API key, and tenant ID from this browser. You will be returned to the connection setup screen.',
    tone: 'danger',
    confirmText: 'Disconnect',
  })
  if (!ok) return
  conn.clear()
  void router.push('/connect')
}
</script>

<template>
  <div>
    <PageHeader
      title="Settings"
      description="Manage your connection credentials and console preferences."
      :icon="Settings"
    />

    <!-- ── Connection panel ─────────────────────────────────────────────────── -->
    <section class="mb-8">
      <h2 class="mb-3 text-[13px] font-semibold uppercase tracking-wide text-subtle">Connection</h2>
      <div class="rounded-xl border border-border bg-surface p-5 shadow-1">
        <form class="flex flex-col gap-4" @submit.prevent="saveConnection">
          <Field label="Server URL" hint="Leave blank to use the same origin (dev proxy).">
            <template #default="{ id }">
              <Input
                :id="id"
                v-model="connForm.baseUrl"
                placeholder="https://orch8.internal:8080"
                mono
              />
            </template>
          </Field>

          <Field
            label="API key"
            :error="connErrors.apiKey"
            :required="!connForm.insecure"
            hint="Root key for admin operations; per-tenant key for scoped access."
          >
            <template #default="{ id, invalid }">
              <Input
                :id="id"
                v-model="connForm.apiKey"
                type="password"
                placeholder="Root or per-tenant API key"
                mono
                :invalid="invalid"
              />
            </template>
          </Field>

          <Field
            label="Tenant ID"
            hint="Required when the server enforces tenant headers (the default)."
          >
            <template #default="{ id }">
              <Input
                :id="id"
                v-model="connForm.tenantId"
                placeholder="acme"
                mono
              />
            </template>
          </Field>

          <label class="flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-surface-2 p-3">
            <input v-model="connForm.insecure" type="checkbox" class="mt-0.5 accent-[var(--accent)]" />
            <span class="flex flex-col">
              <span class="flex items-center gap-1.5 text-[13px] font-medium text-text">
                <ShieldAlert :size="14" class="text-warning" /> Insecure / dev mode
              </span>
              <span class="text-[12px] text-subtle">
                Skip the API-key requirement (server must run with --insecure).
              </span>
            </span>
          </label>

          <!-- Connection status indicator -->
          <div
            v-if="conn.status !== 'unknown'"
            class="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px]"
          >
            <Loader2 v-if="conn.status === 'checking'" :size="14" class="animate-spin text-info" />
            <CheckCircle v-else-if="conn.status === 'ok'" :size="14" class="text-success" />
            <XCircle v-else :size="14" class="text-danger" />
            <span
              :class="{
                'text-info': conn.status === 'checking',
                'text-success': conn.status === 'ok',
                'text-danger': conn.status === 'error',
              }"
            >
              <template v-if="conn.status === 'checking'">Testing connection…</template>
              <template v-else-if="conn.status === 'ok'">
                Connected — engine {{ conn.engineVersion }}
              </template>
              <template v-else>{{ conn.lastError ?? 'Connection failed' }}</template>
            </span>
          </div>

          <div class="flex items-center gap-2">
            <Button type="submit" variant="secondary" :loading="connSaving">
              <template #icon><Plug :size="14" /></template>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              :loading="connTesting"
              @click="testConnection"
            >
              Test connection
            </Button>
          </div>
        </form>
      </div>
    </section>

    <!-- ── Preferences panel ────────────────────────────────────────────────── -->
    <section class="mb-8">
      <h2 class="mb-3 text-[13px] font-semibold uppercase tracking-wide text-subtle">Preferences</h2>
      <div class="rounded-xl border border-border bg-surface p-5 shadow-1">
        <div class="flex flex-col gap-4">
          <!-- Theme toggle -->
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-[13px] font-medium text-text">Theme</p>
              <p class="text-[12px] text-subtle">Switch between dark and light mode.</p>
            </div>
            <Button variant="secondary" @click="ui.toggleTheme()">
              {{ ui.theme === 'dark' ? 'Switch to light' : 'Switch to dark' }}
            </Button>
          </div>

          <!-- Sidebar collapsed preference -->
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-[13px] font-medium text-text">Sidebar</p>
              <p class="text-[12px] text-subtle">Collapse the sidebar to maximise canvas space.</p>
            </div>
            <Button variant="secondary" @click="ui.toggleSidebar()">
              {{ ui.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar' }}
            </Button>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Danger Zone ──────────────────────────────────────────────────────── -->
    <section>
      <h2 class="mb-3 text-[13px] font-semibold uppercase tracking-wide text-danger">Danger Zone</h2>
      <div class="rounded-xl border border-danger/30 bg-surface p-5 shadow-1">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-[13px] font-medium text-text">Disconnect</p>
            <p class="text-[12px] text-subtle">
              Clear all connection credentials from this browser and return to setup.
            </p>
          </div>
          <Button variant="danger" @click="handleDisconnect">
            <template #icon><LogOut :size="14" /></template>
            Disconnect
          </Button>
        </div>
      </div>
    </section>
  </div>
</template>
