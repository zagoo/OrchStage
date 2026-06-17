/**
 * Server-Sent Events reader built on `fetch` (not native EventSource) so we can
 * attach the `X-API-Key` / `X-Tenant-Id` auth headers that EventSource cannot.
 * Used by the instance live-stream view (GET .../stream).
 */
import { rawFetch } from './http'
import { ApiError } from './errors'
import type { QueryParams } from './query'

export interface SseMessage {
  event: string
  data: string
  id?: string
}

export interface SseHandlers {
  onOpen?: () => void
  onMessage: (msg: SseMessage) => void
  onError?: (err: ApiError) => void
  onClose?: () => void
}

export interface SseHandle {
  close: () => void
}

/**
 * Open an SSE stream. Returns a handle with `close()`. Reconnection policy is
 * intentionally left to the caller (the streaming store) so it can apply
 * backoff and respect terminal instance states.
 */
export function openEventStream(path: string, handlers: SseHandlers, query?: QueryParams): SseHandle {
  const controller = new AbortController()
  let closed = false

  const close = () => {
    if (closed) return
    closed = true
    controller.abort()
    handlers.onClose?.()
  }

  void (async () => {
    try {
      const res = await rawFetch(path, { headers: { Accept: 'text/event-stream' }, signal: controller.signal }, query)
      if (!res.ok || !res.body) {
        const raw = await res.text().catch(() => '')
        throw new ApiError(res.status, { code: `http_${res.status}`, message: raw || 'Failed to open stream' })
      }
      handlers.onOpen?.()

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let sep: number
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const msg = parseFrame(frame)
          if (msg) handlers.onMessage(msg)
        }
      }
      close()
    } catch (err) {
      if (closed || (err instanceof DOMException && err.name === 'AbortError')) return
      handlers.onError?.(err instanceof ApiError ? err : ApiError.network('Stream connection lost'))
    }
  })()

  return { close }
}

function parseFrame(frame: string): SseMessage | null {
  let event = 'message'
  let id: string | undefined
  const dataLines: string[] = []
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const idx = line.indexOf(':')
    const field = idx === -1 ? line : line.slice(0, idx)
    const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '')
    if (field === 'event') event = value
    else if (field === 'data') dataLines.push(value)
    else if (field === 'id') id = value
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n'), id }
}
