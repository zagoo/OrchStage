/**
 * Typed endpoint functions for the Cron Schedules domain.
 * All paths are canonical /api/v1/… form.
 * DESIGN_REFERENCE §Cron Schedules
 */
import { http, API_V1 } from '@/api/http'
import type {
  CronSchedule,
  CreateCronRequest,
  CreateCronResponse,
  UpdateCronRequest,
  ListCronQuery,
  NextFiresQuery,
  NextFiresResponse,
} from '@/api/types/cron'

// GET /api/v1/cron — List Cron Schedules
export function listCron(query?: ListCronQuery, signal?: AbortSignal): Promise<CronSchedule[]> {
  return http.get<CronSchedule[]>(`${API_V1}/cron`, { query, signal })
}

// POST /api/v1/cron — Create Cron Schedule
export function createCron(body: CreateCronRequest, signal?: AbortSignal): Promise<CreateCronResponse> {
  return http.post<CreateCronResponse>(`${API_V1}/cron`, body, { signal })
}

// GET /api/v1/cron/{id} — Get Cron Schedule
export function getCron(id: string, signal?: AbortSignal): Promise<CronSchedule> {
  return http.get<CronSchedule>(`${API_V1}/cron/${encodeURIComponent(id)}`, { signal })
}

// GET /api/v1/cron/{id}/next-fires — Preview Next Fire Times
export function getCronNextFires(
  id: string,
  query?: NextFiresQuery,
  signal?: AbortSignal,
): Promise<NextFiresResponse> {
  return http.get<NextFiresResponse>(`${API_V1}/cron/${encodeURIComponent(id)}/next-fires`, { query, signal })
}

// PUT /api/v1/cron/{id} — Update Cron Schedule
export function updateCron(
  id: string,
  body: UpdateCronRequest,
  signal?: AbortSignal,
): Promise<CronSchedule> {
  return http.put<CronSchedule>(`${API_V1}/cron/${encodeURIComponent(id)}`, body, { signal })
}

// DELETE /api/v1/cron/{id} — Delete Cron Schedule
export function deleteCron(id: string, signal?: AbortSignal): Promise<void> {
  return http.del<void>(`${API_V1}/cron/${encodeURIComponent(id)}`, { signal })
}
