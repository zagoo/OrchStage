/**
 * Model pricing module.
 * There is NO HTTP endpoint for the pricing table — it is a static in-process
 * table in the Rust server (model_pricing.rs). This module re-exports the
 * hard-coded default table and provides a client-side lookup utility matching
 * the server's longest-prefix matching algorithm.
 * DESIGN_REFERENCE §Model Pricing (observability.md §Model Pricing Reference)
 */
import { MODEL_PRICING_TABLE } from '@/api/types/observability'
import type { ModelPrice } from '@/api/types/observability'

export { MODEL_PRICING_TABLE }
export type { ModelPrice }

/**
 * Normalize a model name the same way the server does:
 * trim, lowercase, strip a provider prefix (e.g. "anthropic/").
 */
export function normalizeModelName(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  const slashIdx = trimmed.indexOf('/')
  return slashIdx !== -1 ? trimmed.slice(slashIdx + 1) : trimmed
}

/**
 * Look up pricing for a model using the server's longest-prefix match rule.
 * A key matches if the normalized name starts with the key AND the remainder
 * is either empty or begins with a non-alphanumeric separator character.
 * Returns null when no prefix matches (unknown model).
 * DESIGN_REFERENCE §Model Pricing — lookup algorithm
 */
export function priceForModel(model: string): ModelPrice | null {
  const normalized = normalizeModelName(model)
  let best: ModelPrice | null = null
  for (const entry of MODEL_PRICING_TABLE) {
    if (!normalized.startsWith(entry.prefix)) continue
    const remainder = normalized.slice(entry.prefix.length)
    if (remainder !== '' && /^[a-z0-9]/.test(remainder)) continue // alphanumeric continuation blocks match
    if (best === null || entry.prefix.length > best.prefix.length) {
      best = entry
    }
  }
  return best
}

/**
 * Estimate USD cost for the given token counts.
 * Returns null when the model is unknown (no prefix match).
 */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const price = priceForModel(model)
  if (!price) return null
  return (inputTokens / 1_000_000) * price.input_per_1m +
    (outputTokens / 1_000_000) * price.output_per_1m
}
