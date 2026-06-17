## Mobile Sync Surface

> **Conditional mount.** All routes in this section are registered only when the environment variable `ORCH8_MOBILE_SYNC_ENABLED=true` (or `=1`) is set on the server process. When the variable is absent or any other value, the routes return 404 as if they never existed. Source: `orch8-server/src/main.rs:224-245`, `orch8-api/src/lib.rs:135-136`.

> **No utoipa macros.** None of the seven operations below carry `#[utoipa::path(...)]` annotations. They do not appear in the auto-generated OpenAPI spec. The Vue 3 UI must implement clients for them from this document alone.

> **Auth model.** Every handler accepts the same `OptionalTenant` extractor (type alias `Option<axum::Extension<TenantContext>>`). When a tenant API key is supplied via `X-API-Key` and `X-Tenant-Id`, the extracted `tenant_id` gates cross-tenant operations. When the root/admin key is used without `X-Tenant-Id`, `tenant_id` resolves to the empty string and cross-tenant scope checks are skipped ("fall-open insecure mode"). Source: `orch8-api/src/auth.rs:21`.

---

### Route Summary

| # | Method | Canonical path | Legacy path | Handler fn | Auth scope |
|---|--------|---------------|-------------|------------|------------|
| 1 | POST | `/api/v1/mobile/sync` | `/mobile/sync` | `handle_sync` | Optional tenant |
| 2 | POST | `/api/v1/mobile/devices/register` | `/mobile/devices/register` | `register_device` | Optional tenant |
| 3 | GET | `/api/v1/mobile/devices` | `/mobile/devices` | `list_devices` | Optional tenant |
| 4 | GET | `/api/v1/mobile/approvals` | `/mobile/approvals` | `list_approvals` | Optional tenant |
| 5 | POST | `/api/v1/mobile/approvals/{id}/resolve` | `/mobile/approvals/{id}/resolve` | `resolve_approval` | Optional tenant |
| 6 | GET | `/api/v1/mobile/status` | `/mobile/status` | `list_status` | Optional tenant |
| 7 | POST | `/api/v1/mobile/commands` | `/mobile/commands` | `create_command` | Optional tenant |

---

### Endpoint 1 — POST /mobile/sync

**Handler:** `handle_sync`

**Purpose:** The primary delta-sync operation. The mobile device batches up to five categories of data in one request and receives pending server commands in response. Designed as the mobile device's heartbeat — it also serves as the pull mechanism for the command inbox.

#### Request body (`Content-Type: application/json`)

```typescript
interface SyncRequest {
  device_id: string;           // required — identifies the calling device
  status_updates?: StatusUpdatePayload[];   // default []
  approval_requests?: ApprovalRequestPayload[];  // default []
  step_delegations?: StepDelegationPayload[];     // default []
  command_acks?: string[];     // default [] — IDs of previously received commands being acknowledged
}

interface StatusUpdatePayload {
  instance_id: string;         // required
  sequence_name?: string;      // optional
  state: string;               // required — e.g. "running", "waiting", "completed"
  current_step?: string;       // optional — block_id of the step currently executing
  handler?: string;            // optional — handler name of current step
  timestamp: string;           // required — ISO 8601 string from the device clock
  context_summary?: unknown;   // optional — arbitrary JSON
  steps?: unknown;             // optional — JSON array: [{block_id, block_type, state, handler, started_at, completed_at}]
}

interface ApprovalRequestPayload {
  instance_id: string;         // required
  block_id: string;            // required — identifies the wait_for_input step
  sequence_name?: string;      // optional
  prompt?: string;             // optional — human-readable question shown to approver
  choices?: unknown;           // optional — JSON array/object of allowed values
  store_as?: string;           // optional — context key where the resolution will be stored
  timeout_seconds?: number;    // optional — i64; approval expires after this many seconds
  metadata?: unknown;          // optional — arbitrary JSON passed through
}

interface StepDelegationPayload {
  request_id: string;          // required — correlation ID; echoed back in the step_result command
  instance_id: string;         // required
  block_id: string;            // required
  handler: string;             // required — handler name to execute server-side
  params: unknown;             // required — arbitrary JSON; may contain credentials:// references
}
```

