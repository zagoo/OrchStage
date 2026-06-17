<script setup lang="ts">
/**
 * Toolbar above the Vue Flow canvas.
 * Controls: add step, fit view, auto-layout, toggle minimap, save, export JSON.
 * Save is gated on a valid block tree (see validateSequence).
 *
 * DESIGN_REFERENCE §dag-sequences.md §9.1 Create Sequence (save)
 */
import { Maximize2, LayoutDashboard, Map, Save, Download, Loader2, AlertCircle, CheckCircle2, Plus } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Badge from '@/components/ui/Badge.vue'

defineProps<{
  dirty: boolean
  saving: boolean
  minimapVisible: boolean
  sequenceLoaded: boolean
  valid: boolean
}>()

const emit = defineEmits<{
  addStep: []
  fitView: []
  autoLayout: []
  toggleMinimap: []
  save: []
  exportJson: []
}>()
</script>

<template>
  <div class="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
    <!-- Primary edit action -->
    <Button variant="secondary" size="sm" @click="emit('addStep')">
      <template #icon><Plus :size="14" /></template>
      Add step
    </Button>

    <div class="mx-1 h-5 w-px bg-border" aria-hidden="true" />

    <!-- View controls -->
    <IconButton label="Fit view (ctrl+shift+F)" @click="emit('fitView')" :disabled="!sequenceLoaded">
      <Maximize2 :size="15" />
    </IconButton>
    <IconButton label="Auto-layout nodes" @click="emit('autoLayout')" :disabled="!sequenceLoaded">
      <LayoutDashboard :size="15" />
    </IconButton>
    <IconButton
      label="Toggle minimap"
      @click="emit('toggleMinimap')"
      :class="minimapVisible ? 'bg-accent-soft text-accent' : ''"
    >
      <Map :size="15" />
    </IconButton>

    <div class="mx-1 h-5 w-px bg-border" aria-hidden="true" />

    <!-- Status indicators -->
    <Badge v-if="dirty" tone="warning" class="text-[10px]">
      <AlertCircle :size="10" class="mr-0.5" />
      Unsaved changes
    </Badge>
    <Badge v-if="dirty && valid" tone="success" class="text-[10px]">
      <CheckCircle2 :size="10" class="mr-0.5" />
      Valid
    </Badge>

    <div class="flex-1" />

    <!-- Export JSON -->
    <Button v-if="sequenceLoaded" variant="ghost" size="sm" @click="emit('exportJson')">
      <template #icon><Download :size="14" /></template>
      Export JSON
    </Button>

    <!-- Save new version (gated on valid + dirty) -->
    <Button
      v-if="sequenceLoaded"
      variant="primary"
      size="sm"
      :disabled="!dirty || saving || !valid"
      :title="!valid ? 'Resolve validation errors before saving' : undefined"
      @click="emit('save')"
    >
      <template #icon>
        <Loader2 v-if="saving" :size="14" class="animate-spin" />
        <Save v-else :size="14" />
      </template>
      {{ saving ? 'Saving…' : 'Save version' }}
    </Button>
  </div>
</template>
