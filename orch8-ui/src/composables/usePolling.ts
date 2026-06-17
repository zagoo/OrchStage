import { ref, onScopeDispose, type Ref } from 'vue'

export interface UsePollingOptions {
  intervalMs?: number
  immediate?: boolean
  /** Pause polling while the browser tab is hidden (default true). */
  pauseWhenHidden?: boolean
}

export interface UsePolling {
  active: Ref<boolean>
  start: () => void
  stop: () => void
  /** Trigger one immediate run without disturbing the timer. */
  tick: () => void
}

/**
 * Interval poller for live operator views (instance lists, worker stats, …).
 * Skips overlapping runs, pauses on tab blur, and cleans up on dispose.
 */
export function usePolling(task: () => unknown, options: UsePollingOptions = {}): UsePolling {
  const { intervalMs = 5000, immediate = true, pauseWhenHidden = true } = options
  const active = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null
  let running = false

  async function tick(): Promise<void> {
    if (running) return
    if (pauseWhenHidden && typeof document !== 'undefined' && document.hidden) return
    running = true
    try {
      await task()
    } finally {
      running = false
    }
  }

  function start(): void {
    if (active.value) return
    active.value = true
    if (immediate) void tick()
    timer = setInterval(() => void tick(), intervalMs)
  }

  function stop(): void {
    active.value = false
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  onScopeDispose(stop)

  return { active, start, stop, tick: () => void tick() }
}