#### Business rules for `SyncRequest`

1. **Array length cap.** Each of `status_updates`, `approval_requests`, `step_delegations`, and `command_acks` must contain at most 500 items. Exceeding any limit returns `400 Bad Request` with message `"sync arrays must each contain at most 500 items"`. Source: `mobile_sync.rs:95-109`.

2. **Status upsert.** Each `StatusUpdatePayload` is upserted into `mobile_instance_status` keyed by `(device_id, instance_id)`. Newer writes overwrite older ones unconditionally. The `timestamp` field from the payload becomes the stored `updated_at` — the server does not impose its own timestamp. Source: `mobile_sync.rs:113-132`.

3. **Approval de-duplication.** Each `ApprovalRequestPayload` is inserted with `ON CONFLICT(device_id, instance_id, block_id) DO NOTHING`. A second sync carrying the same triple is silently ignored. The server generates a new UUID for the approval `id`. State is always set to `"pending"` at insert time. Source: `postgres/mobile_sync.rs:302-321`.

4. **Step delegation — credential resolution.** For each `StepDelegationPayload`, the server resolves any `credentials://` URI references embedded in `params` by calling `orch8_engine::credentials::resolve_in_value`. The resolved values are secret and never stored on the device. If resolution fails, a `step_result` command with `"success": false` is enqueued immediately. On success, a `step_result` command with `"success": true` and `"resolved_params": {...}` is enqueued. Source: `mobile_sync.rs:166-223`.

5. **Command acknowledgement.** IDs in `command_acks` are bulk-acknowledged (stamped `acked_at = now()`) scoped to the calling `device_id`. A device cannot ack another device's commands. Source: `mobile_sync.rs:225-230`, `postgres/mobile_sync.rs:566-589`.

6. **Command fetch.** After processing the payload, the server fetches up to **50** pending (unacked) commands for the device, ordered by `created_at ASC`. Source: `mobile_sync.rs:232-235`, `postgres/mobile_sync.rs:530-563`.

7. **`last_sync_at` update.** On every successful sync, `mobile_devices.last_sync_at` is stamped to `now()` for the calling `device_id`. No error is raised if the device is not registered — the update is a no-op. Source: `mobile_sync.rs:237-240`.

8. **Adaptive `sync_interval_secs`.** If the server has no pending commands for the device, `sync_interval_secs` is `30`. If there are pending commands, `sync_interval_secs` is `5`. Clients should treat this as a hint for when to issue the next sync call. Source: `mobile_sync.rs:242`.

#### Success response — 200 OK

```typescript
interface SyncResponse {
  commands: CommandPayload[];
  sync_interval_secs: number;   // u32 — 5 (commands pending) or 30 (idle)
}

interface CommandPayload {
  id: string;
  type: string;         // serde rename: "command_type" -> "type" in JSON
  payload: unknown;     // parsed from the stored JSON string; null if unparseable
}
```

**Known `type` values produced by the server:**

| `type` | Emitted by | `payload` shape |
|--------|-----------|-----------------|
| `step_result` | `handle_sync` (step delegation path) | `{request_id, instance_id, block_id, handler?, resolved_params?, success: bool, error?: string}` |
| `complete_step` | `resolve_approval` | `{instance_id, block_id, step_name, output: unknown}` |
| any | `create_command` (operator-injected) | arbitrary |

#### Error responses

| Status | Condition |
|--------|-----------|
| 400 Bad Request | Any sync array exceeds 500 items |
| 500 Internal Server Error | Storage failure (internal error details redacted from body) |
| 503 Service Unavailable | Database connection failure |

---

### Endpoint 2 — POST /mobile/devices/register

**Handler:** `register_device`

**Purpose:** Register or re-register a mobile device. Idempotent — uses `ON CONFLICT(device_id) DO UPDATE`, so calling with the same `device_id` updates the push token, platform, app version, and resets `active` to `true`. Source: `postgres/mobile_sync.rs:17-34`.

#### Request body

