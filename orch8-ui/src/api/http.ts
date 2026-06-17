/**
 * Configurable Orch8 HTTP client.
 *
 * Auth model (see DESIGN_REFERENCE §Global Conventions): every request may
 * carry `X-API-Key` (root/admin or tenant-scoped key) and `X-Tenant-Id`.
 * Callers pass FULL paths (e.g. `/api/v1/instances`, `/health/ready`) so the
 * mapping to canonical vs legacy/non-versioned routes stays explicit and
 * traceable. Config is module-level and updated by the connection store.
 */
import { parseErrorBody, ApiError } from './errors'
import { buildQuery, type QueryInput } from './query'

export const API_V1 = '/api/v1'

export interface HttpConfig {
  /** Origin of the orch8-server. Empty string => same origin (dev proxy). */
  baseUrl: string
  apiKey: string | null
  tenantId: string | null
}

const config: HttpConfig = {
  baseUrl: '',
  apiKey: null,
  tenantId: null,
}

export function setHttpConfig(patch: Partial<HttpConfig>): void {
  Object.assign(config, patch)
}

export function getHttpConfig(): Readonly<HttpConfig> {
  return config
}

export function buildHeaders(extra?: HeadersInit, hasBody = false): Headers {
  const h = new Headers(extra)
  h.set('Accept', 'application/json')
  if (hasBody && !h.has('Content-Type')) h.set('Content-Type', 'application/json')
  if (config.apiKey) h.set('X-API-Key', config.apiKey)
  if (config.tenantId) h.set('X-Tenant-Id', config.tenantId)
  return h
}

export function resolveUrl(path: string, query?: QueryInput): string {
  const base = config.baseUrl.replace(/\/$/, '')
  return `${base}${path}${buildQuery(query)}`
}

export interface RequestOptions {
  query?: QueryInput
  body?: unknown
  signal?: AbortSignal
  headers?: HeadersInit
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const hasBody = opts.body !== undefined && method !== 'GET' && method !== 'HEAD'
  let res: Response
  try {
    res = await fetch(resolveUrl(path, opts.query), {
      method,
      headers: buildHeaders(opts.headers, hasBody),
      body: hasBody ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw ApiError.network(err instanceof Error ? err.message : 'Network request failed')
  }

  const requestId = res.headers.get('x-request-id') ?? undefined

  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    throw parseErrorBody(res.status, raw, requestId)
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }

  const text = await res.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    // Non-JSON success body (rare: plain text endpoints like /metrics).
    return text as unknown as T
  }
}

/** Raw fetch with auth headers injected — for SSE streams and binary downloads. */
export function rawFetch(path: string, init: RequestInit = {}, query?: QueryInput): Promise<Response> {
  return fetch(resolveUrl(path, query), {
    ...init,
    headers: buildHeaders(init.headers, init.body !== undefined),
  })
}

export const http = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('PATCH', path, { ...opts, body }),
  del: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
  request,
}
