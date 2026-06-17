<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Compass } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
</script>

<template>
  <div class="flex min-h-[70vh] flex-col items-center justify-center text-center">
    <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-faint">
      <Compass :size="26" />
    </div>
    <p class="text-2xl font-semibold tracking-tight text-text">404</p>
    <p class="mt-1.5 text-[13px] text-subtle">This route doesn’t exist in the Orch8 console.</p>
    <RouterLink to="/" class="mt-5">
      <Button variant="primary">Back to dashboard</Button>
    </RouterLink>
  </div>
</template>