```typescript
interface RegisterDeviceRequest {
  device_id: string;           // required — client-generated stable device identifier
  push_token?: string;         // optional — APNs device token or FCM registration token
  platform: string;            // required — "ios" or "android" (not validated server-side; stored verbatim)
  app_version?: string;        // optional — semver string, e.g. "2.3.1"
}
```

#### Business rules

1. **Upsert semantics.** On conflict on `device_id`, the row is updated: `push_token`, `platform`, `app_version` are overwritten; `active` is reset to `TRUE`. `tenant_id` is set from the extracted tenant context (empty string when root key without `X-Tenant-Id`). `registered_at` is **not** updated on re-registration — it retains the original timestamp.
2. **Push token is optional.** Devices without push tokens can still use the polling sync path. Push notifications are only attempted if a `push_token` is present in the stored row at notification time.

#### Success response — 201 Created

Empty body.

#### Error responses

| Status | Condition |
|--------|-----------|
| 500 Internal Server Error | Storage failure |
| 503 Service Unavailable | Database connection failure |

---

### Endpoint 3 — GET /mobile/devices

**Handler:** `list_devices`

**Purpose:** List registered mobile devices, optionally filtered by tenant.

#### Query parameters

| Name | Type | Required | Default | Constraints | Notes |
|------|------|----------|---------|-------------|-------|
| `tenant_id` | string | No | — | — | Ignored when an authenticated tenant context is present (context wins) |
| `limit` | number (u32) | No | 100 | Max 500 (clamped server-side) | Results ordered by `registered_at DESC` |

#### Auth note

When a tenant key is presented, the tenant context overrides the `tenant_id` query param. A root key may pass `tenant_id` explicitly to scope the listing. Source: `mobile_sync.rs:325-330`.

#### Success response — 200 OK

```typescript
interface ListDevicesResponse {
  items: MobileDevice[];
  total: number;  // count of items in this response (not a global count)
}

interface MobileDevice {
  device_id: string;
  tenant_id: string;
  push_token: string | null;
  platform: string;
  app_version: string | null;
  active: boolean;
  last_sync_at: string | null;    // "YYYY-MM-DD HH24:MI:SS" UTC — null if never synced
  registered_at: string;          // "YYYY-MM-DD HH24:MI:SS" UTC
}
```

**Note on timestamp format:** The PostgreSQL implementation formats timestamps as `'YYYY-MM-DD HH24:MI:SS'` (not ISO 8601 with `T` separator). TypeScript clients should parse with `new Date(val.replace(' ', 'T') + 'Z')`. Source: `postgres/mobile_sync.rs:52-53`.

#### Error responses

| Status | Condition |
|--------|-----------|
| 500 Internal Server Error | Storage failure |
| 503 Service Unavailable | Database connection failure |

---

### Endpoint 4 — GET /mobile/approvals

**Handler:** `list_approvals`

**Purpose:** List approval requests (pending human input at a `wait_for_input` step), optionally filtered by tenant and state. This is the operator dashboard feed for approval workitems.

#### Query parameters

| Name | Type | Required | Default | Constraints | Notes |
|------|------|----------|---------|-------------|-------|
| `tenant_id` | string | No | — | — | Ignored when authenticated tenant context is present |
| `state` | string | No | — (all states) | — | One of: `"pending"`, `"resolved"`, `"expired"` |
| `limit` | number (u32) | No | 100 | Max 500 (clamped) | Results ordered by `created_at DESC` |

#### Success response — 200 OK

```typescript
interface ListApprovalsResponse {
  items: MobileApprovalRequest[];
  total: number;  // count of items in this response
}

interface MobileApprovalRequest {
  id: string;                    // server-generated UUID
  device_id: string;
  tenant_id: string;
  instance_id: string;
  block_id: string;
  sequence_name: string | null;
  prompt: string | null;
  choices: string | null;         // stored as JSON string; parse before rendering
  store_as: string | null;
  timeout_secs: number | null;    // i64
  metadata: string | null;        // stored as JSON string; parse before rendering
  state: string;                  // "pending" | "resolved" | "expired"
  resolution: string | null;      // JSON string of the output value; null until resolved
  created_at: string;             // "YYYY-MM-DD HH24:MI:SS" UTC
  resolved_at: string | null;     // "YYYY-MM-DD HH24:MI:SS" UTC; null until resolved
}
```

