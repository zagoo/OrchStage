<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { Waypoints } from 'lucide-vue-next'
import { navGroups, type NavItem } from '@/config/nav'
import { useUiStore } from '@/stores/ui'
import { cn } from '@/lib/cn'
import Tooltip from '@/components/ui/Tooltip.vue'

const ui = useUiStore()
const route = useRoute()

function isActive(item: NavItem): boolean {
  if (item.exact) return route.path === item.to
  return route.path === item.to || route.path.startsWith(item.to + '/')
}

function linkCls(active: boolean): string {
  return cn(
    'group flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] font-medium transition-colors',
    active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-text',
  )
}
</script>

<template>
  <aside
    :class="cn(
      'flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200',
      ui.sidebarCollapsed ? 'w-[64px]' : 'w-[244px]',
    )"
  >
    <RouterLink to="/" class="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-[var(--shadow-1)]">
        <Waypoints :size="18" />
      </span>
      <span v-if="!ui.sidebarCollapsed" class="flex flex-col leading-none">
        <span class="text-[14px] font-semibold tracking-tight text-text">Orch8</span>
        <span class="mt-0.5 text-[10.5px] uppercase tracking-[0.14em] text-faint">Console</span>
      </span>
    </RouterLink>

    <nav class="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3">
      <div v-for="group in navGroups" :key="group.label" class="mb-4 last:mb-0">
        <p
          v-if="!ui.sidebarCollapsed"
          class="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint"
        >
          {{ group.label }}
        </p>
        <ul class="flex flex-col gap-0.5">
          <li v-for="item in group.items" :key="item.to">
            <Tooltip v-if="ui.sidebarCollapsed" :text="item.label" side="right" class="block">
              <RouterLink :to="item.to" :class="linkCls(isActive(item))" :aria-label="item.label">
                <component :is="item.icon" :size="18" class="shrink-0" />
              </RouterLink>
            </Tooltip>
            <RouterLink v-else :to="item.to" :class="linkCls(isActive(item))">
              <component :is="item.icon" :size="17" class="shrink-0" />
              <span class="truncate">{{ item.label }}</span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </nav>
  </aside>
</template>
