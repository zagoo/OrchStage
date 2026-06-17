/**
 * Unit tests for useUiStore.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUiStore } from './ui'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useUiStore', () => {
  describe('theme', () => {
    it('toggleTheme switches from dark to light', () => {
      const store = useUiStore()
      expect(store.theme).toBe('dark')
      store.toggleTheme()
      expect(store.theme).toBe('light')
    })

    it('toggleTheme switches from light to dark', () => {
      const store = useUiStore()
      store.setTheme('light')
      store.toggleTheme()
      expect(store.theme).toBe('dark')
    })

    it('applyTheme sets document.documentElement.dataset.theme', () => {
      const store = useUiStore()
      store.setTheme('light')
      expect(document.documentElement.dataset.theme).toBe('light')
      store.setTheme('dark')
      expect(document.documentElement.dataset.theme).toBe('dark')
    })

    it('setTheme persists to localStorage', () => {
      const store = useUiStore()
      store.setTheme('light')
      expect(localStorage.getItem('orch8.theme')).toBe('light')
    })

    it('hydrate() reads theme from localStorage', () => {
      localStorage.setItem('orch8.theme', 'light')
      const store = useUiStore()
      store.hydrate()
      expect(store.theme).toBe('light')
    })

    it('hydrate() ignores invalid theme values', () => {
      localStorage.setItem('orch8.theme', 'monokai')
      const store = useUiStore()
      store.hydrate()
      expect(store.theme).toBe('dark') // default
    })
  })

  describe('sidebar', () => {
    it('toggleSidebar flips sidebarCollapsed', () => {
      const store = useUiStore()
      expect(store.sidebarCollapsed).toBe(false)
      store.toggleSidebar()
      expect(store.sidebarCollapsed).toBe(true)
      store.toggleSidebar()
      expect(store.sidebarCollapsed).toBe(false)
    })

    it('toggleSidebar persists "collapsed" to localStorage', () => {
      const store = useUiStore()
      store.toggleSidebar()
      expect(localStorage.getItem('orch8.sidebar')).toBe('collapsed')
    })

    it('toggleSidebar persists "expanded" to localStorage', () => {
      const store = useUiStore()
      store.toggleSidebar() // collapsed
      store.toggleSidebar() // expanded
      expect(localStorage.getItem('orch8.sidebar')).toBe('expanded')
    })

    it('hydrate() reads sidebar state from localStorage', () => {
      localStorage.setItem('orch8.sidebar', 'collapsed')
      const store = useUiStore()
      store.hydrate()
      expect(store.sidebarCollapsed).toBe(true)
    })
  })

  describe('command palette', () => {
    it('openCommandPalette sets commandPaletteOpen=true', () => {
      const store = useUiStore()
      store.openCommandPalette()
      expect(store.commandPaletteOpen).toBe(true)
    })

    it('closeCommandPalette sets commandPaletteOpen=false', () => {
      const store = useUiStore()
      store.openCommandPalette()
      store.closeCommandPalette()
      expect(store.commandPaletteOpen).toBe(false)
    })
  })

  describe('pushToast / dismissToast', () => {
    it('pushToast adds a toast to the list and returns its id', () => {
      const store = useUiStore()
      const id = store.pushToast('info', 'Hello', 'World', 0)
      expect(store.toasts).toHaveLength(1)
      expect(store.toasts[0].id).toBe(id)
      expect(store.toasts[0].tone).toBe('info')
      expect(store.toasts[0].title).toBe('Hello')
      expect(store.toasts[0].message).toBe('World')
    })

    it('dismissToast removes the toast by id', () => {
      const store = useUiStore()
      const id = store.pushToast('success', 'Done', undefined, 0)
      store.dismissToast(id)
      expect(store.toasts).toHaveLength(0)
    })

    it('dismissToast on unknown id is a no-op', () => {
      const store = useUiStore()
      store.pushToast('info', 'test', undefined, 0)
      expect(() => store.dismissToast(9999)).not.toThrow()
      expect(store.toasts).toHaveLength(1)
    })

    it('auto-dismisses toast after timeout', () => {
      const store = useUiStore()
      const id = store.pushToast('info', 'Auto', undefined, 500)
      expect(store.toasts).toHaveLength(1)
      vi.advanceTimersByTime(500)
      expect(store.toasts.findIndex((t) => t.id === id)).toBe(-1)
    })

    it('multiple toasts coexist and each has unique id', () => {
      const store = useUiStore()
      const id1 = store.pushToast('info', 'A', undefined, 0)
      const id2 = store.pushToast('error', 'B', undefined, 0)
      expect(id1).not.toBe(id2)
      expect(store.toasts).toHaveLength(2)
    })
  })

  describe('toast helper shorthands', () => {
    it('success() pushes a success toast', () => {
      const store = useUiStore()
      store.success('Great')
      expect(store.toasts[0].tone).toBe('success')
    })

    it('error() pushes an error toast with 8s timeout', () => {
      const store = useUiStore()
      store.error('Oops')
      expect(store.toasts[0].tone).toBe('error')
      expect(store.toasts[0].timeout).toBe(8000)
    })

    it('warning() pushes a warning toast with 7s timeout', () => {
      const store = useUiStore()
      store.warning('Be careful')
      expect(store.toasts[0].tone).toBe('warning')
      expect(store.toasts[0].timeout).toBe(7000)
    })

    it('info() pushes an info toast', () => {
      const store = useUiStore()
      store.info('FYI')
      expect(store.toasts[0].tone).toBe('info')
    })
  })

  describe('confirm() / resolveConfirm()', () => {
    it('confirm() returns a promise that resolves true when resolveConfirm(true) is called', async () => {
      const store = useUiStore()
      const p = store.confirm({ title: 'Delete?', message: 'Sure?' })
      expect(store.confirmState.open).toBe(true)
      expect(store.confirmState.title).toBe('Delete?')

      store.resolveConfirm(true)

      await expect(p).resolves.toBe(true)
      expect(store.confirmState.open).toBe(false)
    })

    it('confirm() returns a promise that resolves false when resolveConfirm(false) is called', async () => {
      const store = useUiStore()
      const p = store.confirm({ title: 'Delete?', message: 'Sure?' })
      store.resolveConfirm(false)
      await expect(p).resolves.toBe(false)
    })

    it('resolveConfirm resets confirmState', () => {
      const store = useUiStore()
      store.confirm({ title: 'T', message: 'M' })
      store.resolveConfirm(true)
      expect(store.confirmState.open).toBe(false)
      expect(store.confirmState.title).toBe('')
      expect(store.confirmState.resolve).toBeNull()
    })

    it('confirm() uses provided confirmText and cancelText', async () => {
      const store = useUiStore()
      store.confirm({ title: 'X', message: 'Y', confirmText: 'Yes!', cancelText: 'No!' })
      expect(store.confirmState.confirmText).toBe('Yes!')
      expect(store.confirmState.cancelText).toBe('No!')
      store.resolveConfirm(false)
    })

    it('confirm() defaults confirmText to "Confirm" and cancelText to "Cancel"', async () => {
      const store = useUiStore()
      store.confirm({ title: 'X', message: 'Y' })
      expect(store.confirmState.confirmText).toBe('Confirm')
      expect(store.confirmState.cancelText).toBe('Cancel')
      store.resolveConfirm(true)
    })

    it('resolveConfirm is safe to call when no confirm is pending', () => {
      const store = useUiStore()
      expect(() => store.resolveConfirm(true)).not.toThrow()
    })
  })
})
