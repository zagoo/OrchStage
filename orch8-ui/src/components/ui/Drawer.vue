<script setup lang="ts">
import { watch } from 'vue'
import { X } from 'lucide-vue-next'

withDefaults(defineProps<{ title?: string; width?: string }>(), { width: '620px' })
const open = defineModel<boolean>('open', { required: true })

function close() {
  open.value = false
}
watch(open, (v) => {
  if (typeof document !== 'undefined') document.body.style.overflow = v ? 'hidden' : ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open" class="fixed inset-0 z-[110]" @keydown.esc="close">
        <div class="absolute inset-0 bg-[var(--overlay)]" @click="close" />
        <aside
          class="drawer-panel absolute right-0 top-0 flex h-full flex-col border-l border-border-strong bg-surface shadow-pop"
          :style="{ width, maxWidth: '100vw' }"
          role="dialog"
          aria-modal="true"
        >
          <header class="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <h2 class="truncate text-[15px] font-semibold text-text"><slot name="header">{{ title }}</slot></h2>
            <div class="flex items-center gap-1.5">
              <slot name="actions" />
              <button class="-m-1 rounded p-1 text-faint transition-colors hover:text-text" aria-label="Close" @click="close">
                <X :size="18" />
              </button>
            </div>
          </header>
          <div class="flex-1 overflow-y-auto p-5">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="border-t border-border bg-surface-2 px-5 py-3.5">
            <slot name="footer" :close="close" />
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(100%);
}
</style>
