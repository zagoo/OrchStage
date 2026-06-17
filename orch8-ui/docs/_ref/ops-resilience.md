## Circuit Breakers, Rollback, Cluster & Webhooks

This section covers the resilience and operational endpoints of the Orch8 HTTP API: circuit breakers, rollback policies, cluster node management, inbound webhook ingestion, and the outbound webhook dead-letter outbox.

All endpoints in this section are served under both the canonical versioned prefix `/api/v1/...` **and** the bare legacy prefix `/...`. The bare-path mount is deprecated and will be removed in a future major release (`lib.rs:144`). All examples below use the `/api/v1` canonical form.

Authentication for all non-public endpoints: `X-API-Key` (root/admin key or a tenant-scoped key) + `X-Tenant-Id` header (required when `require_tenant_header = true` in server config, which is the default).

---

### 1. Circuit Breakers

Circuit breakers are per-tenant, per-handler guards that stop sending tasks to a handler after repeated failures, giving the downstream system time to recover before retrying.

#### 1.1 State Machine

```
           failure_count >= failure_threshold
  Closed ─────────────────────────────────────► Open
    ▲                                              │
    │  reset() (manual) or probe succeeds          │ cooldown_secs elapsed
    │                                              ▼
  Half-Open ◄─────────────────────────────── Half-Open (probe)
```

| State | Meaning |
|---|---|
| `closed` | Normal operation; tasks dispatched freely |
| `open` | Failures exceeded threshold; new dispatch is rejected; `opened_at` is set |
| `half_open` | Cooldown elapsed; one probe task allowed; success → `closed`, failure → back to `open` |

- **Trigger to open**: consecutive `failure_count` reaches `failure_threshold`.
- **Cooldown**: once `Open`, the breaker stays `Open` for `cooldown_secs` seconds (measured from `opened_at`), then automatically transitions to `Half-Open` on the next evaluation.
- **Reset**: `POST .../reset` forces the breaker back to `Closed` immediately, regardless of state (clears `failure_count` and `opened_at`).
- **Persistence**: only `Open`-state rows are persisted to the database (`circuit_breakers` table). `Closed` is the default and held in-memory only. On restart, previously-`Open` rows are rehydrated via `load_from_storage()` (`main.rs:93`).
- **Tenant isolation**: breakers are scoped `(tenant_id, handler)`; a noisy tenant cannot trip the circuit for other tenants sharing the same handler name (`circuit_breaker.rs:7–11`).
- **Registry availability**: if the circuit-breaker registry is disabled at startup (config), endpoints return 503 Unavailable rather than 404.

#### 1.2 Endpoints

Circuit-breaker routes are mounted **outside** `api_routes()` and merged separately in `main.rs:130–140`. They are still available at both `/api/v1/...` and `/...`.

---

##### GET /api/v1/circuit-breakers

