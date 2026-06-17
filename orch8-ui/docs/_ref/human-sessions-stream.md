## Approvals, Sessions & SSE Streaming

This section is the authoritative reference for three tightly related subsystems:

1. **Approvals** — discovering instances paused at a human-in-the-loop (HITL) gate.
2. **Sessions** — CRUD for session objects that group related instances and carry shared data.
3. **SSE Streaming** — real-time per-instance event stream via Server-Sent Events.

Sources: `orch8-api/src/approvals.rs`, `orch8-api/src/sessions.rs`, `orch8-api/src/streaming.rs`, `orch8-types/src/session.rs`, `orch8-engine/src/stream_bus.rs`.

---

### Authentication & Tenant Scoping (All Endpoints)

All business-logic routes live under the canonical prefix `/api/v1/...` and also at `/...` (legacy root, deprecated, to be removed in a future major version). Both prefixes accept the same auth.

| Header | Required | Description |
|---|---|---|
| `X-API-Key` | Yes (unless `--insecure` mode) | Root/admin key or a per-tenant key. |
| `X-Tenant-Id` | Conditional | Required when using the root key and operating on tenant-scoped resources. Per-tenant keys carry the tenant from the key record; the header is validated to match, or rejected `403`. |

Auth error responses:
- `401 Unauthorized` — no valid API key supplied.
- `403 Forbidden` — per-tenant key's tenant conflicts with the `X-Tenant-Id` header, or cross-tenant write attempt.
- `404 Not Found` — cross-tenant read returns 404 (not 403) to avoid leaking foreign resource existence. (Source: `auth.rs:53-64`)

---

## 1. Approvals

### Overview

An **approval** is a workflow instance that has reached a `Step` block whose `wait_for_input` field is set. The engine transitions that step's execution node to `NodeState::Waiting` (tree-path instances) or marks the instance state as `Waiting` (flat-path instances) and halts execution until a human sends the appropriate signal.

The approvals endpoint surfaces every such paused gate as an `ApprovalItem` so operator UIs can display a work queue. **Resolving** an approval is performed by sending a `custom:human_input:{block_id}` signal to the instance — see "Resolving an Approval via Signal" below.

### 1.1 List Pending Approvals

| Field | Value |
|---|---|
| Method | `GET` |
| Canonical path | `/api/v1/approvals` |
| Legacy path | `/approvals` |
| Handler | `list_approvals` |
| Auth scope | Root key or any per-tenant key |

#### Query Parameters

| Parameter | Type | Required | Default | Constraints | Description |
|---|---|---|---|---|---|
| `tenant_id` | string | No | — | — | Filter by tenant. Ignored if `X-Tenant-Id` header is present (header takes precedence). |
| `namespace` | string | No | — | — | Filter by namespace within the tenant. |
| `offset` | u64 | No | `0` | — | Pagination offset (number of items to skip). |
| `limit` | u32 | No | `100` | Clamped to max `1000`. | Maximum number of items to return. |

> **Note (source: `approvals.rs:86-90`):** pagination is sorted descending by `updated_at` (newest-waiting first). This is not configurable via query params.

#### Success Response — `200 OK`

Body: `ApprovalsResponse`

```json
{
  "items": [ /* ApprovalItem[] */ ],
  "total": 3
}
```

> **Note:** `total` reflects the count of items in the current response page, not the global count across all pages. This is computed as `items.len()` after filtering (source: `approvals.rs:171-172`).

#### `ApprovalItem` Schema

