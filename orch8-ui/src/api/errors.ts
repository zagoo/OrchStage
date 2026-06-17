/**
 * Canonical Orch8 API error handling.
 *
 * The orch8-api error envelope is tolerant-parsed here: the server returns a
 * JSON body shaped roughly like `{ "error": { "code", "message", "details" } }`
 * (and some legacy paths return `{ "code", "message" }` or a bare string).
 * `ApiError` normalises all of these into one type the UI can branch on.
 */

export interface ApiErrorShape {
  code: string
  message: string
  details?: unknown
  requestId?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown
  readonly requestId?: string

  constructor(status: number, shape: ApiErrorShape) {
    super(shape.message)
    this.name = 'ApiError'
    this.status = status
    this.code = shape.code
    this.details = shape.details
    this.requestId = shape.requestId
  }

  /** Network/abort/parse failures that never reached an HTTP status. */
  static network(message: string): ApiError {
    return new ApiError(0, { code: 'network_error', message })
  }

  get isAuth(): boolean {
    return this.status === 401 || this.status === 403
  }

  get isNotFound(): boolean {
    return this.status === 404
  }

  get isConflict(): boolean {
    return this.status === 409
  }

  get isValidation(): boolean {
    return this.status === 400 || this.status === 422
  }

  get isRateLimited(): boolean {
    return this.status === 429
  }

  /** 5xx / network — generally safe to offer a retry. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

/** Best-effort extraction of a human-facing message from any thrown value. */
export function errorMessage(err: unknown): string {
  if (isApiError(err)) return err.message
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'An unexpected error occurred.'
}

/** Parse an arbitrary error response body into a normalised shape. */
export function parseErrorBody(status: number, raw: string, requestId?: string): ApiError {
  let shape: ApiErrorShape = {
    code: `http_${status}`,
    message: raw?.trim() || `Request failed with status ${status}`,
    requestId,
  }
  try {
    const json = JSON.parse(raw) as unknown
    if (json && typeof json === 'object') {
      const obj = json as Record<string, unknown>
      const env = (obj.error && typeof obj.error === 'object' ? obj.error : obj) as Record<string, unknown>
      const code = typeof env.code === 'string' ? env.code : shape.code
      const message =
        typeof env.message === 'string'
          ? env.message
          : typeof obj.message === 'string'
            ? (obj.message as string)
            : shape.message
      shape = { code, message, details: env.details ?? obj.details, requestId }
    }
  } catch {
    /* leave the plain-text fallback shape in place */
  }
  return new ApiError(status, shape)
}
