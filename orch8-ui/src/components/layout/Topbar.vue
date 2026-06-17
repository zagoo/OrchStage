<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { PanelLeft, Sun, Moon, Settings, Building2 } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import IconButton from '@/components/ui/IconButton.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import type { DotTone } from '@/components/ui/StatusDot.vue'

const ui = useUiStore()
const conn = useConnectionStore()
const route = useRoute()

const title = computed(() => (route.meta.title as string | undefined) ?? 'Orch8')

const statusTone = computed<DotTone>(() => {
  switch (conn.status) {
    case 'ok':
      return 'success'
    case 'error':
      return 'danger'
    case 'checking':
      return 'info'
    default:
      return 'neutral'
  }
})
const statusLabel = computed(() => ({ ok: 'Connected', error: 'Unreachable', checking: 'Checking…', unknown: 'Not checked' })[conn.status])
</script>

<template>
  <header class="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface/80 px-4 backdrop-blur">
    <div class="flex min-w-0 items-center gap-2">
      <IconButton :label="ui.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'" @click="ui.toggleSidebar">
        <PanelLeft :size="18" />
      </IconButton>
      <h2 class="truncate text-[14px] font-semibold tracking-tight text-text">{{ title }}</h2>
    </div>

    <div class="flex items-center gap-2">
      <RouterLink
        to="/settings"
        class="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-muted transition-colors hover:border-border-strong hover:text-text"
      >
        <Building2 :size="14" class="text-faint" />
        <span class="mono max-w-[160px] truncate">{{ conn.tenantId || 'no tenant' }}</span>
        <span class="mx-0.5 h-3.5 w-px bg-border" />
        <StatusDot :tone="statusTone" :pulse="conn.status === 'checking'" />
        <span class="text-[12px]">{{ statusLabel }}</span>
      </RouterLink>

      <Tooltip :text="ui.theme === 'dark' ? 'Light mode' : 'Dark mode'">
        <IconButton label="Toggle theme" @click="ui.toggleTheme">
          <Sun v-if="ui.theme === 'dark'" :size="18" />
          <Moon v-else :size="18" />
        </IconButton>
      </Tooltip>

      <RouterLink to="/settings">
        <IconButton label="Settings"><Settings :size="18" /></IconButton>
      </RouterLink>
    </div>
  </header>
</template>