Cross-tenant admin list (scoped by the caller's tenant context). Without a `X-Tenant-Id` header, returns an empty list (avoids leaking cross-tenant state). With a tenant header, returns only that tenant's breakers.

> Handler: `list_all_breakers` (`circuit_breakers.rs:50`)

**Auth scope**: any authenticated caller; result is filtered to caller's tenant.

**Request**: no parameters.

**Response 200**:

```json
[
  {
    "tenant_id": "acme",
    "handler": "send-invoice",
    "state": "open",
    "failure_count": 7,
    "failure_threshold": 5,
    "cooldown_secs": 60,
    "opened_at": "2024-09-01T12:00:00Z"
  }
]
```

**TypeScript return type**: `CircuitBreakerState[]`

---

##### GET /api/v1/tenants/{tenant_id}/circuit-breakers

List all breakers for a specific tenant.

> Handler: `list_breakers_for_tenant` (`circuit_breakers.rs:72`)

**Auth scope**: tenant key scoped to `tenant_id`, or admin key. Mismatched tenant returns 404 (not 403) to avoid tenant existence leakage.

| Path param | Type | Required | Description |
|---|---|---|---|
| `tenant_id` | string | yes | Owning tenant identifier |

**Response 200**: `CircuitBreakerState[]` (same shape as above)

**Error responses**:

| Status | Condition |
|---|---|
| 404 | Tenant mismatch (see note on `guard_tenant`) |
| 503 | Circuit-breaker registry not initialized |

---

##### GET /api/v1/tenants/{tenant_id}/circuit-breakers/{handler}

Get the state of a single circuit breaker.

> Handler: `get_breaker` (`circuit_breakers.rs:96`)

**Auth scope**: same as list-per-tenant.

| Path param | Type | Required | Description |
|---|---|---|---|
| `tenant_id` | string | yes | Owning tenant identifier |
| `handler` | string | yes | Handler name the breaker protects |

**Response 200**: `CircuitBreakerState`

```json
{
  "tenant_id": "acme",
  "handler": "send-invoice",
  "state": "half_open",
  "failure_count": 5,
  "failure_threshold": 5,
  "cooldown_secs": 60,
  "opened_at": "2024-09-01T12:00:00Z"
}
```

**Error responses**:

| Status | Condition |
|---|---|
| 404 | Handler not found for this tenant, or tenant mismatch |
| 503 | Registry not initialized |

---

##### POST /api/v1/tenants/{tenant_id}/circuit-breakers/{handler}/reset

Force-reset a circuit breaker to `Closed`. Clears `failure_count` and removes any persisted `Open` row.

> Handler: `reset_breaker` (`circuit_breakers.rs:120`)

**Auth scope**: same as list-per-tenant.

| Path param | Type | Required | Description |
|---|---|---|---|
| `tenant_id` | string | yes | Owning tenant identifier |
| `handler` | string | yes | Handler name to reset |

**Request body**: none.

**Response 200**: empty body.

**Error responses**:

| Status | Condition |
|---|---|
| 404 | Tenant mismatch |
| 503 | Registry not initialized |

---

#### 1.3 Entity: `CircuitBreakerState`

TypeScript mapping:

| Field | Rust type | TS type | Required in response | Notes |
|---|---|---|---|---|
| `tenant_id` | `TenantId` | `string` | yes | Tenant that owns this breaker |
| `handler` | `String` | `string` | yes | Handler name being protected |
| `state` | `BreakerState` | `"closed" \| "open" \| "half_open"` | yes | Current breaker state |
| `failure_count` | `u32` | `number` | yes | Consecutive failure count |
| `failure_threshold` | `u32` | `number` | yes | Failures before tripping to `open` |
| `cooldown_secs` | `u64` | `number` | yes | Seconds from `opened_at` before transitioning to `half_open` |
| `opened_at` | `Option<DateTime<Utc>>` | `string (ISO 8601) \| undefined` | no | Set when state is `open`; omitted from JSON when `null` |

#### 1.4 Database Table: `circuit_breakers`

Migration: `029_circuit_breakers.sql`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `tenant_id` | TEXT | NOT NULL | Part of composite PK |
| `handler` | TEXT | NOT NULL | Part of composite PK |
| `state` | TEXT | NOT NULL | One of `closed`, `open`, `half_open` |
| `failure_count` | INTEGER | NOT NULL | |
| `failure_threshold` | INTEGER | NOT NULL | |
| `cooldown_secs` | BIGINT | NOT NULL | |
| `opened_at` | TIMESTAMPTZ | nullable | Set when breaker trips open |

**Primary key**: `(tenant_id, handler)`

**Indexes**:
- `idx_circuit_breakers_open` — partial index on `state = 'open'`; used for boot-time rehydration of open breakers.

**Design note**: only `Open`-state rows should normally be present; `Closed` and `Half-Open` states are held in-memory only. The partial index also guards against stray `Closed`/`Half-Open` rows (`029_circuit_breakers.sql:18`).

---

### 2. Rollback Policies

Error-budget auto-rollback policies monitor a sequence's error rate within a rolling time window and automatically trigger a rollback when the rate breaches the configured threshold. Policies are per-tenant, per-sequence.

> Module: `rollback.rs` (no `#[utoipa::path]` macros — real but undocumented in OpenAPI)

All four routes are registered in `api_routes()` via `rollback::routes()` (`lib.rs:118`). Because there are no utoipa macros on these handlers, they do not appear in the generated Swagger spec, but they are live routes.

#### 2.1 Endpoints

---

##### POST /api/v1/rollback-policies

Create a new rollback policy for a (tenant, sequence) pair.

> Handler: `create_policy` (`rollback.rs:69`)

**Auth scope**: `X-API-Key` required; tenant resolved from `X-Tenant-Id` header or request body `tenant_id` field (body wins if both present; falls back to `"default"` if neither is set).

**Request body** (JSON):

| Field | TS type | Required | Default | Constraints |
|---|---|---|---|---|
| `tenant_id` | `string` | no | resolved from header or `"default"` | Overrides header tenant |
| `sequence_name` | `string` | **yes** | — | Must be non-empty |
| `error_rate_threshold` | `number` | **yes** | — | `[0.0, 1.0]` inclusive |
| `time_window_secs` | `number` | **yes** | — | Must be positive (> 0) |
| `cooldown_secs` | `number` | no | `3600` | Min seconds between consecutive rollback triggers |
| `confirmation_window_secs` | `number` | no | `60` | Error rate must stay above threshold for this many seconds before triggering; `0` disables sustained-breach confirmation |
| `webhook_url` | `string` | no | `null` | Must be valid `http://` or `https://` URL with a host; POSTed when rollback triggers |

**Validations** (`rollback.rs:74–106`):
- `sequence_name` must not be empty → 400
- `error_rate_threshold` must be in `[0.0, 1.0]` → 400
- `time_window_secs` must be > 0 → 400
- `webhook_url` (if provided): must parse as a valid URL, scheme must be `http` or `https`, must have a host → 400

**Response 201**: `PolicyResponse` object (see entity below).

```json
{
  "id": 42,
  "tenant_id": "acme",
  "sequence_name": "checkout-flow",
  "error_rate_threshold": 0.05,
  "time_window_secs": 300,
  "enabled": true,
  "cooldown_secs": 3600,
  "confirmation_window_secs": 60,
  "webhook_url": null,
  "created_at": "2024-09-01T12:00:00Z",
  "updated_at": "2024-09-01T12:00:00Z"
}
```

**Error responses**:

| Status | Condition |
|---|---|
| 400 | Validation failure (see above) |
| 500 | DB error |

---

##### GET /api/v1/rollback-policies

List rollback policies. Returns up to 100 rows.

> Handler: `list_policies` (`rollback.rs:154`)

**Auth scope**: `X-API-Key` required; tenant scoped from header.

**Query params**:

| Param | TS type | Required | Default | Description |
|---|---|---|---|---|
| `tenant_id` | `string` | no | header tenant | Filter to a specific tenant; without this or header, returns policies for all tenants [INFERRED from storage call passing `None`] |

**Response 200**: `PolicyResponse[]` (max 100 items; no pagination cursor exposed by this handler).

**Error responses**:

| Status | Condition |
|---|---|
| 500 | DB error |

---

##### GET /api/v1/rollback-policies/{name}

Get a single rollback policy by `sequence_name`.

> Handler: `get_policy` (`rollback.rs:135`)

**Auth scope**: `X-API-Key` required.

| Path param | TS type | Required | Description |
|---|---|---|---|
| `name` | `string` | yes | The `sequence_name` of the policy |

**Query params**:

| Param | TS type | Required | Default | Description |
|---|---|---|---|---|
| `tenant_id` | `string` | no | header tenant | Tenant scope; falls back to `"default"` if neither header nor query param is set |

**Response 200**: `PolicyResponse`

**Error responses**:

| Status | Condition |
|---|---|
| 500 | Policy not found or DB error (uses `ApiError::Internal` for not-found — see open issue) |

---

##### DELETE /api/v1/rollback-policies/{name}

Delete a rollback policy by `sequence_name`.

> Handler: `delete_policy` (`rollback.rs:173`)

**Auth scope**: `X-API-Key` required.

| Path param | TS type | Required | Description |
|---|---|---|---|
| `name` | `string` | yes | The `sequence_name` of the policy to delete |

**Query params**:

| Param | TS type | Required | Default | Description |
|---|---|---|---|---|
| `tenant_id` | `string` | no | header tenant | Tenant scope; falls back to `"default"` |

**Response 204**: no content.

**Error responses**:

| Status | Condition |
|---|---|
| 500 | DB error |

---

#### 2.2 Entity: `PolicyResponse` / `RollbackPolicy`

| Field | TS type | Notes |
|---|---|---|
| `id` | `number` | Auto-generated `BIGSERIAL` PK |
| `tenant_id` | `string` | Owning tenant |
| `sequence_name` | `string` | Target sequence |
| `error_rate_threshold` | `number` | `[0.0, 1.0]` fraction |
| `time_window_secs` | `number` | Rolling window duration (seconds) |
| `enabled` | `boolean` | Whether the policy is active |
| `cooldown_secs` | `number` | Minimum seconds between triggers; default `3600` |
| `confirmation_window_secs` | `number` | Sustained-breach hold (seconds); default `60`; `0` = immediate |
| `webhook_url` | `string \| null` | Alert webhook; `null` if not set |
| `created_at` | `string` | ISO 8601 UTC |
| `updated_at` | `string` | ISO 8601 UTC |

#### 2.3 Entity: `RollbackHistory`

Not exposed via HTTP endpoints in the files read, but stored in the database and part of `orch8-types`. Included for completeness.

| Field | TS type | Notes |
|---|---|---|
| `id` | `number` | BIGSERIAL PK |
| `tenant_id` | `string` | |
| `sequence_name` | `string` | |
| `triggered_at` | `string` | ISO 8601 |
| `error_rate` | `number` | Observed rate at trigger time |
| `threshold` | `number` | Policy threshold at trigger time |
| `previous_manifest_version` | `string \| null` | Version rolled back from |
| `reason` | `string` | Default `"threshold_breach"` |
| `alert_sent` | `boolean` | Whether alert webhook was POSTed |

#### 2.4 Database Tables

**`rollback_policies`** — migrations `037_rollback_policies.sql` + `040_rollback_policy_columns.sql`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGSERIAL | NOT NULL | auto | PK |
| `tenant_id` | TEXT | NOT NULL | — | |
| `sequence_name` | TEXT | NOT NULL | — | |
| `error_rate_threshold` | REAL | NOT NULL | `0.05` | |
| `time_window_secs` | INTEGER | NOT NULL | `300` | |
| `enabled` | INTEGER | NOT NULL | `1` | Boolean stored as integer (SQLite compat) |
| `cooldown_secs` | INTEGER | NOT NULL | `3600` | Added by migration 040 |
| `confirmation_window_secs` | INTEGER | NOT NULL | `60` | Added by migration 040 |
| `webhook_url` | TEXT | nullable | `NULL` | Added by migration 040 |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | |

**Unique constraint**: `(tenant_id, sequence_name)`

**Indexes**:
- `idx_rollback_policies_tenant` on `(tenant_id)`
- `idx_rollback_policies_enabled` on `(enabled)`

---

**`rollback_history`** — migration `037_rollback_policies.sql`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGSERIAL | NOT NULL | auto | PK |
| `tenant_id` | TEXT | NOT NULL | — | |
| `sequence_name` | TEXT | NOT NULL | — | |
| `triggered_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | |
| `error_rate` | REAL | NOT NULL | — | |
| `threshold` | REAL | NOT NULL | — | |
| `previous_manifest_version` | TEXT | nullable | `NULL` | |
| `reason` | TEXT | NOT NULL | `'threshold_breach'` | |
| `alert_sent` | INTEGER | NOT NULL | `0` | Boolean stored as integer |

**Indexes**:
- `idx_rollback_history_tenant` on `(tenant_id, sequence_name)`
- `idx_rollback_history_triggered` on `(triggered_at)`

---

### 3. Cluster Nodes

Endpoints for inspecting and managing engine nodes in a multi-node deployment. The engine background task issues periodic heartbeats; a separate reaper task marks nodes stale.

#### 3.1 Node Lifecycle & Reaper Semantics

- Each engine node registers itself at startup and periodically calls `heartbeat_node()` at an interval configurable via `SchedulerConfig`.
- A background **node reaper** runs every `node_reaper_tick_secs` (default `60` s) and marks nodes whose `last_heartbeat_at` is older than `node_reaper_stale_secs` (default **120 s**) as stale/stopped (`config.rs:419–425`, confirmed by test `config.rs:1006–1007`).
- **Drain**: `POST /cluster/nodes/{id}/drain` sets `drain = true` on the node row. The node's own engine loop sees this flag and stops claiming new workflow instances, gracefully finishing in-flight work before shutting down.
- **`NodeStatus` values**: `active` (normal), `draining` (drain flag set, finishing in-flight), `stopped` (graceful shutdown complete).

#### 3.2 Endpoints

---

##### GET /api/v1/cluster/nodes

List all registered cluster nodes.

> Handler: `list_nodes` (`cluster.rs:24`)

**Auth scope**: `X-API-Key` required. Not tenant-scoped (cluster state is operator-level).

**Request**: no parameters.

**Response 200**: `ClusterNode[]`

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "orch8-0",
    "status": "active",
    "registered_at": "2024-09-01T08:00:00Z",
    "last_heartbeat_at": "2024-09-01T12:05:30Z",
    "drain": false
  }
]
```

**Error responses**:

| Status | Condition |
|---|---|
| 500 | Storage error |

---

##### POST /api/v1/cluster/nodes/{id}/drain

Signal a node to drain: stop accepting new work and wait for in-flight tasks to complete.

> Handler: `drain_node` (`cluster.rs:41`)

**Auth scope**: `X-API-Key` required (admin operation).

| Path param | TS type | Required | Description |
|---|---|---|---|
| `id` | `string (UUID)` | yes | Node UUID as returned by `list_nodes` |

**Request body**: none.

**Response 200**: empty body.

**Error responses**:

| Status | Condition |
|---|---|
| 404 | Node not found |
| 500 | Storage error |

---

#### 3.3 Entity: `ClusterNode`

| Field | Rust type | TS type | Notes |
|---|---|---|---|
| `id` | `Uuid` | `string` | UUID v4, generated at node startup |
| `name` | `String` | `string` | Human-readable (hostname or pod name) |
| `status` | `NodeStatus` | `"active" \| "draining" \| "stopped"` | Current node state |
| `registered_at` | `DateTime<Utc>` | `string (ISO 8601)` | When node first registered |
| `last_heartbeat_at` | `DateTime<Utc>` | `string (ISO 8601)` | Most recent heartbeat time |
| `drain` | `bool` | `boolean` | If true, node is told to stop claiming new work |

**`NodeStatus` enum** (serialized as snake_case):

| Value | Meaning |
|---|---|
| `active` | Normal operation |
| `draining` | Finishing in-flight work; not claiming new instances |
| `stopped` | Node has shut down gracefully |

#### 3.4 Database Table: `cluster_nodes`

Migration: `019_cluster_nodes.sql`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `name` | TEXT | NOT NULL | — | |
| `status` | TEXT | NOT NULL | `'active'` | One of `active`, `draining`, `stopped` |
| `registered_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | |
| `last_heartbeat_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Updated each heartbeat cycle |
| `drain` | BOOLEAN | NOT NULL | `FALSE` | Set by `drain_node` endpoint |

**Index**: `idx_cluster_nodes_status` on `(status)`.

---

### 4. Inbound Webhook Ingestion

The `POST /webhooks/{slug}` endpoint is public (no `X-API-Key` or `X-Tenant-Id` required). It accepts events from external systems (GitHub, Stripe, Shopify, etc.) and creates a new workflow instance. Authentication is enforced by per-trigger HMAC secrets and replay-protection headers.

This router is mounted **after** the auth middleware layers and bypasses `X-API-Key` / `X-Tenant-Id` enforcement (`webhooks.rs:1–16`).

#### 4.1 Security Model

1. The trigger must have `trigger_type = "webhook"` and `enabled = true`; otherwise 404 is returned (to avoid leaking existence of non-webhook triggers to anonymous callers).
2. Every webhook trigger **must** have a `secret` configured server-side. Triggers without a secret are rejected with 401 (not silently accepted) to prevent unauthenticated firing.
3. The caller must pass three headers:
   - `X-Trigger-Secret`: the shared secret for this trigger (constant-time comparison).
   - `X-Trigger-Timestamp`: Unix epoch timestamp (integer, seconds). Must fall within the replay window: at most **300 s in the past** or **60 s in the future** relative to the server clock.
   - `X-Trigger-Nonce`: a unique per-request string. Seen nonces are cached for `REPLAY_WINDOW_SECS + 60` seconds (360 s total) in an in-process Moka cache (max 100,000 entries); nonce reuse within the window is rejected with 401.
4. The nonce cache is composite-keyed as `slug:nonce` to avoid cross-trigger nonce collisions (`webhooks.rs:57–62`).

#### 4.2 Endpoint

---

##### POST /webhooks/{slug}

Accept an inbound webhook and create a workflow instance.

> Handler: `public_webhook` (`webhooks.rs:96`)

**Auth**: NOT behind `X-API-Key` middleware. Authentication is via `X-Trigger-Secret` header + replay-protection headers. No `X-Tenant-Id` required.

**Global body limit**: 1 MB (overrides the server-wide 10 MB limit; `webhooks.rs:67,74`).

| Path param | TS type | Required | Description |
|---|---|---|---|
| `slug` | `string` | yes | The trigger's slug identifier |

**Request headers**:

| Header | Required | Description |
|---|---|---|
| `X-Trigger-Secret` | **yes** | The trigger's HMAC secret; verified by constant-time comparison |
| `X-Trigger-Timestamp` | **yes** | Unix epoch seconds (integer string); within ±300s/+60s of server clock |
| `X-Trigger-Nonce` | **yes** | Unique per-request string; reuse within window → 401 |
| `User-Agent` | no | Captured into instance metadata |
| `Content-Type` | yes (implicit) | `application/json` |

**Request body**: any valid JSON (`serde_json::Value`). The full body becomes the workflow instance input payload.

**Response 202**:

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440001",
  "trigger": "my-webhook-slug"
}
```

**Error responses**:

| Status | Condition |
|---|---|
| 401 | Missing/invalid `X-Trigger-Secret`; missing `X-Trigger-Timestamp`; timestamp outside replay window; missing or reused `X-Trigger-Nonce`; trigger has no secret configured |
| 404 | Unknown slug; trigger is disabled; trigger type is not `webhook` |
| 413 | Body exceeds 1 MB |

---

#### 4.3 Business Rules

1. `trigger_type` must be `webhook`; `event` and `nats` types are rejected with 404 (`webhooks.rs:110–116`).
2. Trigger must be `enabled = true`; disabled triggers → 404 (`webhooks.rs:115–117`).
3. A secret-less trigger **always** rejects public POSTs with 401 (`webhooks.rs:122–128`). This is intentional: a trigger without a secret configured at the server side cannot be reached via the public endpoint.
4. Replay window: past ≤ 300 s, future ≤ 60 s (`REPLAY_WINDOW_SECS = 300`, `MAX_FUTURE_SKEW_SECS = 60`).
5. Nonce cache max capacity: 100,000 entries; TTL: 360 s (replay window + 60 s buffer).

---

### 5. Webhook Outbox (Dead-Letter Queue)

When an outbound webhook exhausts all delivery retries, the engine parks the failed delivery in the `webhook_outbox` table instead of dropping it. Operator endpoints allow inspection, manual redelivery, and discard.

The outbox is **global** (not tenant-scoped) because outbound webhook configuration is operator-level.

#### 5.1 Endpoints

---

##### GET /api/v1/webhooks/outbox

List parked webhook deliveries (newest first).

> Handler: `list_outbox` (`webhook_outbox.rs:49`)

**Auth scope**: `X-API-Key` required.

**Query params**:

| Param | TS type | Required | Default | Constraints |
|---|---|---|---|---|
| `limit` | `number` | no | `100` | Clamped to `[1, 1000]` |

**Response 200**: `WebhookOutboxEntry[]`

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "url": "https://hooks.example.com/events",
    "event_type": "instance.failed",
    "instance_id": "550e8400-e29b-41d4-a716-446655440001",
    "payload": { "event": "instance.failed", "data": {} },
    "attempts": 4,
    "last_error": "502 Bad Gateway",
    "created_at": "2024-09-01T12:00:00Z"
  }
]
```