**`choices` and `metadata` parsing note:** Both fields are stored as serialized JSON strings (not native JSONB). Clients must call `JSON.parse(item.choices)` before rendering. Source: `mobile_sync.rs:144-150`.

#### Error responses

| Status | Condition |
|--------|-----------|
| 500 Internal Server Error | Storage failure |
| 503 Service Unavailable | Database connection failure |

---

### Endpoint 5 — POST /mobile/approvals/{id}/resolve

**Handler:** `resolve_approval`

**Purpose:** Resolve a pending approval, providing an output value. This is the primary operator action — it transitions the approval from `"pending"` to `"resolved"`, persists the output, enqueues a `complete_step` command to the originating device, and fires a silent push notification.

#### Path parameters

| Name | Type | Description |
|------|------|-------------|
| `id` | string | Approval request ID (server-generated UUID) |

#### Request body

```typescript
interface ResolveApprovalRequest {
  output: unknown;   // required — arbitrary JSON; becomes the resolution value and the step output
}
```

#### Business rules

1. **Read-before-write for tenant ownership.** The approval is fetched first. If not found, `404` is returned. If `state != "pending"`, `404` is returned (with message `"approval {id} not found or already resolved"`). If the caller has a non-empty `tenant_id` and it does not match `approval.tenant_id`, `404` is returned — same error message to prevent cross-tenant enumeration. Source: `mobile_sync.rs:406-429`.

2. **Idempotency gap.** There is a narrow window between the `get_mobile_approval` read and the `resolve_mobile_approval` update where a concurrent caller could resolve the same approval. If the update finds `rows_affected == 0` (concurrent resolve won), the handler returns `404` with `"approval {id} not found or already resolved"`. Source: `mobile_sync.rs:441-447`.

3. **Command enqueue.** On success, a `complete_step` command is inserted into `mobile_commands` for the approval's originating `device_id`. The payload is `{instance_id, block_id, step_name, output}` where `step_name` is a copy of `block_id`. Source: `mobile_sync.rs:449-469`.

4. **Silent push (fire-and-forget).** After enqueuing the command, the handler looks up the device's `push_token`. If present, `push_provider.send_silent_push(token, platform)` is spawned as a background task. Push failure is logged as a warning but does not fail the HTTP response. Source: `mobile_sync.rs:471-489`.

5. **Approval state machine:**

   ```
   pending  -->  resolved  (via POST /mobile/approvals/{id}/resolve)
   pending  -->  expired   (via background GC: expire_mobile_approvals)
   ```
   Terminal states: `resolved`, `expired`. No transition out of terminal states.

#### Success response — 200 OK

Empty body.

#### Error responses

| Status | Condition | Body |
|--------|-----------|------|
| 404 Not Found | Approval not found, already resolved/expired, or cross-tenant | `{"error": "not found: approval {id} not found or already resolved"}` |
| 500 Internal Server Error | Storage failure (message redacted) | `{"error": "internal server error"}` |
| 503 Service Unavailable | Database connection failure | `{"error": "unavailable: ..."}` |

---

### Endpoint 6 — GET /mobile/status

**Handler:** `list_status`

**Purpose:** List the most recent instance status records reported by mobile devices. Useful for the operator dashboard to see which instances are actively running on which devices.

#### Query parameters

| Name | Type | Required | Default | Constraints | Notes |
|------|------|----------|---------|-------------|-------|
| `tenant_id` | string | No | — | — | Filters via a JOIN to `mobile_devices.tenant_id`; ignored when authenticated tenant context is present |
| `device_id` | string | No | — | — | Filter to a single device |
| `limit` | number (u32) | No | 100 | Max 500 (clamped) | Results ordered by `updated_at DESC` |

#### Success response — 200 OK

