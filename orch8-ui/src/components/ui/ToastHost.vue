<script setup lang="ts">
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-vue-next'
import { useUiStore, type ToastTone } from '@/stores/ui'

const ui = useUiStore()

const icon = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info }
const accent: Record<ToastTone, string> = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
}
</script>

<template>
  <!-- Teleport to <body>: #app has `isolation: isolate`, creating a stacking
       context. The Drawer / Confirm / canvas ctx-menu all teleport to <body>, so
       a toast rendered INSIDE #app is trapped below them no matter how high its
       z-index. Teleporting lifts it to the body stacking context; z-[140] then
       puts it above Drawer 110, Confirm 120, ctx-menu 121, Tooltip 130 so a
       save/validation error is never occluded by the panel that triggered it. -->
  <Teleport to="body">
    <div class="pointer-events-none fixed bottom-4 right-4 z-[140] flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-2.5">
      <TransitionGroup name="toast">
      <div
        v-for="t in ui.toasts"
        :key="t.id"
        class="anim-slide pointer-events-auto flex items-start gap-3 rounded-lg border border-border-strong bg-elevated p-3.5 shadow-pop"
        role="status"
      >
        <component :is="icon[t.tone]" :size="18" :class="['mt-0.5 shrink-0', accent[t.tone]]" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-text">{{ t.title }}</p>
          <p v-if="t.message" class="mt-0.5 break-words text-[13px] leading-snug text-muted">{{ t.message }}</p>
        </div>
        <button
          class="-m-1 rounded p-1 text-faint transition-colors hover:text-text"
          aria-label="Dismiss notification"
          @click="ui.dismissToast(t.id)"
        >
          <X :size="15" />
        </button>
      </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px) scale(0.96);
}
.toast-leave-active {
  position: absolute;
  right: 0;
  width: 100%;
}
</style>