| Field | TS Type | Required | Description |
|---|---|---|---|
| `instance_id` | `string` (UUID) | Yes | ID of the paused `TaskInstance`. |
| `tenant_id` | `string` | Yes | Tenant that owns this instance. |
| `namespace` | `string` | Yes | Namespace of the instance. |
| `sequence_id` | `string` (UUID) | Yes | Sequence definition the instance is running. |
| `sequence_name` | `string` | Yes | Human-readable name of the sequence. |
| `block_id` | `string` | Yes | ID of the step block waiting for input. Used to construct the signal name. |
| `prompt` | `string` | Yes | Prompt text to display to the reviewer. |
| `choices` | `HumanChoice[]` | Yes | Allowed response values. Defaults to `[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]` when the sequence definition omits `choices`. |
| `store_as` | `string \| null` | No | Context variable key where the picked value is stored (`context.data[store_as]`). When absent, the engine uses `block_id`. |
| `timeout_seconds` | `number \| null` | No | Seconds until the gate auto-escalates or fails. `null` = indefinite wait. |
| `escalation_handler` | `string \| null` | No | Handler name invoked if timeout fires before a human responds. |
| `waiting_since` | `string` (ISO 8601) | Yes | When the step entered the waiting state. Derived from `node.started_at` (tree path) or `instance.updated_at` (flat path). |
| `deadline` | `string \| null` (ISO 8601) | No | `waiting_since + timeout_seconds`. `null` when no timeout. |
| `metadata` | `unknown` (JSON) | Yes | Full `instance.metadata` blob. Can be used to surface custom fields (priority, requester, etc.). |
| `allow_comment` | `boolean` | Yes | When `true`, the UI should provide a free-text comment field alongside the choice picker. |

#### `HumanChoice` Schema

| Field | TS Type | Description |
|---|---|---|
| `label` | `string` | Display text shown in the UI. |
| `value` | `string` | Stable identifier stored in context and used for router matching. |

#### Error Responses

| Status | Error Code | Trigger |
|---|---|---|
| `401` | — | Missing or invalid `X-API-Key`. |
| `503` | — | Storage connectivity failure (connection pool exhausted or DB unreachable). |

#### Example Response

```json
{
  "items": [
    {
      "instance_id": "018f4e3a-0000-7000-8000-000000000001",
      "tenant_id": "acme-corp",
      "namespace": "onboarding",
      "sequence_id": "018f4e39-0000-7000-8000-000000000002",
      "sequence_name": "customer-kyc",
      "block_id": "review-documents",
      "prompt": "Please review the uploaded KYC documents and approve or reject.",
      "choices": [
        { "label": "Approve", "value": "approve" },
        { "label": "Reject",  "value": "reject"  },
        { "label": "Escalate", "value": "escalate" }
      ],
      "store_as": "kyc_decision",
      "timeout_seconds": 172800,
      "escalation_handler": "notify-compliance-team",
      "waiting_since": "2026-06-17T09:00:00Z",
      "deadline": "2026-06-19T09:00:00Z",
      "metadata": { "customer_id": "cust-42", "risk_score": 0.72 },
      "allow_comment": true
    }
  ],
  "total": 1
}
```

---

### 1.2 Human-in-the-Loop Gate Flow

The approval system does not have a dedicated "resolve approval" endpoint. Resolving is performed by sending a signal to the waiting instance. The full flow is:

```
Sequence defines StepDef.wait_for_input
         |
         v
Engine executes step → NodeState::Waiting (tree) or InstanceState::Waiting (flat)
         |
         v
GET /approvals → lists the ApprovalItem
         |
    Operator picks a choice (and optional comment)
         |
         v
POST /instances/{id}/signals
  {
    "signal_type": "custom:human_input:{block_id}",
    "payload": {
      "choice": "<chosen HumanChoice.value>",
      "comment": "<optional free-text, only if allow_comment=true>"
    }
  }
         |
         v
Engine receives signal → stores choice in context.data[store_as] → resumes step
         |
         v
Instance leaves Waiting state → no longer appears in GET /approvals
```

**Signal name construction:** `custom:human_input:<block_id>` where `<block_id>` is the exact `ApprovalItem.block_id` value. Custom signals require the `custom:` prefix in `signal_type` (source: `signal.rs:46-54`).

**Payload schema for the signal:**

| Field | Type | Required | Description |
|---|---|---|---|
| `choice` | `string` | Yes | Must match one of the `ApprovalItem.choices[].value` strings. |
| `comment` | `string` | No | Free-text reviewer note. Only meaningful when `allow_comment` is `true`; the engine stores it if present regardless. |

See `POST /instances/{id}/signals` in the instances reference for the full signal endpoint spec.

---

### 1.3 Escalation and Timeout

When `HumanInputDef.timeout` is set:

- `ApprovalItem.timeout_seconds` exposes the configured duration.
- `ApprovalItem.deadline` is precomputed as `waiting_since + timeout_seconds`.
- When the deadline passes without a signal, the engine invokes `escalation_handler` (if set) or fails the step directly.
- The UI should compute a countdown from `deadline - now` and prominently warn when it is close.
- [INFERRED] The engine handles timeout enforcement; no separate UI-initiated "escalate" API call is required — the human operator can preemptively send a signal with `choice: "escalate"` if the sequence defines that choice.

---

### 1.4 Flat-Path vs. Tree-Path Instances

The approval handler handles two distinct execution models (source: `approvals.rs:146-169`):

| Path type | Detection | Waiting step identification |
|---|---|---|
| **Flat** | `tree.is_empty()` — no `ExecutionNode` records exist | Walks `sequence.blocks` linearly, skips completed block IDs, picks the first step with `wait_for_input` not yet completed. Only one gate can appear per flat instance at a time (sequential execution). |
| **Tree (DAG)** | Tree nodes present | Scans all `ExecutionNode` records with `state == NodeState::Waiting`; each waiting node with a `wait_for_input` step produces an `ApprovalItem`. Parallel branches can produce multiple items for the same instance simultaneously. |

---

## 2. Sessions

Sessions provide a named, persistent key-value store that groups related instances. All instances attached to a session can read from and write to the shared `data` blob. Sessions have an optional TTL (`expires_at`) and a lifecycle state machine.

### 2.1 Session Entity

Defined in `orch8-types/src/session.rs`.

| Field | TS Type | Nullable / Optional | Description |
|---|---|---|---|
| `id` | `string` (UUID v7) | — | Primary key, assigned server-side at creation. |
| `tenant_id` | `string` | — | Owning tenant. |
| `session_key` | `string` | — | Human-readable lookup key (e.g., `"user:123:onboarding"`). Unique per tenant. Length: 1–512 characters. |
| `data` | `unknown` (JSON) | Default `{}` | Shared data accessible by all instances in the session. |
| `state` | `SessionState` | — | Lifecycle state (see state machine below). |
| `created_at` | `string` (ISO 8601) | — | Creation timestamp. |
| `updated_at` | `string` (ISO 8601) | — | Last modification timestamp. |
| `expires_at` | `string \| undefined` (ISO 8601) | Optional | TTL: session expires after this timestamp. Omitted from JSON when not set. |

#### `SessionState` Enum

Serialized as `snake_case` strings.

| Value | Description |
|---|---|
| `active` | Default state. Session is live and usable. |
| `paused` | Temporarily suspended. Resumable back to `active`. |
| `completed` | Terminal — work is done. |
| `expired` | Terminal — TTL elapsed. |

#### SessionState State Machine

Source: `session.rs:31-60`. No explicit transition guard is enforced at the API layer — the storage layer accepts any state value written via `PATCH /sessions/{id}/state`. The `#[non_exhaustive]` attribute means new states may be added in the future.

```
active  ──resume──> paused
paused  ──resume──> active
active  ──────────> completed   (terminal)
active  ──────────> expired     (terminal)
paused  ──────────> completed   (terminal)
paused  ──────────> expired     (terminal)
```

[INFERRED] Transitions from `completed` or `expired` are not prevented at the API level — `PATCH /sessions/{id}/state` will write any `SessionState` value. Business logic should guard against re-activating terminal sessions if required.

---

### 2.2 Create Session

| Field | Value |
|---|---|
| Method | `POST` |
| Canonical path | `/api/v1/sessions` |
| Legacy path | `/sessions` |
| Handler | `create_session` |
| Auth scope | Root key or per-tenant key |
| Success status | `201 Created` |

#### Request Body (`CreateSessionRequest`)

| Field | TS Type | Required | Default | Constraints | Description |
|---|---|---|---|---|---|
| `tenant_id` | `string` | Yes | — | — | Tenant that owns this session. If `X-Tenant-Id` header is present, must match (else `403`). |
| `session_key` | `string` | Yes | — | Length 1–512 characters. | Human-readable lookup key. Must be non-empty. |
| `data` | `unknown` (JSON) | No | `{}` | — | Initial shared data blob. |
| `expires_at` | `string` (ISO 8601) | No | `null` | — | Optional TTL timestamp. |

