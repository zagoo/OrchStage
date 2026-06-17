/**
 * Unit tests for parsePgTimestamp in mobile.ts.
 */
import { describe, it, expect } from 'vitest'
import { parsePgTimestamp } from './mobile'

describe('parsePgTimestamp', () => {
  it('returns null for null input', () => {
    expect(parsePgTimestamp(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(parsePgTimestamp(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parsePgTimestamp('')).toBeNull()
  })

  it('parses Postgres-formatted "YYYY-MM-DD HH:MM:SS" as UTC', () => {
    const result = parsePgTimestamp('2024-03-15 14:30:00')
    expect(result).toBeInstanceOf(Date)
    expect(result!.toISOString()).toBe('2024-03-15T14:30:00.000Z')
  })

  it('parses ISO 8601 format (with T separator)', () => {
    const result = parsePgTimestamp('2024-03-15T14:30:00Z')
    expect(result).toBeInstanceOf(Date)
    expect(result!.toISOString()).toBe('2024-03-15T14:30:00.000Z')
  })

  it('returns null for invalid date strings', () => {
    expect(parsePgTimestamp('not-a-date')).toBeNull()
  })

  it('returns null for malformed timestamp', () => {
    expect(parsePgTimestamp('9999-99-99 99:99:99')).toBeNull()
  })

  it('handles midnight timestamps', () => {
    const result = parsePgTimestamp('2024-01-01 00:00:00')
    expect(result).toBeInstanceOf(Date)
    expect(result!.toISOString()).toBe('2024-01-01T00:00:00.000Z')
  })

  it('handles end-of-day timestamps', () => {
    const result = parsePgTimestamp('2024-12-31 23:59:59')
    expect(result).toBeInstanceOf(Date)
    expect(result!.toISOString()).toBe('2024-12-31T23:59:59.000Z')
  })

  it('handles leap year dates', () => {
    const result = parsePgTimestamp('2024-02-29 12:00:00')
    expect(result).toBeInstanceOf(Date)
    expect(result!.getUTCMonth()).toBe(1) // February (0-indexed)
    expect(result!.getUTCDate()).toBe(29)
  })
})
