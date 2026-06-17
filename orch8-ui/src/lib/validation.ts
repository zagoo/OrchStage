/**
 * Reusable client-side validators that mirror Orch8 backend constraints
 * (see DESIGN_REFERENCE §Business-rule matrix). Each `FieldRule` returns an
 * error string or `null` when valid. Composed by forms via `validateField`.
 *
 * These are pure and exhaustively unit-tested (validation.spec.ts).
 */
import { z } from 'zod'

export type FieldRule = (value: unknown) => string | null

// --- canonical patterns (sourced from orch8-types / orch8-api) ---------------
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Trigger slugs, piece names: `^[a-z0-9][a-z0-9-]*$`. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
/** Sequence/namespace identifiers — letters, digits, `_ . -`, not leading sep. */
export const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}
export function isSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_RE.test(value)
}

/** Lenient cron check (5–7 space-separated fields of allowed glyphs: standard 5,
 *  optional seconds = 6, optional year = 7). The server validates authoritatively;
 *  this catches obvious typos pre-submit. */
export function isCronExpression(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parts = value.trim().split(/\s+/)
  if (parts.length < 5 || parts.length > 7) return false
  return parts.every((p) => /^[0-9*/,\-?LW#A-Za-z]+$/.test(p))
}

export function isValidJson(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (value.trim() === '') return false
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

// --- rule factories ----------------------------------------------------------
const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

export const required = (label = 'This field'): FieldRule => (v) =>
  isEmpty(v) ? `${label} is required.` : null

export const minLength = (n: number, label = 'Value'): FieldRule => (v) =>
  typeof v === 'string' && v.length < n ? `${label} must be at least ${n} characters.` : null

export const maxLength = (n: number, label = 'Value'): FieldRule => (v) =>
  typeof v === 'string' && v.length > n ? `${label} must be at most ${n} characters.` : null

export const pattern = (re: RegExp, message: string): FieldRule => (v) =>
  typeof v === 'string' && v !== '' && !re.test(v) ? message : null

export const uuid = (label = 'ID'): FieldRule => (v) =>
  v !== undefined && v !== '' && !isUuid(v) ? `${label} must be a valid UUID.` : null

export const slug = (label = 'Slug'): FieldRule => (v) =>
  typeof v === 'string' && v !== '' && !SLUG_RE.test(v)
    ? `${label} may contain lowercase letters, digits and hyphens, and must not start with a hyphen.`
    : null

export const identifier = (label = 'Name'): FieldRule => (v) =>
  typeof v === 'string' && v !== '' && !IDENTIFIER_RE.test(v)
    ? `${label} must start alphanumerically and contain only letters, digits, '_', '.', '-'.`
    : null

export const integer = (label = 'Value'): FieldRule => (v) => {
  if (isEmpty(v)) return null
  const n = Number(v)
  return Number.isInteger(n) ? null : `${label} must be a whole number.`
}

export const range = (min: number, max: number, label = 'Value'): FieldRule => (v) => {
  if (isEmpty(v)) return null
  const n = Number(v)
  if (Number.isNaN(n)) return `${label} must be a number.`
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`
  return null
}

export const min = (n: number, label = 'Value'): FieldRule => (v) => {
  if (isEmpty(v)) return null
  return Number(v) < n ? `${label} must be at least ${n}.` : null
}

export const jsonRule = (label = 'Value'): FieldRule => (v) =>
  typeof v === 'string' && v.trim() !== '' && !isValidJson(v) ? `${label} must be valid JSON.` : null

export const cron = (): FieldRule => (v) =>
  typeof v === 'string' && v !== '' && !isCronExpression(v) ? 'Enter a valid cron expression (5–7 fields).' : null

/** Run rules in order; return the first error (or null when all pass). */
export function validateField(value: unknown, rules: FieldRule[]): string | null {
  for (const rule of rules) {
    const err = rule(value)
    if (err) return err
  }
  return null
}

export interface FormErrors {
  [field: string]: string | null
}

/** Validate a record of `field -> rules`; returns `{ errors, valid }`. */
export function validateForm<T extends Record<string, unknown>>(
  values: T,
  schema: Partial<Record<keyof T, FieldRule[]>>,
): { errors: FormErrors; valid: boolean } {
  const errors: FormErrors = {}
  let valid = true
  for (const key of Object.keys(schema) as Array<keyof T>) {
    const rules = schema[key]
    if (!rules) continue
    const err = validateField(values[key], rules)
    errors[key as string] = err
    if (err) valid = false
  }
  return { errors, valid }
}

/** Flatten a Zod error into a `field -> message` map for form binding. */
export function zodErrorMap(error: z.ZodError): FormErrors {
  const out: FormErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    if (!out[key]) out[key] = issue.message
  }
  return out
}

export { z }