#### Validation Rules

1. `session_key` must be between 1 and 512 characters (source: `sessions.rs:50-53`). Returns `400` with body `{"error": "session_key must be between 1 and 512 characters"}`.
2. If `X-Tenant-Id` header is set: `tenant_id` in body must match or be empty. Empty body `tenant_id` defers to the header value (source: `auth.rs:34-48`).
3. `state` is always initialized to `active` — not settable at create time.
4. `id` is always assigned server-side as `Uuid::now_v7()`.

#### Success Response — `201 Created`

Body: the full `Session` object (as documented above).

```json
{
  "id": "018f4e3a-0000-7000-8000-000000000010",
  "tenant_id": "acme-corp",
  "session_key": "user:42:checkout",
  "data": { "cart_items": 3 },
  "state": "active",
  "created_at": "2026-06-17T10:00:00Z",
  "updated_at": "2026-06-17T10:00:00Z",
  "expires_at": "2026-06-18T10:00:00Z"
}
```

#### Error Responses

| Status | Trigger |
|---|---|
| `400 Bad Request` | `session_key` empty or > 512 chars. |
| `403 Forbidden` | Body `tenant_id` contradicts `X-Tenant-Id` header. |
| `409 Conflict` | Session with the same key already exists for the tenant (storage uniqueness constraint). |

---

### 2.3 Get Session by ID

| Field | Value |
|---|---|
| Method | `GET` |
| Canonical path | `/api/v1/sessions/{id}` |
| Legacy path | `/sessions/{id}` |
| Handler | `get_session` |
| Auth scope | Root key or per-tenant key |

#### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Session ID. |

#### Success Response — `200 OK`

Body: `Session` object.

#### Error Responses

| Status | Trigger |
|---|---|
| `404 Not Found` | No session with the given ID, or session belongs to a different tenant than the caller's `X-Tenant-Id`. |

---

### 2.4 Get Session by Key

| Field | Value |
|---|---|
| Method | `GET` |
| Canonical path | `/api/v1/sessions/by-key/{tenant_id}/{key}` |
| Legacy path | `/sessions/by-key/{tenant_id}/{key}` |
| Handler | `get_session_by_key` |
| Auth scope | Root key or per-tenant key |

#### Path Parameters

| Parameter | Type | Constraints | Description |
|---|---|---|---|
| `tenant_id` | `string` | Max 128 characters. | Tenant scope for the key lookup. |
| `key` | `string` | — | The `session_key` to look up. URL-encode if it contains slashes or special characters. |

#### Validation Rules

1. `tenant_id` path segment must be ≤ 128 characters (source: `sessions.rs:110-114`). Returns `400` with `{"error": "tenant_id exceeds maximum length of 128"}`.
2. Cross-tenant access is rejected with `404` (not `403`).

#### Success Response — `200 OK`

Body: `Session` object.

#### Error Responses

| Status | Trigger |
|---|---|
| `400 Bad Request` | `tenant_id` > 128 characters. |
| `404 Not Found` | No session with the key in that tenant, or cross-tenant access. |

---

### 2.5 Update Session Data

| Field | Value |
|---|---|
| Method | `PATCH` |
| Canonical path | `/api/v1/sessions/{id}/data` |
| Legacy path | `/sessions/{id}/data` |
| Handler | `update_session_data` |
| Auth scope | Root key or per-tenant key |

Replaces the session's `data` field with the provided JSON value (full replacement, not a merge).

#### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Session ID. |

#### Request Body (`UpdateSessionDataRequest`)

| Field | TS Type | Required | Description |
|---|---|---|---|
| `data` | `unknown` (JSON) | Yes | New data blob. Replaces the entire existing `data` field. |

#### Success Response — `200 OK`

No body. Empty response.

#### Error Responses

| Status | Trigger |
|---|---|
| `404 Not Found` | Session not found, or cross-tenant access. |

---

### 2.6 Update Session State

| Field | Value |
|---|---|
| Method | `PATCH` |
| Canonical path | `/api/v1/sessions/{id}/state` |
| Legacy path | `/sessions/{id}/state` |
| Handler | `update_session_state` |
| Auth scope | Root key or per-tenant key |