```typescript
interface ListStatusResponse {
  items: MobileInstanceStatus[];
  total: number;
}

interface MobileInstanceStatus {
  device_id: string;
  instance_id: string;
  sequence_name: string | null;
  state: string;               // e.g. "running" | "waiting" | "completed" — device-reported, not validated
  current_step: string | null; // block_id of step currently executing
  handler: string | null;      // handler name of current step
  context_summary: string | null;  // JSON string; parse before use
  steps: string | null;            // JSON string: [{block_id, block_type, state, handler, started_at, completed_at}]
  updated_at: string;              // "YYYY-MM-DD HH24:MI:SS" UTC
}
```

**`context_summary` and `steps` parsing note:** Stored as serialized JSON strings. Clients must call `JSON.parse(item.steps)` before rendering. Source: `mobile_sync.rs:121-126`.

#### Error responses

| Status | Condition |
|--------|-----------|
| 500 Internal Server Error | Storage failure |
| 503 Service Unavailable | Database connection failure |

---

### Endpoint 7 — POST /mobile/commands

**Handler:** `create_command`

**Purpose:** Operator-injected command — enqueue an arbitrary command to a specific device's command inbox. Used for server-side control: pause, resume, cancel, or any custom command the device application understands. Also triggers a silent push notification.

#### Request body

```typescript
interface CreateCommandRequest {
  device_id: string;        // required — target device
  command_type: string;     // required — arbitrary string; device interprets it
  payload: unknown;         // required — arbitrary JSON command payload
}
```

#### Business rules

1. **Tenant ownership check.** If the caller has a non-empty `tenant_id`, the device is looked up. If the device does not exist or `device.tenant_id != tenant_id`, `404` is returned. An empty `tenant_id` (root key / insecure mode) skips this check. Source: `mobile_sync.rs:559-572`.

2. **Command ID.** A new UUID v4 is generated server-side for each command. Source: `mobile_sync.rs:574`.

3. **Silent push (fire-and-forget).** Same behavior as `resolve_approval`: if the device has a `push_token`, `send_silent_push` is spawned as a background task. Push failure is logged as a warning but does not fail the HTTP response. Source: `mobile_sync.rs:590-607`.

#### Success response — 201 Created

Empty body.

#### Error responses

| Status | Condition | Body |
|--------|-----------|------|
| 404 Not Found | Device not found or cross-tenant | `{"error": "not found: device {device_id} not found"}` |
| 500 Internal Server Error | Storage failure (message redacted) | `{"error": "internal server error"}` |
| 503 Service Unavailable | Database connection failure | `{"error": "unavailable: ..."}` |

---

### Entity Reference

#### Table: `mobile_devices`

Migration: `engine/migrations/038_mobile_sync.sql`.

| Column | Type (PG) | TS type | PK | NOT NULL | Default | Notes |
|--------|-----------|---------|----|---------|---------|----|
| `device_id` | TEXT | string | Yes | Yes | — | Client-generated stable device ID |
| `tenant_id` | TEXT | string | No | Yes | `''` | Empty string in root/insecure mode |
| `push_token` | TEXT | string \| null | No | No | — | APNs device token or FCM registration token |
| `platform` | TEXT | string | No | Yes | `'ios'` | Stored verbatim; not enum-constrained in DB |
| `app_version` | TEXT | string \| null | No | No | — | Semver string |
| `active` | BOOLEAN | boolean | No | Yes | `TRUE` | Set to `FALSE` by GC sweeper when stale |
| `last_sync_at` | TIMESTAMPTZ | string \| null | No | No | — | Stamped on every successful `POST /mobile/sync` |
| `registered_at` | TIMESTAMPTZ | string | No | Yes | `now()` | Set on first registration only |

**Constraints:** PK on `device_id`.

**GC behavior:** `mark_stale_devices_inactive(threshold_secs)` sets `active = FALSE` for devices where `last_sync_at < now() - threshold`. Not invoked from any HTTP endpoint; expected to be called from a background maintenance task.

---

#### Table: `mobile_instance_status`

