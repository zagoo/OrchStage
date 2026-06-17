/**
 * Unit tests for useAsync composable.
 * Tests: success path, error path (ApiError), abort on re-run, reset().
 */
import { describe, it, expect, vi } from 'vitest'
import { effectScope } from 'vue'
import { useAsync } from './useAsync'
import { ApiError } from '@/api/errors'

describe('useAsync', () => {
  describe('success path', () => {
    it('sets data and loaded=true after a successful run', async () => {
      const fetcher = vi.fn().mockResolvedValue({ value: 42 })
      const { data, loaded, loading, error, run } = useAsync(fetcher)

      expect(loaded.value).toBe(false)
      expect(loading.value).toBe(false)

      const result = await run()

      expect(result).toEqual({ value: 42 })
      expect(data.value).toEqual({ value: 42 })
      expect(loaded.value).toBe(true)
      expect(loading.value).toBe(false)
      expect(error.value).toBeNull()
    })

    it('clears error state on successful re-run after a failure', async () => {
      let failFirst = true
      const fetcher = vi.fn().mockImplementation(() => {
        if (failFirst) {
          failFirst = false
          return Promise.reject(new ApiError(500, { code: 'server_error', message: 'boom' }))
        }
        return Promise.resolve('ok')
      })
      const { error, errorText, data, run } = useAsync(fetcher)
      await run()
      expect(error.value).not.toBeNull()

      await run()
      expect(error.value).toBeNull()
      expect(errorText.value).toBe('')
      expect(data.value).toBe('ok')
    })
  })

  describe('error path', () => {
    it('sets error and errorText when fetcher throws an ApiError', async () => {
      const apiErr = new ApiError(404, { code: 'not_found', message: 'Instance not found' })
      const fetcher = vi.fn().mockRejectedValue(apiErr)
      const { error, errorText, data, loaded, run } = useAsync(fetcher)

      const result = await run()

      expect(result).toBeNull()
      expect(data.value).toBeNull()
      expect(loaded.value).toBe(false)
      expect(error.value).toBe(apiErr)
      expect(errorText.value).toBe('Instance not found')
    })

    it('wraps non-ApiError thrown values into ApiError.network', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('connection refused'))
      const { error, errorText, run } = useAsync(fetcher)

      await run()

      expect(error.value).toBeInstanceOf(ApiError)
      expect(error.value!.code).toBe('network_error')
      expect(errorText.value).toBe('connection refused')
    })

    it('wraps string errors', async () => {
      const fetcher = vi.fn().mockRejectedValue('raw string error')
      const { error, errorText, run } = useAsync(fetcher)
      await run()
      expect(error.value).toBeInstanceOf(ApiError)
      expect(errorText.value).toBe('raw string error')
    })

    it('does not set error when AbortError DOMException is thrown', async () => {
      const abortError = new DOMException('Aborted', 'AbortError')
      const fetcher = vi.fn().mockRejectedValue(abortError)
      const { error, run } = useAsync(fetcher)
      await run()
      expect(error.value).toBeNull()
    })
  })

  describe('re-run aborts previous request', () => {
    it('aborts the in-flight request when run() is called again', async () => {
      let capturedSignal: AbortSignal | null = null
      // First call hangs; second resolves immediately
      let resolveFirst!: (v: string) => void
      const firstPromise = new Promise<string>((res) => {
        resolveFirst = res
      })

      const fetcher = vi.fn().mockImplementationOnce((signal: AbortSignal) => {
        capturedSignal = signal
        return firstPromise
      }).mockResolvedValueOnce('second result')

      const { data, run } = useAsync(fetcher)

      // Start first run (don't await)
      const p1 = run()
      // Start second run immediately
      const p2 = run()

      // Resolve the first promise after abort
      resolveFirst('first result')

      await Promise.all([p1, p2])

      // Signal from first run should have been aborted
      expect((capturedSignal as AbortSignal | null)?.aborted).toBe(true)
      // data should be from second run
      expect(data.value).toBe('second result')
    })
  })

  describe('reset()', () => {
    it('clears all state after a successful run', async () => {
      const fetcher = vi.fn().mockResolvedValue('hello')
      const { data, loaded, error, errorText, loading, run, reset } = useAsync(fetcher)
      await run()

      expect(data.value).toBe('hello')
      expect(loaded.value).toBe(true)

      reset()

      expect(data.value).toBeNull()
      expect(loaded.value).toBe(false)
      expect(error.value).toBeNull()
      expect(errorText.value).toBe('')
      expect(loading.value).toBe(false)
    })

    it('clears error state on reset', async () => {
      const fetcher = vi.fn().mockRejectedValue(new ApiError(500, { code: 'err', message: 'fail' }))
      const { error, errorText, run, reset } = useAsync(fetcher)
      await run()
      expect(error.value).not.toBeNull()

      reset()
      expect(error.value).toBeNull()
      expect(errorText.value).toBe('')
    })

    it('aborts in-flight request when reset is called', () => {
      let capturedSignal: AbortSignal | null = null
      const fetcher = vi.fn().mockImplementation((signal: AbortSignal) => {
        capturedSignal = signal
        return new Promise(() => {}) // never resolves
      })

      const { run, reset } = useAsync(fetcher)
      void run() // fire-and-forget
      reset()
      expect((capturedSignal as AbortSignal | null)?.aborted).toBe(true)
    })
  })

  describe('scope dispose', () => {
    it('aborts in-flight request when scope is disposed', async () => {
      let capturedSignal: AbortSignal | null = null
      const fetcher = vi.fn().mockImplementation((signal: AbortSignal) => {
        capturedSignal = signal
        return new Promise(() => {})
      })

      const scope = effectScope()
      let runFn!: () => Promise<unknown>
      scope.run(() => {
        const { run } = useAsync(fetcher)
        runFn = run
      })

      void runFn()
      scope.stop()

      expect((capturedSignal as AbortSignal | null)?.aborted).toBe(true)
    })
  })
})
