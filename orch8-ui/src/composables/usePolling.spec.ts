/**
 * Unit tests for usePolling composable.
 * Uses vi.useFakeTimers() for interval control.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { usePolling } from './usePolling'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  // Restore document.hidden to false
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})

describe('usePolling', () => {
  describe('immediate=true (default)', () => {
    it('runs task immediately on start()', async () => {
      const task = vi.fn().mockResolvedValue(undefined)
      const { start } = usePolling(task, { immediate: true, intervalMs: 1000 })

      start()
      await Promise.resolve() // flush microtask

      expect(task).toHaveBeenCalledTimes(1)
    })

    it('active ref is true after start()', () => {
      const task = vi.fn().mockResolvedValue(undefined)
      const { start, active } = usePolling(task, { intervalMs: 1000 })
      expect(active.value).toBe(false)
      start()
      expect(active.value).toBe(true)
    })
  })

  describe('immediate=false', () => {
    it('does NOT run task immediately when immediate=false', async () => {
      const task = vi.fn().mockResolvedValue(undefined)
      const { start } = usePolling(task, { immediate: false, intervalMs: 1000 })

      start()
      await Promise.resolve()

      expect(task).toHaveBeenCalledTimes(0)
    })
  })

  describe('interval', () => {
    it('triggers task repeatedly on each interval tick', async () => {
      const task = vi.fn().mockResolvedValue(undefined)
      const { start } = usePolling(task, { immediate: false, intervalMs: 500 })

      start()
      expect(task).toHaveBeenCalledTimes(0)

      vi.advanceTimersByTime(500)
      await Promise.resolve()
      expect(task).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(500)
      await Promise.resolve()
      expect(task).toHaveBeenCalledTimes(2)

      vi.advanceTimersByTime(500)
      await Promise.resolve()
      expect(task).toHaveBeenCalledTimes(3)
    })
  })

  describe('stop()', () => {
    it('halts subsequent interval ticks', async () => {
      const task = vi.fn().mockResolvedValue(undefined)
      const { start, stop, active } = usePolling(task, { immediate: false, intervalMs: 500 })

      start()
      vi.advanceTimersByTime(500)
      await Promise.resolve()
      expect(task).toHaveBeenCalledTimes(1)

      stop()
      expect(active.value).toBe(false)

      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      // task should not be called again after stop
      expect(task).toHaveBeenCalledTimes(1)
    })

    it('start() is idempotent — double start does not double-schedule', async () => {
      const task = vi.fn().mockResolvedValue(undefined)
      const { start } = usePolling(task, { immediate: false, intervalMs: 500 })

      start()
      start() // second call should be no-op

      vi.advanceTimersByTime(500)
      await Promise.resolve()
      // only one timer running, task called once per tick
      expect(task).toHaveBeenCalledTimes(1)
    })
  })

  describe('pauses when document.hidden', () => {
    it('skips task execution when document is hidden', async () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })

      const task = vi.fn().mockResolvedValue(undefined)
      const { start } = usePolling(task, { immediate: false, intervalMs: 500, pauseWhenHidden: true })

      start()
      vi.advanceTimersByTime(1000)
      await Promise.resolve()

      expect(task).toHaveBeenCalledTimes(0)
    })

    it('runs task when pauseWhenHidden=false even if document is hidden', async () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })

      const task = vi.fn().mockResolvedValue(undefined)
      const { start } = usePolling(task, { immediate: false, intervalMs: 500, pauseWhenHidden: false })

      start()
      vi.advanceTimersByTime(500)
      await Promise.resolve()

      expect(task).toHaveBeenCalledTimes(1)
    })
  })

  describe('no overlapping runs', () => {
    it('skips tick if previous task is still running', async () => {
      let resolve!: () => void
      const hangingPromise = new Promise<void>((r) => { resolve = r })
      const task = vi.fn().mockReturnValueOnce(hangingPromise).mockResolvedValue(undefined)

      const { start } = usePolling(task, { immediate: true, intervalMs: 500 })
      start()
      await Promise.resolve() // first immediate call starts (still hanging)

      expect(task).toHaveBeenCalledTimes(1)

      // Interval fires while first is still running — should be skipped
      vi.advanceTimersByTime(500)
      await Promise.resolve()
      expect(task).toHaveBeenCalledTimes(1)

      // Resolve first task
      resolve()
      await Promise.resolve()

      // Next interval should now run
      vi.advanceTimersByTime(500)
      await Promise.resolve()
      expect(task).toHaveBeenCalledTimes(2)
    })
  })

  describe('tick()', () => {
    it('manually triggers one run without disturbing the timer', async () => {
      const task = vi.fn().mockResolvedValue(undefined)
      const { start, tick } = usePolling(task, { immediate: false, intervalMs: 5000 })

      start()
      expect(task).toHaveBeenCalledTimes(0)

      tick()
      await Promise.resolve()
      expect(task).toHaveBeenCalledTimes(1)

      // Timer still running — advance to next interval
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
      expect(task).toHaveBeenCalledTimes(2)
    })
  })

  describe('scope dispose', () => {
    it('stops polling when the effect scope is disposed', async () => {
      const task = vi.fn().mockResolvedValue(undefined)
      const scope = effectScope()
      scope.run(() => {
        const { start } = usePolling(task, { immediate: false, intervalMs: 500 })
        start()
      })

      vi.advanceTimersByTime(500)
      await Promise.resolve()
      expect(task).toHaveBeenCalledTimes(1)

      scope.stop()

      vi.advanceTimersByTime(500)
      await Promise.resolve()
      expect(task).toHaveBeenCalledTimes(1)
    })
  })
})
