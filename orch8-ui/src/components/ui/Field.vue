<script setup lang="ts">
import { useId } from 'vue'

withDefaults(defineProps<{ label?: string; hint?: string; error?: string | null; required?: boolean }>(), {})
const id = useId()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" :for="id" class="flex items-center gap-1 text-[12.5px] font-medium text-muted">
      {{ label }}
      <span v-if="required" class="text-danger" aria-hidden="true">*</span>
    </label>
    <slot :id="id" :invalid="!!error" />
    <p v-if="error" class="text-[12px] text-danger">{{ error }}</p>
    <p v-else-if="hint" class="text-[12px] text-subtle">{{ hint }}</p>
  </div>
</template>
