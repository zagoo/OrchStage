<script setup lang="ts">
import { RouterView } from 'vue-router'
import ToastHost from '@/components/ui/ToastHost.vue'
import ConfirmHost from '@/components/ui/ConfirmHost.vue'
import ErrorBoundary from '@/components/ui/ErrorBoundary.vue'
</script>

<template>
  <ErrorBoundary>
    <RouterView v-slot="{ Component, route }">
      <component :is="Component" :key="route.path" />
    </RouterView>
  </ErrorBoundary>
  <ToastHost />
  <ConfirmHost />
</template>
