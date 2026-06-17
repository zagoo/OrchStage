<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { TriangleAlert, RotateCcw } from 'lucide-vue-next'
import { errorMessage } from '@/api/errors'

const err = ref<string | null>(null)

onErrorCaptured((e) => {
  err.value = errorMessage(e)
  // Swallow so a single broken section never blanks the whole console.
  return false
})

function reset() {
  err.value = null
}
function reloadPage() {
  location.reload()
}
</script>

<template>
  <div v-if="err" class="flex min-h-[60vh] items-center justify-center p-8">
    <div class="max-w-md rounded-xl border border-border-strong bg-surface p-8 text-center shadow-2">
      <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert :size="24" />
      </div>
      <h2 class="text-base font-semibold text-text">Something went wrong</h2>
      <p class="mt-2 break-words font-mono text-[12px] leading-relaxed text-muted">{{ err }}</p>
      <div class="mt-5 flex justify-center gap-2.5">
        <button
          class="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-strong"
          @click="reset"
        >
          <RotateCcw :size="15" /> Try again
        </button>
        <button
          class="rounded-md px-4 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-text"
          @click="reloadPage"
        >
          Reload console
        </button>
      </div>
    </div>
  </div>
  <slot v-else />
</template>