**Error responses**:

| Status | Condition |
|---|---|
| 500 | Storage error |

---

##### POST /api/v1/webhooks/outbox/{id}/redeliver

Attempt to redeliver a parked webhook. On success, the outbox row is removed. On failure, the row is kept and a 502 is returned so the operator can retry later.

> Handler: `redeliver_outbox` (`webhook_outbox.rs:70`)

**Auth scope**: `X-API-Key` required.

| Path param | TS type | Required | Description |
|---|---|---|---|
| `id` | `string (UUID)` | yes | Parked delivery UUID |

**Request body**: none.

**Response 200**:

```json
{ "redelivered": true }
```

**Error responses**:

| Status | Condition |
|---|---|
| 404 | No entry with this ID |
| 502 | Redelivery attempt failed; row is kept for retry; error message includes destination URL and reason |

---

##### DELETE /api/v1/webhooks/outbox/{id}

Permanently discard a parked delivery. No retry is attempted; the row is deleted immediately.

> Handler: `discard_outbox` (`webhook_outbox.rs:105`)

**Auth scope**: `X-API-Key` required.

| Path param | TS type | Required | Description |
|---|---|---|---|
| `id` | `string (UUID)` | yes | Parked delivery UUID |

**Response 204**: no content.

**Error responses**:

| Status | Condition |
|---|---|
| 500 | Storage error |

---

#### 5.2 Entity: `WebhookOutboxEntry`

| Field | Rust type | TS type | Required in response | Notes |
|---|---|---|---|---|
| `id` | `Uuid` | `string` | yes | Primary key |
| `url` | `String` | `string` | yes | Destination URL that failed |
| `event_type` | `String` | `string` | yes | e.g. `"instance.failed"` |
| `instance_id` | `Option<Uuid>` | `string \| undefined` | no | Related instance; omitted from JSON when `null` |
| `payload` | `serde_json::Value` | `unknown` | yes | Full `WebhookEvent` payload replayed verbatim on redelivery |
| `attempts` | `i32` | `number` | yes | Delivery attempts before parking |
| `last_error` | `Option<String>` | `string \| undefined` | no | Last HTTP status or transport error; omitted when `null` |
| `created_at` | `DateTime<Utc>` | `string (ISO 8601)` | yes | When parked |

#### 5.3 Entity: `RedeliverResponse`

| Field | TS type | Notes |
|---|---|---|
| `redelivered` | `boolean` | `true` if delivery succeeded and row was removed |

#### 5.4 Database Table: `webhook_outbox`

Migration: `047_webhook_outbox.sql`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `url` | TEXT | NOT NULL | — | Destination URL |
| `event_type` | TEXT | NOT NULL | — | e.g. `instance.failed` |
| `instance_id` | UUID | nullable | `NULL` | Related workflow instance |
| `payload` | JSONB | NOT NULL | — | Full serialized `WebhookEvent` |
| `attempts` | INTEGER | NOT NULL | `0` | Delivery attempts before parking |
| `last_error` | TEXT | nullable | `NULL` | Last HTTP status or transport error |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Parking timestamp |

