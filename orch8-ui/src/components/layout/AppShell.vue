<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useConnectionStore } from '@/stores/connection'
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'
import EnvBanner from './EnvBanner.vue'

const conn = useConnectionStore()

onMounted(() => {
  // Establish connection state once for the whole shell. On a hard browser
  // refresh the Pinia store is fresh (status 'unknown'), and AppShell wraps
  // every authenticated route — so this is the one place that must kick the
  // health check. Previously only DashboardView did, which left a refresh on
  // any non-Dashboard page showing "Not checked" in the Topbar (and a blank
  // connection panel on Settings) until the user happened to open the Dashboard.
  // check() also fetches /info (version + env banner), so it subsumes loadInfo().
  if (!conn.configured) return
  if (conn.status === 'unknown') void conn.check()
  else if (!conn.info) void conn.loadInfo()
})
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-bg text-text">
    <EnvBanner />
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <Sidebar />
      <div class="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main class="flex flex-1 flex-col overflow-y-auto">
          <div class="mx-auto flex w-full max-w-[1640px] flex-1 flex-col px-6 py-6">
            <RouterView v-slot="{ Component, route }">
              <Transition name="page" mode="out-in">
                <component :is="Component" :key="route.path" />
              </Transition>
            </RouterView>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.page-leave-to {
  opacity: 0;
}
</style>
