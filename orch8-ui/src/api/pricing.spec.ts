/**
 * Unit tests for the pricing module (client-side static table + utilities).
 * There is no HTTP endpoint for the pricing table — tests cover the lookup
 * algorithm and cost estimate utility that mirrors the server implementation.
 * DESIGN_REFERENCE §Model Pricing (observability.md §Model Pricing Reference)
 */
import { describe, it, expect } from 'vitest'
import { normalizeModelName, priceForModel, estimateCostUsd, MODEL_PRICING_TABLE } from './pricing'

// --- normalizeModelName -------------------------------------------------------

describe('normalizeModelName', () => {
  it('lowercases and trims', () => {
    expect(normalizeModelName('  GPT-4o  ')).toBe('gpt-4o')
  })

  it('strips anthropic/ provider prefix', () => {
    expect(normalizeModelName('anthropic/claude-sonnet-4')).toBe('claude-sonnet-4')
  })

  it('strips any provider prefix containing a slash', () => {
    expect(normalizeModelName('openai/gpt-4o')).toBe('gpt-4o')
  })

  it('leaves names without a slash unchanged', () => {
    expect(normalizeModelName('gpt-4o')).toBe('gpt-4o')
  })
})

// --- priceForModel (longest-prefix match) ------------------------------------

describe('priceForModel', () => {
  it('returns null for completely unknown models (BR-USG-4)', () => {
    expect(priceForModel('totally-unknown-model')).toBeNull()
  })

  it('matches gpt-4o for gpt-4o-2024-08-06 (alphanumeric separator allows fallback)', () => {
    const price = priceForModel('gpt-4o-2024-08-06')
    expect(price?.prefix).toBe('gpt-4o')
    expect(price?.input_per_1m).toBe(2.50)
  })

  it('prefers gpt-4o-mini over gpt-4o for gpt-4o-mini-2024-07-18 (longest prefix wins)', () => {
    const price = priceForModel('gpt-4o-mini-2024-07-18')
    expect(price?.prefix).toBe('gpt-4o-mini')
    expect(price?.input_per_1m).toBe(0.15)
  })

  it('gpt-4o2 does NOT match gpt-4o (alphanumeric continuation blocks match)', () => {
    expect(priceForModel('gpt-4o2')).toBeNull()
  })

  it('resolves claude-sonnet-4-6 to claude-sonnet-4 (dash is separator)', () => {
    const price = priceForModel('claude-sonnet-4-6')
    expect(price?.prefix).toBe('claude-sonnet-4')
    expect(price?.input_per_1m).toBe(3.00)
  })

  it('resolves claude-haiku-4-5 to its own entry (longer prefix wins over claude-haiku)', () => {
    const price = priceForModel('claude-haiku-4-5')
    expect(price?.prefix).toBe('claude-haiku-4-5')
    expect(price?.input_per_1m).toBe(1.00)
  })

  it('strips anthropic/ prefix before lookup', () => {
    const price = priceForModel('anthropic/claude-sonnet-4')
    expect(price?.prefix).toBe('claude-sonnet-4')
  })

  it('is case-insensitive (GPT-4o → gpt-4o)', () => {
    const price = priceForModel('GPT-4o')
    expect(price?.prefix).toBe('gpt-4o')
  })

  it('exact prefix match returns that entry', () => {
    const price = priceForModel('gpt-4o')
    expect(price?.prefix).toBe('gpt-4o')
  })

  it('returns prices for all entries in the table (table completeness check)', () => {
    for (const entry of MODEL_PRICING_TABLE) {
      const found = priceForModel(entry.prefix)
      expect(found?.prefix, `Expected prefix "${entry.prefix}" to match itself`).toBe(entry.prefix)
    }
  })
})

// --- estimateCostUsd ---------------------------------------------------------

describe('estimateCostUsd', () => {
  it('returns null for unknown model (BR-USG-4)', () => {
    expect(estimateCostUsd('no-such-model', 100_000, 50_000)).toBeNull()
  })

  it('computes cost for gpt-4o correctly', () => {
    // gpt-4o: $2.50/1M input, $10.00/1M output
    // 1_000_000 input + 500_000 output → $2.50 + $5.00 = $7.50
    const cost = estimateCostUsd('gpt-4o', 1_000_000, 500_000)
    expect(cost).toBeCloseTo(7.50, 6)
  })

  it('computes cost for claude-sonnet-4 correctly', () => {
    // claude-sonnet-4: $3.00/1M input, $15.00/1M output
    // 100_000 input + 25_000 output → $0.30 + $0.375 = $0.675
    const cost = estimateCostUsd('claude-sonnet-4', 100_000, 25_000)
    expect(cost).toBeCloseTo(0.675, 6)
  })

  it('returns 0 cost for 0 tokens', () => {
    expect(estimateCostUsd('gpt-4o', 0, 0)).toBe(0)
  })

  it('handles provider-prefixed model names', () => {
    const direct = estimateCostUsd('claude-sonnet-4', 100_000, 25_000)
    const prefixed = estimateCostUsd('anthropic/claude-sonnet-4', 100_000, 25_000)
    expect(prefixed).toBe(direct)
  })
})
