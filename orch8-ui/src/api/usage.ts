/**
 * Typed endpoint functions for the Usage domain.
 * DESIGN_REFERENCE §Usage (observability.md §GET /usage)
 */
import { http, API_V1 } from '@/api/http'
import type { UsageResponse, UsageQuery } from '@/api/types/observability'

// GET /api/v1/usage — Aggregate LLM token usage and estimated cost
export function getUsage(query: UsageQuery, signal?: AbortSignal): Promise<UsageResponse> {
  return http.get<UsageResponse>(`${API_V1}/usage`, { query, signal })
}
