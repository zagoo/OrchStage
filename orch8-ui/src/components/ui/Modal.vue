<script setup lang="ts">
import { watch } from 'vue'
import { X } from 'lucide-vue-next'

withDefaults(
  defineProps<{ title?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; closeOnBackdrop?: boolean }>(),
  { size: 'md', closeOnBackdrop: true },
)
const open = defineModel<boolean>('open', { required: true })

const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }

function close() {
  open.value = false
}

watch(open, (v) => {
  if (typeof document !== 'undefined') document.body.style.overflow = v ? 'hidden' : ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto p-4 sm:p-8" @keydown.esc="close">
        <div class="fixed inset-0 bg-[var(--overlay)] backdrop-blur-[2px]" @click="closeOnBackdrop && close()" />
        <div
          :class="['anim-pop relative my-auto w-full overflow-hidden rounded-xl border border-border-strong bg-elevated shadow-pop', widths[size]]"
          role="dialog"
          aria-modal="true"
        >
          <header v-if="title || $slots.header" class="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <h2 class="text-[15px] font-semibold text-text"><slot name="header">{{ title }}</slot></h2>
            <button class="-m-1 rounded p-1 text-faint transition-colors hover:text-text" aria-label="Close" @click="close">
              <X :size="18" />
            </button>
          </header>
          <div class="max-h-[70vh] overflow-y-auto px-5 py-4">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="flex justify-end gap-2.5 border-t border-border bg-surface px-5 py-3.5">
            <slot name="footer" :close="close" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.16s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
