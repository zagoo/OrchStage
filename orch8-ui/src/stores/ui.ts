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

/** Tri-state result of a confirm dialog: the primary action, an optional alternate action, or cancel. */
export type ConfirmResult = 'confirm' | 'alt' | 'cancel'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  /** Optional THIRD action (e.g. "Overwrite"); when set the dialog renders an extra button. */
  altText?: string
  cancelText?: string
  tone?: 'danger' | 'default'
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
  resolve: ((result: ConfirmResult) => void) | null
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
    /** Binary confirm: resolves true only for the primary action. */
    confirm(options: ConfirmOptions): Promise<boolean> {
      return this.confirmChoice(options).then((r) => r === 'confirm')
    },
    /** Tri-state confirm: resolves 'confirm' | 'alt' | 'cancel' (set `altText` to show the alt button). */
    confirmChoice(options: ConfirmOptions): Promise<ConfirmResult> {
      return new Promise<ConfirmResult>((resolve) => {
        this.confirmState = {
          open: true,
          title: options.title,
          message: options.message,
          confirmText: options.confirmText ?? 'Confirm',
          altText: options.altText,
          cancelText: options.cancelText ?? 'Cancel',
          tone: options.tone ?? 'default',
          resolve,
        }
      })
    },
    /** Resolve the open dialog. Accepts a ConfirmResult, or a boolean for back-compat (true→confirm, false→cancel). */
    resolveConfirm(result: ConfirmResult | boolean): void {
      const r: ConfirmResult = result === true ? 'confirm' : result === false ? 'cancel' : result
      this.confirmState.resolve?.(r)
      this.confirmState = { open: false, title: '', message: '', resolve: null }
    },
  },
})
