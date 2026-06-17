<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Hammer } from 'lucide-vue-next'
import PageHeader from '@/components/ui/PageHeader.vue'
import Panel from '@/components/ui/Panel.vue'
import Badge from '@/components/ui/Badge.vue'

const route = useRoute()
const title = computed(() => (route.meta.title as string | undefined) ?? 'Module')
const blurb = computed(() => route.meta.blurb as string | undefined)
const endpoints = computed(() => (route.meta.endpoints as string[] | undefined) ?? [])
</script>

<template>
  <div>
    <PageHeader :title="title" :description="blurb" :icon="Hammer" />
    <Panel>
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Hammer :size="22" />
        </div>
        <p class="text-sm font-medium text-text">This surface is being implemented</p>
        <p class="mt-1 max-w-md text-[13px] text-subtle">
          The shell, design system and API client are in place. The feature module for
          <span class="font-medium text-muted">{{ title }}</span> is generated in a later build phase.
        </p>
        <div v-if="endpoints.length" class="mt-5 w-full max-w-xl text-left">
          <p class="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-faint">Planned endpoint coverage</p>
          <div class="flex flex-wrap gap-1.5">
            <Badge v-for="ep in endpoints" :key="ep" tone="neutral" class="mono">{{ ep }}</Badge>
          </div>
        </div>
      </div>
    </Panel>
  </div>
</template>
