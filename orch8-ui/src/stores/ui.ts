/**
 * Global UI store — theme, layout chrome, toast notifications, and a
 * promise-based confirm() dialog used for destructive actions.
 */
import { defineStore } from 'pinia'

export type Theme = 'dark' | 'light'
export type ToastTone = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  tone: ToastTone
  title: string
  message?: string
  timeout: number
}

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  tone?: 'danger' | 'default'
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
  resolve: ((ok: boolean) => void) | null
}

interface UiState {
  theme: Theme
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  toasts: Toast[]
  confirmState: ConfirmState
}

let toastSeq = 0

export const useUiStore = defineStore('ui', {
  state: (): UiState => ({
    theme: 'dark',
    sidebarCollapsed: false,
    commandPaletteOpen: false,
    toasts: [],
    confirmState: { open: false, title: '', message: '', resolve: null },
  }),

  actions: {
    hydrate(): void {
      try {
        const theme = localStorage.getItem('orch8.theme') as Theme | null
        if (theme === 'dark' || theme === 'light') this.theme = theme
        this.sidebarCollapsed = localStorage.getItem('orch8.sidebar') === 'collapsed'
      } catch {
        /* noop */
      }
      this.applyTheme()
    },

    applyTheme(): void {
      if (typeof document !== 'undefined') {
        document.documentElement.dataset.theme = this.theme
      }
    },

    setTheme(theme: Theme): void {
      this.theme = theme
      this.applyTheme()
      try {
        localStorage.setItem('orch8.theme', theme)
      } catch {
        /* noop */
      }
    },

    toggleTheme(): void {
      this.setTheme(this.theme === 'dark' ? 'light' : 'dark')
    },

    toggleSidebar(): void {
      this.sidebarCollapsed = !this.sidebarCollapsed
      try {
        localStorage.setItem('orch8.sidebar', this.sidebarCollapsed ? 'collapsed' : 'expanded')
      } catch {
        /* noop */
      }
    },

    openCommandPalette(): void {
      this.commandPaletteOpen = true
    },
    closeCommandPalette(): void {
      this.commandPaletteOpen = false
    },

    // --- toasts ---
    pushToast(tone: ToastTone, title: string, message?: string, timeout = 5000): number {
      const id = ++toastSeq
      this.toasts.push({ id, tone, title, message, timeout })
      if (timeout > 0) {
        setTimeout(() => this.dismissToast(id), timeout)
      }
      return id
    },
    dismissToast(id: number): void {
      const idx = this.toasts.findIndex((t) => t.id === id)
      if (idx !== -1) this.toasts.splice(idx, 1)
    },
    success(title: string, message?: string): number {
      return this.pushToast('success', title, message)
    },
    error(title: string, message?: string): number {
      return this.pushToast('error', title, message, 8000)
    },
    warning(title: string, message?: string): number {
      return this.pushToast('warning', title, message, 7000)
    },
    info(title: string, message?: string): number {
      return this.pushToast('info', title, message)
    },

    // --- confirm dialog ---
    confirm(options: ConfirmOptions): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        this.confirmState = {
          open: true,
          title: options.title,
          message: options.message,
          confirmText: options.confirmText ?? 'Confirm',
          cancelText: options.cancelText ?? 'Cancel',
          tone: options.tone ?? 'default',
          resolve,
        }
      })
    },
    resolveConfirm(ok: boolean): void {
      this.confirmState.resolve?.(ok)
      this.confirmState = { open: false, title: '', message: '', resolve: null }
    },
  },
})
