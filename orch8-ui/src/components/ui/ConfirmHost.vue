<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

function onConfirm() {
  ui.resolveConfirm(true)
}
function onCancel() {
  ui.resolveConfirm(false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div
        v-if="ui.confirmState.open"
        class="fixed inset-0 z-[120] flex items-center justify-center p-4"
        @keydown.esc="onCancel"
      >
        <div class="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]" @click="onCancel" />
        <div
          class="anim-pop relative w-full max-w-[440px] overflow-hidden rounded-xl border border-border-strong bg-elevated shadow-pop"
          role="alertdialog"
          aria-modal="true"
          :aria-label="ui.confirmState.title"
        >
          <div class="flex gap-3.5 p-5">
            <div
              :class="[
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                ui.confirmState.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent',
              ]"
            >
              <AlertTriangle :size="20" />
            </div>
            <div class="min-w-0 flex-1 pt-0.5">
              <h2 class="text-[15px] font-semibold text-text">{{ ui.confirmState.title }}</h2>
              <p class="mt-1.5 text-[13px] leading-relaxed text-muted">{{ ui.confirmState.message }}</p>
            </div>
          </div>
          <div class="flex justify-end gap-2.5 border-t border-border bg-surface px-5 py-3.5">
            <button
              class="rounded-md px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-text"
              @click="onCancel"
            >
              {{ ui.confirmState.cancelText }}
            </button>
            <button
              :class="[
                'rounded-md px-3.5 py-2 text-[13px] font-semibold text-white transition-colors',
                ui.confirmState.tone === 'danger' ? 'bg-danger hover:brightness-110' : 'bg-accent hover:bg-accent-strong',
              ]"
              autofocus
              @click="onConfirm"
            >
              {{ ui.confirmState.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-enter-active,
.confirm-leave-active {
  transition: opacity 0.16s ease;
}
.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}
</style>