**Index**: `idx_webhook_outbox_created` on `(created_at DESC)` — supports listing newest-first with limit.

---

### 6. Outbound Webhook Configuration (`WebhookConfig`)

The outbound webhook system is configured at the server level (not per-tenant, not via HTTP endpoints). No HTTP CRUD endpoints exist for `WebhookConfig` in the files read. The configuration shape is documented here for completeness as Vue UI components may need to read/display it.

Source: `orch8-types/src/config.rs:435–472`

| Field | TS type | Default | Notes |
|---|---|---|---|
| `urls` | `string[]` | `[]` | List of destination URLs for outbound events |
| `timeout_secs` | `number` | `10` | Per-request delivery timeout |
| `max_retries` | `number` | `3` | Retry attempts before parking in outbox |
| `secret` | `string \| null` | `null` | HMAC-SHA256 signing key; redacted in debug/logs; outbound deliveries include `X-Orch8-Signature: sha256=<hex>` and `X-Orch8-Timestamp` for receiver verification |

---

### 7. Cross-Reference: Auth & Multi-Tenancy

| Area | Tenant-scoped? | Auth mechanism |
|---|---|---|
| Circuit breakers (list all) | Yes (filtered by header tenant) | `X-API-Key` + optional `X-Tenant-Id` |
| Circuit breakers (per-tenant routes) | Yes — URL `tenant_id` must match header tenant | `X-API-Key` + `X-Tenant-Id` |
| Rollback policies | Yes — `tenant_id` from header or query | `X-API-Key` |
| Cluster nodes | No (operator-level) | `X-API-Key` |
| Inbound webhooks | No (public) | `X-Trigger-Secret` + replay headers |
| Webhook outbox | No (operator-level) | `X-API-Key` |

**Tenant mismatch handling**: circuit-breaker endpoints return **404** (not 403) on tenant mismatch to avoid leaking whether a given tenant has any breakers registered (`circuit_breakers.rs:14–23`). Rollback endpoints resolve tenant from header/query and pass it to the storage layer; mismatches surface as not-found at the DB level.
