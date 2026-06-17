/**
 * Unit tests for runtime helper functions in common.ts.
 * Tests: isJsonObject, asItems.
 */
import { describe, it, expect } from 'vitest'
import { isJsonObject, asItems } from './common'

describe('isJsonObject', () => {
  it('returns true for plain objects', () => {
    expect(isJsonObject({})).toBe(true)
    expect(isJsonObject({ a: 1 })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isJsonObject(null)).toBe(false)
  })

  it('returns false for arrays', () => {
    expect(isJsonObject([])).toBe(false)
    expect(isJsonObject([1, 2, 3])).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isJsonObject('string')).toBe(false)
    expect(isJsonObject(42)).toBe(false)
    expect(isJsonObject(true)).toBe(false)
    expect(isJsonObject(undefined)).toBe(false)
  })
})

describe('asItems', () => {
  it('returns a bare array as-is', () => {
    const items = [{ id: 1 }, { id: 2 }]
    expect(asItems(items)).toBe(items)
  })

  it('extracts items from a Page<T> wrapper', () => {
    const payload = { items: [{ id: 'a' }, { id: 'b' }], next_cursor: null, total: 2 }
    expect(asItems(payload)).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('returns empty array for null', () => {
    expect(asItems(null)).toEqual([])
  })

  it('returns empty array for undefined', () => {
    expect(asItems(undefined)).toEqual([])
  })

  it('returns empty array for a plain object without items field', () => {
    expect(asItems({ data: [1, 2] })).toEqual([])
  })

  it('returns empty array for a string', () => {
    expect(asItems('hello')).toEqual([])
  })

  it('returns empty array for a number', () => {
    expect(asItems(42)).toEqual([])
  })

  it('returns empty array when items is not an array', () => {
    expect(asItems({ items: 'not-an-array' })).toEqual([])
  })

  it('handles empty array payload', () => {
    expect(asItems([])).toEqual([])
  })

  it('handles an object with empty items array', () => {
    expect(asItems({ items: [] })).toEqual([])
  })
})
