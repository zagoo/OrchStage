<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { LayoutDashboard, Server, Cpu, ArrowRight } from 'lucide-vue-next'
import { useConnectionStore } from '@/stores/connection'
import { navGroups } from '@/config/nav'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import KeyValue from '@/components/ui/KeyValue.vue'
import Button from '@/components/ui/Button.vue'
import type { DotTone } from '@/components/ui/StatusDot.vue'

const conn = useConnectionStore()

const cardGroups = navGroups
  .map((g) => ({ label: g.label, items: g.items.filter((i) => i.to !== '/') }))
  .filter((g) => g.items.length > 0)

const tone: Record<string, DotTone> = { ok: 'success', error: 'danger', checking: 'info', unknown: 'neutral' }

onMounted(() => {
  if (conn.status === 'unknown') void conn.check()
})
</script>

<template>
  <div>
    <PageHeader title="Dashboard" description="Operational overview of your Orch8 deployment." :icon="LayoutDashboard">
      <template #actions>
        <Button variant="secondary" :loading="conn.status === 'checking'" @click="conn.check()">Refresh status</Button>
      </template>
    </PageHeader>

    <div class="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel title="Engine">
        <div class="flex items-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent"><Cpu :size="20" /></span>
          <div>
            <p class="text-[15px] font-semibold text-text">{{ conn.engineVersion }}</p>
            <StatusDot :tone="tone[conn.status]" :pulse="conn.status === 'checking'" :label="conn.status === 'ok' ? 'Reachable' : conn.status" />
          </div>
        </div>
      </Panel>
      <Panel title="Connection">
        <dl class="divide-y divide-border">
          <KeyValue label="Server"><span class="mono">{{ conn.baseUrl || 'same origin' }}</span></KeyValue>
          <KeyValue label="Tenant"><span class="mono">{{ conn.tenantId || '—' }}</span></KeyValue>
          <KeyValue label="Mode">{{ conn.insecure ? 'Insecure (dev)' : 'API key' }}</KeyValue>
        </dl>
      </Panel>
      <Panel title="Quick actions">
        <div class="flex flex-col gap-2">
          <RouterLink to="/sequences"><Button variant="secondary" block>New sequence</Button></RouterLink>
          <RouterLink to="/instances"><Button variant="secondary" block>Browse instances</Button></RouterLink>
          <RouterLink to="/canvas"><Button variant="secondary" block>Open flow canvas</Button></RouterLink>
        </div>
      </Panel>
    </div>

    <section v-for="g in cardGroups" :key="g.label" class="mb-6">
      <h3 class="mb-2.5 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-faint">
        <Server :size="13" /> {{ g.label }}
      </h3>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <RouterLink
          v-for="item in g.items"
          :key="item.to"
          :to="item.to"
          class="group flex items-center gap-3 rounded-lg border border-border bg-surface p-3.5 transition-all hover:border-border-strong hover:bg-surface-2"
        >
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted transition-colors group-hover:bg-accent-soft group-hover:text-accent">
            <component :is="item.icon" :size="18" />
          </span>
          <span class="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{{ item.label }}</span>
          <ArrowRight :size="15" class="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
        </RouterLink>
      </div>
    </section>
  </div>
</template>
