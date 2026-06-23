/**
 * Shared parser for the optional "inject signals" textarea used by the Fork and
 * resume-from-block flows. Both endpoints accept `signals: [{signal_type, payload}]`
 * enqueued atomically before the instance becomes runnable (engine resume-from /
 * fork). An empty input means "no signals".
 */
import type { InjectedSignal } from '@/api/types/instances'

/** Built-in signal kinds the engine accepts as a bare string (verified against
 *  the resume-from/fork enum on orch8-server 0.6.0). A custom signal uses the
 *  object form `{ "custom": "name" }`. */
const BUILTIN_SIGNAL_TYPES = ['pause', 'resume', 'cancel', 'update_context']

/** True for a signal_type the engine will accept: a builtin string, or a
 *  `{ custom: "<non-empty string>" }` object. */
function validSignalType(st: unknown): boolean {
  if (typeof st === 'string') return BUILTIN_SIGNAL_TYPES.includes(st)
  if (st && typeof st === 'object' && !Array.isArray(st)) {
    const c = (st as Record<string, unknown>).custom
    return typeof c === 'string' && c.trim().length > 0
  }
  return false
}

export interface ParsedSignals {
  /** Present only when the input was non-empty AND valid. */
  signals?: InjectedSignal[]
  /** Present when the input was non-empty but malformed. */
  error?: string
}

/**
 * Parse the signals textarea. Empty → `{}` (no signals, no error). Otherwise the
 * value must be a JSON array whose every item is an object with a non-empty
 * string `signal_type` (payload is free-form and optional).
 */
export function parseInjectedSignals(raw: string): ParsedSignals {
  const trimmed = raw.trim()
  if (!trimmed) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { error: 'Invalid JSON.' }
  }

  if (!Array.isArray(parsed)) {
    return { error: 'Signals must be a JSON array.' }
  }

  const ok = parsed.every(
    (v) =>
      !!v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      validSignalType((v as Record<string, unknown>).signal_type),
  )
  if (!ok) {
    return {
      error: 'Each signal needs a signal_type of pause | resume | cancel | update_context, or a { "custom": "name" } object.',
    }
  }

  return { signals: parsed as InjectedSignal[] }
}