| Column | Type (PG) | TS type | PK | NOT NULL | Notes |
|--------|-----------|---------|----|---------|----|
| `device_id` | TEXT | string | Composite | Yes | FK to `mobile_devices` (no DB-enforced constraint) |
| `instance_id` | TEXT | string | Composite | Yes | Workflow instance ID |
| `sequence_name` | TEXT | string \| null | No | No | Name of the running sequence |
| `state` | TEXT | string | No | Yes | Device-reported state string |
| `current_step` | TEXT | string \| null | No | No | `block_id` of current step |
| `handler` | TEXT | string \| null | No | No | Handler name of current step |
| `context_summary` | TEXT | string \| null | No | No | JSON string |
| `steps` | TEXT | string \| null | No | No | JSON array string of step tree entries |
| `updated_at` | TIMESTAMPTZ | string | No | Yes | Device-supplied timestamp from `StatusUpdatePayload.timestamp` |

**Constraints:** Composite PK `(device_id, instance_id)`. Upsert on conflict overwrites all non-key columns.

**Index:** No explicit indexes beyond PK.

---

#### Table: `mobile_approval_requests`

| Column | Type (PG) | TS type | PK | NOT NULL | Default | Notes |
|--------|-----------|---------|----|---------|---------|----|
| `id` | TEXT | string | Yes | Yes | — | Server-generated UUID v4 |
| `device_id` | TEXT | string | No | Yes | — | Originating device |
| `tenant_id` | TEXT | string | No | Yes | `''` | Extracted from auth context at insert |
| `instance_id` | TEXT | string | No | Yes | — | Workflow instance |
| `block_id` | TEXT | string | No | Yes | — | `wait_for_input` block ID |
| `sequence_name` | TEXT | string \| null | No | No | — | |
| `prompt` | TEXT | string \| null | No | No | — | Display text for operator |
| `choices` | TEXT | string \| null | No | No | — | JSON string of allowed values |
| `store_as` | TEXT | string \| null | No | No | — | Context key for the result |
| `timeout_secs` | INTEGER | number \| null | No | No | — | Seconds until `expired` |
| `metadata` | TEXT | string \| null | No | No | — | Arbitrary JSON string |
| `state` | TEXT | string | No | Yes | `'pending'` | `"pending"` \| `"resolved"` \| `"expired"` |
| `resolution` | TEXT | string \| null | No | No | — | JSON string of the output value |
| `created_at` | TIMESTAMPTZ | string | No | Yes | `now()` | |
| `resolved_at` | TIMESTAMPTZ | string \| null | No | No | — | Stamped when state → `"resolved"` |

**Constraints:**
- PK: `id`
- UNIQUE: `(device_id, instance_id, block_id)` — prevents duplicate approval requests for the same step on the same device
- INDEX: `idx_mobile_approvals_state ON mobile_approval_requests(state)` — optimises GC expiry sweeps
- INDEX: `idx_mobile_approvals_device ON mobile_approval_requests(device_id)` — optimises per-device listings

**State machine:**

```
  INSERT → "pending"
  "pending" → "resolved"  via POST /mobile/approvals/{id}/resolve
  "pending" → "expired"   via expire_mobile_approvals() background GC
                           (condition: timeout_secs IS NOT NULL AND
                            created_at + interval timeout_secs < now())
  "resolved" → (terminal)
  "expired"  → (terminal)
```

---

#### Table: `mobile_commands`

| Column | Type (PG) | TS type | PK | NOT NULL | Default | Notes |
|--------|-----------|---------|----|---------|---------|----|
| `id` | TEXT | string | Yes | Yes | — | Server-generated UUID v4 |
| `device_id` | TEXT | string | No | Yes | — | Target device |
| `command_type` | TEXT | string | No | Yes | — | `"step_result"`, `"complete_step"`, or operator-defined |
| `payload` | TEXT | string | No | Yes | `'{}'` | JSON string |
| `created_at` | TIMESTAMPTZ | string | No | Yes | `now()` | |
| `acked_at` | TIMESTAMPTZ | string \| null | No | No | — | Stamped when device sends command ID in `command_acks` |

**Constraints:** PK: `id`

**Index:** `idx_mobile_commands_device_pending ON mobile_commands(device_id) WHERE acked_at IS NULL` — partial index; critical for `fetch_pending_commands` performance.

