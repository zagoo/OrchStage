<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Waypoints, Plug, ShieldCheck } from 'lucide-vue-next'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import { validateForm, required } from '@/lib/validation'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'

const conn = useConnectionStore()
const ui = useUiStore()
const router = useRouter()
const route = useRoute()

const form = reactive({
  baseUrl: conn.baseUrl,
  apiKey: conn.apiKey,
  tenantId: conn.tenantId,
  insecure: conn.insecure,
})
const errors = ref<Record<string, string | null>>({})
const submitting = computed(() => conn.status === 'checking')

async function submit() {
  const { errors: e, valid } = validateForm(form, {
    apiKey: form.insecure ? [] : [required('API key')],
  })
  errors.value = e
  if (!valid) return

  conn.setConnection({
    baseUrl: form.baseUrl.trim(),
    apiKey: form.apiKey.trim(),
    tenantId: form.tenantId.trim(),
    insecure: form.insecure,
  })
  const ok = await conn.check()
  if (ok) {
    ui.success('Connected', `Orch8 engine ${conn.engineVersion}`)
    const redirect = (route.query.redirect as string | undefined) ?? '/'
    void router.push(redirect)
  } else {
    ui.error('Connection failed', conn.lastError ?? 'Could not reach the Orch8 server.')
  }
}
</script>

<template>
  <div class="surface-grid flex min-h-screen items-center justify-center bg-bg p-6">
    <div class="w-full max-w-md">
      <div class="mb-6 flex flex-col items-center text-center">
        <span class="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white shadow-pop">
          <Waypoints :size="24" />
        </span>
        <h1 class="text-xl font-semibold tracking-tight text-text">Connect to Orch8</h1>
        <p class="mt-1 text-[13px] text-subtle">Point the console at your orch8-server and authenticate.</p>
      </div>

      <form class="rounded-xl border border-border bg-surface p-6 shadow-2" @submit.prevent="submit">
        <div class="flex flex-col gap-4">
          <Field
            label="Server URL"
            hint="Leave blank when the console is served behind a proxy that forwards /api to orch8-server (recommended — same-origin, no CORS). Only set an absolute URL if that server's ORCH8_CORS_ORIGINS allows this origin."
          >
            <template #default="{ id }">
              <Input :id="id" v-model="form.baseUrl" placeholder="(blank = same origin)" mono />
            </template>
          </Field>

          <Field label="API key" :error="errors.apiKey" :required="!form.insecure">
            <template #default="{ id, invalid }">
              <Input :id="id" v-model="form.apiKey" type="password" placeholder="orch8 root or tenant key" :invalid="invalid" mono />
            </template>
          </Field>

          <Field label="Tenant ID" hint="Required for root-key calls when the server enforces tenant headers.">
            <template #default="{ id }">
              <Input :id="id" v-model="form.tenantId" placeholder="acme" mono />
            </template>
          </Field>

          <label class="flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-surface-2 p-3">
            <input v-model="form.insecure" type="checkbox" class="mt-0.5 accent-[var(--accent)]" />
            <span class="flex flex-col">
              <span class="flex items-center gap-1.5 text-[13px] font-medium text-text">
                <ShieldCheck :size="14" class="text-warning" /> Insecure / dev mode
              </span>
              <span class="text-[12px] text-subtle">Skip the API-key requirement (server must run with --insecure).</span>
            </span>
          </label>

          <Button type="submit" variant="primary" :loading="submitting" block>
            <template #icon><Plug :size="16" /></template>
            Test &amp; Connect
          </Button>
        </div>
      </form>

      <p class="mt-4 text-center text-[12px] text-faint">
        Credentials are stored locally in this browser only.
      </p>
    </div>
  </div>
</template>