Transitions the session to a new `SessionState`. No transition validation is enforced at the API level — the storage layer accepts any valid `SessionState` value.

#### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Session ID. |

#### Request Body (`UpdateSessionStateRequest`)

| Field | TS Type | Required | Description |
|---|---|---|---|
| `state` | `SessionState` | Yes | One of: `"active"`, `"paused"`, `"completed"`, `"expired"`. |

#### Success Response — `200 OK`

No body. Empty response.

#### Error Responses

| Status | Trigger |
|---|---|
| `400 Bad Request` | Unknown `state` value. |
| `404 Not Found` | Session not found, or cross-tenant access. |

---

### 2.7 List Session Instances

| Field | Value |
|---|---|
| Method | `GET` |
| Canonical path | `/api/v1/sessions/{id}/instances` |
| Legacy path | `/sessions/{id}/instances` |
| Handler | `list_session_instances` |
| Auth scope | Root key or per-tenant key |

Returns all `TaskInstance` objects linked to this session (i.e., `instance.session_id == id`).

#### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Session ID. |

#### Success Response — `200 OK`

Body: `TaskInstance[]` — an array of task instances (see `TaskInstance` schema below).

#### Error Responses

| Status | Trigger |
|---|---|
| `404 Not Found` | Session not found, or cross-tenant access. |

---

### 2.8 TaskInstance Schema (Reference)

`TaskInstance` is the core instance type returned by session and instance endpoints. Defined in `orch8-types/src/instance.rs`.

| Field | TS Type | Optional | Description |
|---|---|---|---|
| `id` | `string` (UUID v7) | — | Instance primary key. |
| `sequence_id` | `string` (UUID) | — | Sequence definition this instance runs. |
| `tenant_id` | `string` | — | Owning tenant. |
| `namespace` | `string` | — | Namespace within the tenant. |
| `state` | `InstanceState` | — | Current lifecycle state (see state machine below). |
| `next_fire_at` | `string \| null` (ISO 8601) | Optional | Scheduled next execution time. `null` when not deferred. |
| `priority` | `Priority` | — | Execution priority. |
| `timezone` | `string` | — | IANA timezone (default `"UTC"`). |
| `metadata` | `unknown` (JSON) | — | Arbitrary caller-supplied metadata blob. |
| `context` | `ExecutionContext` | — | Full execution context (data, config, audit, runtime). |
| `concurrency_key` | `string \| undefined` | Optional | Key for limiting parallel executions. |
| `max_concurrency` | `number \| undefined` | Optional | Max concurrent instances with the same `concurrency_key`. |
| `idempotency_key` | `string \| undefined` | Optional | Deduplication key (unique per tenant at creation time). |
| `session_id` | `string \| undefined` (UUID) | Optional | Links instance to a session. |
| `parent_instance_id` | `string \| undefined` (UUID) | Optional | Set when this is a sub-sequence child instance. |
| `budget` | `Budget \| undefined` | Optional | Resource budget (token/step caps). |
| `created_at` | `string` (ISO 8601) | — | Creation timestamp. |
| `updated_at` | `string` (ISO 8601) | — | Last modification timestamp. |

#### `InstanceState` Enum

Serialized as `snake_case`. Terminal states are `completed`, `failed`, `cancelled`.

| State | Terminal | Description |
|---|---|---|
| `scheduled` | No | Queued for execution. |
| `running` | No | Engine is actively executing steps. |
| `waiting` | No | Paused at a `wait_for_input` gate or sleeping. |
| `paused` | No | Operator-initiated pause (via signal). |
| `completed` | **Yes** | Successful end state. |
| `failed` | **Yes** | Execution failed. |
| `cancelled` | **Yes** | Cancelled by operator. |

#### `InstanceState` Transition Table

Source: `instance.rs:65-95`. Note: `#[non_exhaustive]` — future states may be added.

| From | To (allowed) |
|---|---|
| `scheduled` | `running`, `paused`, `cancelled` |
| `running` | `scheduled`, `waiting`, `completed`, `failed`, `paused`, `cancelled` |
| `waiting` | `running`, `scheduled`, `cancelled`, `failed` |
| `paused` | `scheduled`, `cancelled` |
| `failed` | `scheduled` (retry/DLQ) |
| `completed` | `scheduled` (resume-from-block surgery) |
| `cancelled` | `scheduled` (resume-from-block surgery) |