**Delivery model:**
- Commands are fetched via sync polling (up to 50 per sync, oldest first).
- A command remains "pending" (`acked_at IS NULL`) until the device acknowledges it via `command_acks` in a subsequent sync.
- Acknowledged commands are cleaned up by `cleanup_acked_commands(older_than_secs)` background GC.
- Unacknowledged commands older than TTL are cleaned by `cleanup_expired_commands(ttl_secs)` background GC. Neither GC method is invoked from any HTTP endpoint.

---

### Push Notification Architecture

Silent push notifications are fire-and-forget side effects triggered by two endpoints: `POST /mobile/approvals/{id}/resolve` and `POST /mobile/commands`.

**`PushProvider` trait** (`orch8-push/src/lib.rs`):

```rust
async fn send_silent_push(token: &str, platform: &str) -> Result<(), PushError>
```

**Implemented providers:**
- `ApnsProvider` — Apple APNs (iOS). Configured via `ApnsConfig{key_pem, key_id, team_id, topic, sandbox}`.
- `FcmProvider` — Firebase Cloud Messaging (Android). Configured via `FcmConfig{project_id, service_account_json}`.
- `NoopPushProvider` — default when neither APNs nor FCM config is provided. Used in the current server binary (`orch8-server/src/main.rs:227`): **no real pushes are sent in the default build**.

**Sequencing:**
1. Resolve approval or create command → insert `mobile_commands` row.
2. Look up `mobile_devices` for the target `device_id` (separate read, not transactional with step 1).
3. If `push_token` is `Some`: `tokio::spawn` a background future that calls `send_silent_push`.
4. HTTP response returns immediately regardless of push outcome.

**TOCTOU note [INFERRED]:** The push token lookup is a separate read after the command insert. If a device deregisters its push token between the command insert and the push lookup, no push is sent — but the command remains in the inbox and will be delivered on the next sync poll.

---

### Conditional Mounting Detail

```
env ORCH8_MOBILE_SYNC_ENABLED=true   → routes registered under /api/v1/mobile/* and /mobile/*
env ORCH8_MOBILE_SYNC_ENABLED=1      → same
env unset / any other value          → routes not registered; all /mobile/* paths return 404
```

The flag is read once at startup in `build_app_state()` (`orch8-server/src/main.rs:224-225`) and stored in `AppState.mobile_sync_enabled` (bool). `build_router()` (`orch8-api/src/lib.rs:135-136`) checks this field once when constructing the axum `Router`. There is no runtime toggle — a restart is required to enable or disable.

The mobile routes are merged into the same `api` sub-router that is then:
1. Nested under `/api/v1` (canonical).
2. Also merged at the root path `/` (legacy backward-compat, deprecated).

Both mounts are conditional on the same flag, so `POST /api/v1/mobile/sync` and `POST /mobile/sync` are either both active or both 404.

---

### TypeScript Interface Stubs

