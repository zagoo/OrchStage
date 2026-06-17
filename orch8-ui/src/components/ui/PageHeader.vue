<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(defineProps<{ title: string; description?: string; icon?: Component }>(), {})
</script>

<template>
  <header class="mb-5 flex flex-wrap items-start justify-between gap-4">
    <div class="flex min-w-0 items-start gap-3">
      <div
        v-if="icon"
        class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-accent"
      >
        <component :is="icon" :size="20" />
      </div>
      <div class="min-w-0">
        <div v-if="$slots.breadcrumb" class="mb-1 text-[12px] text-subtle">
          <slot name="breadcrumb" />
        </div>
        <h1 class="truncate text-[19px] font-semibold tracking-tight text-text">{{ title }}</h1>
        <p v-if="description" class="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{{ description }}</p>
      </div>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