All other transitions are invalid.

#### `Priority` Enum

| Value | Integer (repr) | Description |
|---|---|---|
| `low` | `0` | — |
| `normal` | `1` | Default. |
| `high` | `2` | — |
| `critical` | `3` | — |

---

## 3. SSE Streaming

### 3.1 Overview

`GET /instances/{id}/stream` opens a **Server-Sent Events** connection that delivers real-time progress for a single workflow instance. The stream combines:

- **Polled events** (`state`, `output`, `done`, `error`) — sourced from storage on a configurable interval.
- **Live events** (`llm_delta`) — forwarded directly from the in-process `StreamBus` without polling.

The stream closes automatically when the instance reaches a terminal state (`completed`, `failed`, `cancelled`).

### 3.2 Stream Instance Events

| Field | Value |
|---|---|
| Method | `GET` |
| Canonical path | `/api/v1/instances/{id}/stream` |
| Legacy path | `/instances/{id}/stream` |
| Handler | `stream_instance` |
| Response content type | `text/event-stream` |
| Auth scope | Root key or per-tenant key |

#### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Instance ID to stream events for. |

#### Query Parameters

| Parameter | Type | Required | Default | Constraints | Description |
|---|---|---|---|---|---|
| `poll_ms` | `number` | No | `500` | Min `100`, max `5000` (clamped, not rejected). | Storage poll interval in milliseconds. Controls how quickly `state` and `output` changes are detected. |

#### Concurrency Limit

A process-wide semaphore (`stream_limiter`) caps concurrent active streams at **256** (source: `lib.rs:46`). When the limit is reached, the request is rejected immediately before the SSE connection is established.

| Status | Trigger |
|---|---|
| `503 Service Unavailable` | Too many concurrent streams. Body: `{"error": "too many concurrent streaming clients; retry later"}` |

#### Pre-Flight Checks

Before returning the SSE stream, the handler:
1. Fetches the instance to verify it exists and enforces tenant access.
2. Acquires a concurrency permit from the semaphore.

| Status | Trigger |
|---|---|
| `404 Not Found` | Instance does not exist or belongs to a different tenant. |
| `401 Unauthorized` | Missing/invalid API key. |

---

### 3.3 SSE Event Types

All events follow the standard SSE format: `event: <type>\ndata: <json>\n\n`. Keepalive comments (`:\n\n`) are sent every **15 seconds** (source: `streaming.rs:302-303`).

#### `state` — Instance State Change

Emitted when the instance's `state` field changes compared to the last seen value. First emission may occur on the initial poll tick after connection.

```
event: state
data: {"instance_id": "<uuid>", "state": "<InstanceState>"}
```

| Field | Type | Description |
|---|---|---|
| `instance_id` | `string` (UUID) | Instance identifier (matches path param). |
| `state` | `string` | New state value (one of `InstanceState` values). |

#### `output` — New Block Output

Emitted for each new `BlockOutput` that appears after the previous poll cursor. Uses an incremental cursor based on `created_at` timestamps with a deduplication set for same-millisecond outputs (source: `streaming.rs:136-279`).

```
event: output
data: <serialized BlockOutput JSON>
```

The `BlockOutput` schema is defined in `orch8-types/src/output.rs` (outside the scope of this file). The payload is the full serialized `BlockOutput` struct. On serialization failure, `{}` is emitted and the stream continues.

#### `llm_delta` — Live LLM Text Delta

Emitted for each incremental text fragment from a streaming `llm_call` step (one with `stream: true`). These are forwarded directly from the `StreamBus` in-process channel — they are **not** polled from storage, and **not** persisted to the durable record. The full accumulated text is available in the subsequent `output` event once the step completes.

```
event: llm_delta
data: {"type": "llm_delta", "block_id": "<string>", "delta": "<string>"}
```

| Field | Type | Description |
|---|---|---|
| `type` | `"llm_delta"` | Discriminator tag. Always `"llm_delta"`. |
| `block_id` | `string` | ID of the `llm_call` block producing the delta. |
| `delta` | `string` | Incremental text fragment. Concatenating all deltas for a `block_id` reproduces the full LLM response. |

