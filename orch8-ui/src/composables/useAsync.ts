import { ref, shallowRef, onScopeDispose, type Ref } from 'vue'
import { ApiError, errorMessage } from '@/api/errors'

export interface UseAsyncState<T> {
  data: Ref<T | null>
  error: Ref<ApiError | null>
  errorText: Ref<string>
  loading: Ref<boolean>
  loaded: Ref<boolean>
  run: () => Promise<T | null>
  reset: () => void
}

/**
 * Run an abortable async fetcher with reactive loading/error/data state.
 * Re-running aborts the in-flight request. Auto-aborts on scope dispose.
 */
export function useAsync<T>(fetcher: (signal: AbortSignal) => Promise<T>): UseAsyncState<T> {
  const data = shallowRef<T | null>(null)
  const error = ref<ApiError | null>(null)
  const errorText = ref('')
  const loading = ref(false)
  const loaded = ref(false)
  let controller: AbortController | null = null

  async function run(): Promise<T | null> {
    controller?.abort()
    controller = new AbortController()
    const local = controller
    loading.value = true
    error.value = null
    errorText.value = ''
    try {
      const result = await fetcher(local.signal)
      if (local.signal.aborted) return null
      data.value = result
      loaded.value = true
      return result
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      if (local.signal.aborted) return null
      error.value = err instanceof ApiError ? err : ApiError.network(errorMessage(err))
      errorText.value = errorMessage(err)
      return null
    } finally {
      if (!local.signal.aborted) loading.value = false
    }
  }

  function reset(): void {
    controller?.abort()
    data.value = null
    error.value = null
    errorText.value = ''
    loading.value = false
    loaded.value = false
  }

  onScopeDispose(() => controller?.abort())

  return { data, error, errorText, loading, loaded, run, reset }
}
