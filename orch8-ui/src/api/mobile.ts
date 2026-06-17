/**
 * Typed endpoint functions for the Mobile Sync domain.
 * All paths are canonical /api/v1/... form.
 *
 * Conditional surface: routes only exist when ORCH8_MOBILE_SYNC_ENABLED=true
 * on the server. All functions may throw ApiError with status 404 when the
 * feature is disabled — callers must catch and treat 404 as "disabled".
 *
 * DESIGN_REFERENCE §Mobile Sync (inventory.md 2.21, mobile-sync.md)
 */
import { http, API_V1 } from '@/api/http'
import type {
  RegisterDeviceRequest,
  SyncRequest,
  SyncResponse,
  ResolveApprovalRequest,
  CreateCommandRequest,
  ListDevicesQuery,
  ListApprovalsQuery,
  ListStatusQuery,
  ListDevicesResponse,
  ListApprovalsResponse,
  ListStatusResponse,
} from '@/api/types/mobile'

// GET /api/v1/mobile/status — list most-recent device instance statuses
// DESIGN_REFERENCE §mobile-sync.md Endpoint 6
export function getMobileStatus(query?: ListStatusQuery, signal?: AbortSignal): Promise<ListStatusResponse> {
  return http.get<ListStatusResponse>(`${API_V1}/mobile/status`, { query, signal })
}

// GET /api/v1/mobile/devices — list registered mobile devices
// DESIGN_REFERENCE §mobile-sync.md Endpoint 3
export function listDevices(query?: ListDevicesQuery, signal?: AbortSignal): Promise<ListDevicesResponse> {
  return http.get<ListDevicesResponse>(`${API_V1}/mobile/devices`, { query, signal })
}

// POST /api/v1/mobile/devices/register — register or re-register a device (upsert)
// DESIGN_REFERENCE §mobile-sync.md Endpoint 2
export function registerDevice(body: RegisterDeviceRequest, signal?: AbortSignal): Promise<void> {
  return http.post<void>(`${API_V1}/mobile/devices/register`, body, { signal })
}

// GET /api/v1/mobile/approvals — list mobile approval requests
// DESIGN_REFERENCE §mobile-sync.md Endpoint 4
export function listMobileApprovals(query?: ListApprovalsQuery, signal?: AbortSignal): Promise<ListApprovalsResponse> {
  return http.get<ListApprovalsResponse>(`${API_V1}/mobile/approvals`, { query, signal })
}

// POST /api/v1/mobile/approvals/{id}/resolve — resolve a pending approval
// DESIGN_REFERENCE §mobile-sync.md Endpoint 5
export function resolveApproval(id: string, body: ResolveApprovalRequest, signal?: AbortSignal): Promise<void> {
  return http.post<void>(`${API_V1}/mobile/approvals/${encodeURIComponent(id)}/resolve`, body, { signal })
}

// POST /api/v1/mobile/commands — send a command to a device
// DESIGN_REFERENCE §mobile-sync.md Endpoint 7
export function createMobileCommand(body: CreateCommandRequest, signal?: AbortSignal): Promise<void> {
  return http.post<void>(`${API_V1}/mobile/commands`, body, { signal })
}

// POST /api/v1/mobile/sync — primary delta-sync operation
// DESIGN_REFERENCE §mobile-sync.md Endpoint 1
export function syncMobile(body: SyncRequest, signal?: AbortSignal): Promise<SyncResponse> {
  return http.post<SyncResponse>(`${API_V1}/mobile/sync`, body, { signal })
}