A slow client that cannot consume deltas fast enough will **lag**: oldest events are silently dropped from the broadcast buffer (capacity 256 events per instance, source: `stream_bus.rs:35`). This is by design — the durable `output` event carries the full text regardless. Lagging is logged at `debug` level, not surfaced to the client.

In **API-only deployments** (no in-process engine), the `StreamBus` channel is never published to, so no `llm_delta` events appear on the stream.

#### `done` — Terminal State Reached

Emitted immediately before the stream closes when the instance enters a terminal state.

```
event: done
data: {"state": "<completed|failed|cancelled>"}
```

| Field | Type | Description |
|---|---|---|
| `state` | `string` | The terminal state value. |

#### `error` — Instance Disappeared

Emitted when a mid-stream `get_instance` returns `null` (instance was deleted while streaming).

```
event: error
data: {"error": "instance not found"}
```

The stream closes immediately after this event.

---

### 3.4 Storage Error Handling & Backoff

On consecutive `get_instance` or `get_outputs_after_created_at` failures, the handler uses **exponential backoff** on top of the normal poll interval (source: `streaming.rs:109-204`):

| Consecutive errors | Extra wait |
|---|---|
| 0 | No extra wait (normal poll interval). |
| 1 | `poll_interval × 2` (capped at 30s). |
| 2 | `poll_interval × 4` (capped at 30s). |
| n | `poll_interval × 2^n` (capped at 30s). |

On success, the error counter resets to 0. The stream does not proactively notify the client during backoff; the SSE keepalive (every 15s) keeps the connection alive.

---

### 3.5 Reconnection Guidance for UI Clients

The SSE protocol's built-in reconnection (via `Last-Event-ID`) is **not** implemented here. Clients should:

1. Track the last-seen `output.created_at` timestamp from received `output` events.
2. On reconnect, open a new SSE connection (the server re-sends the current state on the first poll).
3. Re-fetch missed outputs via `GET /instances/{id}/outputs?after=<last_timestamp>` (if that endpoint exists) or accept a brief gap — outputs already in storage will appear on the next poll after reconnect.
4. `llm_delta` events missed during a disconnect are unrecoverable (non-durable). The final `output` event for the LLM step contains the complete text.

---

### 3.6 Concurrency and Lifecycle

```
Client connects
      |
      v
GET /instances/{id}  →  404 if not found / 403 if cross-tenant
      |
      v
stream_limiter.try_acquire()  →  503 if > 256 concurrent streams
      |
      v
Subscribe to StreamBus (for llm_delta events, pre-connection)
      |
      v
Spawn async task:
  loop {
    select! {
      shutdown  →  break
      client disconnected  →  break
      poll tick  →  get_instance + get_outputs_after
      llm_delta from StreamBus  →  emit event, no poll
    }
    if terminal state → emit done, break
  }
  // permit dropped → slot freed
```

The spawned task holds the semaphore permit for its entire lifetime. It terminates on:
- Instance reaching a terminal state (`completed`, `failed`, `cancelled`).
- Client disconnecting (MPSC channel closes: `tx.closed()`).
- Server shutdown (`shutdown.cancelled()`).
- Instance disappearing mid-stream (`get_instance` returns `None`).

---

## 4. Business Rules Summary

