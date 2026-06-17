/**
 * Typed endpoint functions for the Telemetry domain.
 * DESIGN_REFERENCE §Telemetry (observability.md)
 */
import { http, API_V1 } from '@/api/http'
import type {
  IngestTelemetryRequest,
  IngestTelemetryResponse,
  IngestErrorRequest,
  DashboardQuery,
  DashboardResponse,
} from '@/api/types/observability'

// POST /api/v1/telemetry/mobile — Ingest mobile telemetry events (max 500)
export function ingestTelemetry(
  body: IngestTelemetryRequest,
  signal?: AbortSignal,
): Promise<IngestTelemetryResponse> {
  return http.post<IngestTelemetryResponse>(`${API_V1}/telemetry/mobile`, body, { signal })
}

// POST /api/v1/telemetry/mobile/errors — Ingest mobile SDK error report
// Returns 202 with no body; may trigger async auto-rollback check (BR-TEL-4)
export function ingestTelemetryError(
  body: IngestErrorRequest,
  signal?: AbortSignal,
): Promise<void> {
  return http.post<void>(`${API_V1}/telemetry/mobile/errors`, body, { signal })
}

// GET /api/v1/telemetry/mobile/dashboard — Query telemetry dashboard aggregations
export function getDashboard(query: DashboardQuery, signal?: AbortSignal): Promise<DashboardResponse> {
  return http.get<DashboardResponse>(`${API_V1}/telemetry/mobile/dashboard`, { query, signal })
}