```typescript
// Rust -> TypeScript type mapping notes:
// Uuid        -> string (UUID v4 format)
// DateTime<Utc> -> string ("YYYY-MM-DD HH24:MI:SS" UTC, NOT ISO 8601 with T)
// i64         -> number
// Option<T>   -> T | null
// serde_json::Value -> unknown (parse at use site)
// String stored-as-JSON -> string (must JSON.parse before use)

export interface SyncRequest {
  device_id: string;
  status_updates?: StatusUpdatePayload[];
  approval_requests?: ApprovalRequestPayload[];
  step_delegations?: StepDelegationPayload[];
  command_acks?: string[];
}

export interface StatusUpdatePayload {
  instance_id: string;
  sequence_name?: string;
  state: string;
  current_step?: string;
  handler?: string;
  timestamp: string;
  context_summary?: unknown;
  steps?: unknown;
}

export interface ApprovalRequestPayload {
  instance_id: string;
  block_id: string;
  sequence_name?: string;
  prompt?: string;
  choices?: unknown;
  store_as?: string;
  timeout_seconds?: number;
  metadata?: unknown;
}

export interface StepDelegationPayload {
  request_id: string;
  instance_id: string;
  block_id: string;
  handler: string;
  params: unknown;
}

export interface SyncResponse {
  commands: CommandPayload[];
  sync_interval_secs: number;
}

export interface CommandPayload {
  id: string;
  type: string;  // JSON key is "type" (serde rename from command_type)
  payload: unknown;
}

export interface RegisterDeviceRequest {
  device_id: string;
  push_token?: string;
  platform: string;
  app_version?: string;
}

export interface MobileDevice {
  device_id: string;
  tenant_id: string;
  push_token: string | null;
  platform: string;
  app_version: string | null;
  active: boolean;
  last_sync_at: string | null;
  registered_at: string;
}

export interface MobileApprovalRequest {
  id: string;
  device_id: string;
  tenant_id: string;
  instance_id: string;
  block_id: string;
  sequence_name: string | null;
  prompt: string | null;
  choices: string | null;      // JSON-encoded; call JSON.parse before rendering
  store_as: string | null;
  timeout_secs: number | null;
  metadata: string | null;     // JSON-encoded; call JSON.parse before rendering
  state: 'pending' | 'resolved' | 'expired';
  resolution: string | null;   // JSON-encoded output; call JSON.parse before rendering
  created_at: string;
  resolved_at: string | null;
}

export interface ResolveApprovalRequest {
  output: unknown;
}

export interface MobileInstanceStatus {
  device_id: string;
  instance_id: string;
  sequence_name: string | null;
  state: string;
  current_step: string | null;
  handler: string | null;
  context_summary: string | null;  // JSON-encoded; call JSON.parse before rendering
  steps: string | null;             // JSON-encoded array; call JSON.parse before rendering
  updated_at: string;
}

export interface CreateCommandRequest {
  device_id: string;
  command_type: string;
  payload: unknown;
}

export type ApprovalState = 'pending' | 'resolved' | 'expired';
```

---

### Example Payloads

#### POST /mobile/sync — full request

```json
{
  "device_id": "device-abc123",
  "status_updates": [
    {
      "instance_id": "01HXYZ1234567890ABCDEF0001",
      "sequence_name": "order-fulfillment",
      "state": "running",
      "current_step": "step-notify-warehouse",
      "handler": "http_call",
      "timestamp": "2026-06-17T10:30:00Z",
      "context_summary": {"order_id": "ORD-9991"},
      "steps": [
        {"block_id": "step-validate", "state": "completed"},
        {"block_id": "step-notify-warehouse", "state": "running"}
      ]
    }
  ],
  "approval_requests": [
    {
      "instance_id": "01HXYZ1234567890ABCDEF0002",
      "block_id": "step-manager-approval",
      "sequence_name": "expense-approval",
      "prompt": "Approve $450 expense for team offsite?",
      "choices": ["approve", "reject"],
      "store_as": "manager_decision",
      "timeout_seconds": 86400
    }
  ],
  "step_delegations": [
    {
      "request_id": "req-001",
      "instance_id": "01HXYZ1234567890ABCDEF0003",
      "block_id": "step-call-api",
      "handler": "http_call",
      "params": {
        "url": "https://internal.api/action",
        "headers": {"Authorization": "credentials://my-api-key"}
      }
    }
  ],
  "command_acks": ["cmd-uuid-aaa", "cmd-uuid-bbb"]
}
```

#### POST /mobile/sync — response

```json
{
  "commands": [
    {
      "id": "cmd-uuid-ccc",
      "type": "complete_step",
      "payload": {
        "instance_id": "01HXYZ1234567890ABCDEF0002",
        "block_id": "step-manager-approval",
        "step_name": "step-manager-approval",
        "output": "approve"
      }
    },
    {
      "id": "cmd-uuid-ddd",
      "type": "step_result",
      "payload": {
        "request_id": "req-001",
        "instance_id": "01HXYZ1234567890ABCDEF0003",
        "block_id": "step-call-api",
        "handler": "http_call",
        "resolved_params": {
          "url": "https://internal.api/action",
          "headers": {"Authorization": "Bearer sk-actual-secret"}
        },
        "success": true
      }
    }
  ],
  "sync_interval_secs": 5
}
```

#### POST /mobile/approvals/{id}/resolve

```json
{
  "output": {"decision": "approve", "comment": "Looks good"}
}
```