| # | Rule | Source |
|---|---|---|
| 1 | Approvals are read-only: no "resolve" endpoint exists; resolution requires sending a signal to the instance. | `approvals.rs`, `signals.rs` |
| 2 | Default choices for a `wait_for_input` step with no configured choices are `[{label:"Yes",value:"yes"},{label:"No",value:"no"}]`. | `approvals.rs:175-186` |
| 3 | `ApprovalItem.total` reflects page count, not global count. | `approvals.rs:171-172` |
| 4 | Approval list is sorted descending by `updated_at` (newest first), not configurable. | `approvals.rs:89` |
| 5 | Pagination limit is clamped to max 1000 (silent clamp, no error). | `approvals.rs:87` |
| 6 | For flat-path instances, only the first uncompleted `wait_for_input` step is exposed (sequential execution). | `approvals.rs:157-160` |
| 7 | For tree-path instances, parallel branches can each expose a waiting approval simultaneously. | `approvals.rs:163-168` |
| 8 | Signal name for resolving an approval is `custom:human_input:{block_id}`. | `approvals.rs:3`, `signals.rs`, engine handler convention |
| 9 | `session_key` must be 1–512 characters. Violation returns `400`. | `sessions.rs:50-53` |
| 10 | `tenant_id` path segment in `GET /sessions/by-key/{tenant_id}/{key}` must be ≤ 128 characters. Violation returns `400`. | `sessions.rs:110-114` |
| 11 | Session `id` is always server-assigned (`Uuid::now_v7()`); clients cannot choose it. | `sessions.rs:58` |
| 12 | Session `state` is always `active` at creation time. | `sessions.rs:62` |
| 13 | Session `data` update is a full replacement (not a merge). | `sessions.rs:141-159` |
| 14 | Cross-tenant session access returns `404`, not `403`, to avoid leaking resource existence. | `auth.rs:53-64` |
| 15 | SSE stream is limited to 256 concurrent connections per process. Beyond that, `503` is returned before the SSE handshake. | `lib.rs:46`, `streaming.rs:101-108` |
| 16 | SSE poll interval defaults to 500ms; client-provided `poll_ms` is clamped `[100, 5000]` (silent clamp). | `streaming.rs:31-40`, `117` |
| 17 | SSE keepalive comments are sent every 15 seconds. | `streaming.rs:302-303` |
| 18 | `llm_delta` events are non-durable and best-effort: a slow client lags (drops oldest deltas). The full LLM response is always in the step's durable `output` event. | `stream_bus.rs:14-17`, `streaming.rs:169-176` |
| 19 | The SSE stream subscribes to `StreamBus` before returning the response to avoid missing events published between connection and subscription. | `streaming.rs:129` |
| 20 | Terminal states for SSE stream closure: `completed`, `failed`, `cancelled`. | `streaming.rs:55-59` |
| 21 | On consecutive storage errors, SSE backing task applies exponential backoff capped at 30s. | `streaming.rs:109-204` |
| 22 | Internal error messages are redacted from API responses; only `"internal server error"` is returned to the client. | `error.rs:79-85` |
| 23 | Per-tenant API keys cannot scope operations to a different tenant via `X-Tenant-Id`; any mismatch is `403`. | `auth.rs:138-143` |
| 24 | A human-review step's `store_as` variable (if set) is the context key where the picked choice value is written; if absent, the `block_id` is used. | `sequence.rs:408-411` |
| 25 | Approvals `waiting_since` uses `node.started_at` for tree-path instances and `instance.updated_at` for flat-path instances. | `approvals.rs:200, 246-247` |

---

## 5. Open Issues

- The `total` field in `ApprovalsResponse` reflects the filtered page count, not the global total. There is no way to paginate approvals without re-fetching and counting. The comment `// TODO: add get_sequences_batch` (source: `approvals.rs:107`) indicates a batch sequence-fetch optimization is pending; this may affect latency for tenants with many distinct sequences.
- No `Last-Event-ID` reconnect support in SSE. The UI must implement its own gap-detection and replay strategy.
- `GET /sessions/{id}/instances` has no pagination parameters. For sessions with many linked instances, this returns an unbounded list in a single response.
- The `total` in `ApprovalsResponse` is `items.len() as u64` after filtering — it does not include approvals on other pages. There is no endpoint to count pending approvals globally.
- [INFERRED] Timeout enforcement (expiring an approval and invoking `escalation_handler`) is done by the engine scheduler, not by the API. The UI cannot trigger escalation directly — it can only send a signal with a value like `"escalate"` if the sequence defines that choice.
- Session state transitions are not validated at the API layer. No guard prevents moving from `completed` back to `active`. If guard semantics are required, they must be implemented in the UI or a higher-level service.
- `BlockOutput` schema is not documented in this section (the type is defined in `orch8-types/src/output.rs`, outside the assigned files). The `output` SSE event payload shape should be documented in the instances reference section.
- `StreamBus` channel capacity per instance is 256 events. For high-throughput `llm_call` steps, slow SSE clients will silently drop deltas. There is no flow-control mechanism exposed to clients.
