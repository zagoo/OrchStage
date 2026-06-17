## Master Endpoint & Surface Inventory

**Source crate:** `orch8-api` (Axum, Rust)
**Generated from:** `lib.rs`, `openapi.rs`, `health.rs`, `metrics.rs`, `mcp_server.rs`, `model_pricing.rs`, plus all handler modules.
**Date:** 2026-06-17

---

### 1. Route Architecture

#### 1.1 Mount Topology

All business-logic routes are registered twice (lib.rs:139-145):

| Mount point | Notes |
|---|---|
| `/api/v1/...` | **Canonical** – clients should use this |
| `/...` (root) | **Deprecated legacy** – backward-compat only, will be removed in v2 |

Operational routes are mounted **outside** `build_router` by `orch8-server`, so they are never behind auth middleware:

| Path | Module | Auth |
|---|---|---|
| `GET /health/live` | `health.rs` | None |
| `GET /health/ready` | `health.rs` | None |
| `GET /info` | `health.rs` | None |
| `GET /metrics` | `metrics.rs` | None (separate `MetricsState`) |

The public webhook route is also mounted after auth layers:

| Path | Module | Auth |
|---|---|---|
| `POST /webhooks/{slug}` | `webhooks.rs` | None (HMAC secret in header) |

Mobile sync routes are conditionally mounted only when `AppState::mobile_sync_enabled` is `true` (lib.rs:135-137).

---

#### 1.2 Authentication

- **Header:** `X-API-Key` – present on all business-logic routes.
- **Tenant scoping:** `X-Tenant-Id` header. When a per-tenant key is used, the tenant is locked to the key's tenant; the header is validated or injected by `auth::api_key_middleware`. An unscoped (root/admin) key may read/write across tenants.
- **Admin-only endpoints** (`api_keys.rs`) additionally require the root key via `OptionalAdmin` extractor and return `403` for per-tenant callers.
- **Public webhooks** bypass all API key checks – authenticated by `x-trigger-secret` + `x-trigger-timestamp` + `x-trigger-nonce` (replay protection).

---

### 2. Complete HTTP Endpoint Catalog

#### 2.1 Health & Operational (No Auth)

| Method | Path | Handler | Success | Error |
|---|---|---|---|---|
| `GET` | `/health/live` | `health::liveness` | 200 (empty) | – |
| `GET` | `/health/ready` | `health::readiness` | 200 | 503 (DB unreachable) |
| `GET` | `/info` | `health::info` | 200 JSON | – |
| `GET` | `/metrics` | `metrics::prometheus_metrics` | 200 text/plain | – |

**GET /info** response shape (health.rs:47-52):
```json
{
  "version": "1.2.3",
  "env_label": "production",
  "env_color": "#ff0000"
}
```
`env_label` and `env_color` are optional – sourced from `ORCH8_ENV_LABEL` / `ORCH8_ENV_COLOR` env vars. Returns `null` when unset.

**GET /metrics** returns Prometheus text format (`Content-Type: text/plain; version=0.0.4; charset=utf-8`).

---

#### 2.2 Sequences

Routes registered in `sequences.rs`. Both `/api/v1/sequences...` and `/sequences...` are live.

| Method | Path | Handler fn | operationId | Auth | Success |
|---|---|---|---|---|---|
| `POST` | `/sequences` | `create_sequence` | `create_sequence` | tenant | 201 |
| `GET` | `/sequences` | `list_sequences` | `list_sequences` | tenant | 200 |
| `GET` | `/sequences.json` | `list_sequences_array` | – (no utoipa) | tenant | 200 |
| `GET` | `/sequences/{id}` | `get_sequence` | `get_sequence` | tenant | 200 / 404 |
| `DELETE` | `/sequences/{id}` | `delete_sequence` | – (utoipa on fn) | tenant | 204 / 404 / 409 |
| `POST` | `/sequences/{id}/deprecate` | `deprecate_sequence` | `deprecate_sequence` | tenant | 204 |
| `POST` | `/sequences/{id}/status` | `set_sequence_status` | – (no utoipa) | tenant | 204 |
| `POST` | `/sequences/{name}/unpublish` | `unpublish_sequence` | – (no utoipa) | tenant | 204 |
| `POST` | `/sequences/{name}/promote` | `promote_sequence` | – (no utoipa) | tenant | 201 |
| `GET` | `/sequences/by-name` | `get_sequence_by_name` | `get_sequence_by_name` | tenant | 200 / 404 |
| `GET` | `/sequences/versions` | `list_sequence_versions` | `list_sequence_versions` | tenant | 200 |
| `POST` | `/sequences/migrate-instance` | `migrate_instance` | `migrate_instance` | tenant | 200 / 400 / 404 |

##### POST /sequences – Request body (SequenceDefinition)

Full `SequenceDefinition` object. Key top-level fields:

| Field | Type (TS) | Required | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | yes | auto-generated client-side (UUIDv7) |
| `tenant_id` | `string` | yes | enforced to match caller's tenant |
| `namespace` | `string` | yes | |
| `name` | `string` | yes | max 255 chars [INFERRED from storage] |
| `version` | `number` (i32) | yes | |
| `deprecated` | `boolean` | yes | default `false` |
| `status` | `"draft" \| "staging" \| "production" \| "unpublished"` | yes | default `"draft"` |
| `blocks` | `BlockDefinition[]` | yes | recursive block tree |
| `interceptors` | `InterceptorDef[] \| null` | no | |
| `input_schema` | `unknown \| null` | no | JSON Schema; validated as well-formed at creation |
| `sla` | `SlaPolicy \| null` | no | |
| `on_failure` | `BlockDefinition[] \| null` | no | |
| `on_cancel` | `BlockDefinition[] \| null` | no | |
| `created_at` | `string` (ISO8601) | yes | |

Business rules (sequences.rs):
- Duplicate `block_id` values within a sequence are rejected at creation (sequences.rs:50-52).
- `input_schema` is validated as a well-formed JSON Schema (sequences.rs:55-58).
- Template expressions in block params are linted (sequences.rs:61-63).
- Sequence lint warnings are appended to the 201 response as `"warnings": string[]` (sequences.rs:77-80).
- `DELETE /sequences/{id}` is blocked if any `Scheduled | Running | Paused | Waiting` instances reference it (sequences.rs:205-224).
- `POST /sequences/{id}/status` enforces allowed state transitions from `SequenceStatus` (sequences.rs:546-553).
  - `Unpublished` target also calls `deprecate_sequence` (sequences.rs:561-567).
- `POST /sequences/{name}/promote` requires source status to be `Staging`; creates a new version with status `Production` and bumped `version` number (sequences.rs:499-523).
- `POST /sequences/migrate-instance` forbids migrating to a sequence owned by a different tenant (sequences.rs:392-398).
- `GET /sequences.json` – plain array, no pagination wrapper, max 1000 rows, tenant-scoped.

##### GET /sequences – Query params

| Param | Type | Required | Default | Max |
|---|---|---|---|---|
| `tenant_id` | `string` | no | – | – |
| `namespace` | `string` | no | – | – |
| `limit` | `number` | no | 200 | 1000 |
| `offset` | `number` | no | 0 | – |

Response: `PaginatedResponse<SequenceDefinition>` → `{ items: SequenceDefinition[], has_more: boolean }`.

##### GET /sequences/by-name – Query params

| Param | Type | Required |
|---|---|---|
| `tenant_id` | `string` | yes |
| `namespace` | `string` | yes |
| `name` | `string` | yes |
| `version` | `number` (i32) | no |

##### POST /sequences/migrate-instance – Request body

```json
{
  "instance_id": "<uuid>",
  "target_sequence_id": "<uuid>"
}
```

---

#### 2.3 Instances

Routes registered in `instances.rs` (sub-modules under `instances/`).

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/instances` | `create_instance` | tenant | 201 |
| `GET` | `/instances` | `list_instances` | tenant | 200 |
| `POST` | `/instances/batch` | `create_instances_batch` | tenant | 207 |
| `GET` | `/instances/{id}` | `get_instance` | tenant | 200 / 404 |
| `GET` | `/instances/{id}/children` | `get_instance_children` | tenant | 200 |
| `GET` | `/instances/{id}/logs` | `get_instance_logs` | tenant | 200 |
| `PATCH` | `/instances/{id}/state` | `update_state` | tenant | 200 |
| `PATCH` | `/instances/{id}/context` | `update_context` | tenant | 200 |
| `POST` | `/instances/{id}/signals` | `send_signal` | tenant | 200 |
| `GET` | `/instances/{id}/outputs` | `get_outputs` | tenant | 200 |
| `GET` | `/instances/{id}/artifacts` | `list_instance_artifacts` | tenant | 200 |
| `GET` | `/artifacts/{*key}` | `get_artifact_bytes` | tenant | 200 / 404 |
| `GET` | `/instances/{id}/tree` | `get_execution_tree` | tenant | 200 |
| `GET` | `/instances/{id}/timeline` | `get_timeline` | tenant | 200 |
| `POST` | `/instances/{id}/retry` | `retry_instance` | tenant | 200 / 404 |
| `POST` | `/instances/{id}/resume-from/{block_id}` | `resume_from_block` | tenant | 200 |
| `POST` | `/instances/{id}/fork` | `fork_instance` | tenant | 200 |
| `GET` | `/instances/{id}/checkpoints` | `list_checkpoints` | tenant | 200 |
| `POST` | `/instances/{id}/checkpoints` | `save_checkpoint` | tenant | 201 |
| `GET` | `/instances/{id}/checkpoints/latest` | `get_latest_checkpoint` | tenant | 200 / 404 |
| `POST` | `/instances/{id}/checkpoints/prune` | `prune_checkpoints` | tenant | 200 |
| `GET` | `/instances/{id}/audit` | `list_audit_log` | tenant | 200 |
| `POST` | `/instances/{id}/inject-blocks` | `inject_blocks` | tenant | 200 |
| `GET` | `/instances/{id}/stream` | `streaming::stream_instance` | tenant | 200 SSE / 404 / 503 |
| `PATCH` | `/instances/bulk/state` | `bulk_update_state` | tenant | 200 |
| `PATCH` | `/instances/bulk/reschedule` | `bulk_reschedule` | tenant | 200 |
| `POST` | `/instances/batch-action` | `batch_action` | tenant | 200 |
| `GET` | `/instances/dlq` | `list_dlq` | tenant | 200 |

##### POST /instances – CreateInstanceRequest

| Field | Type (TS) | Required | Notes |
|---|---|---|---|
| `sequence_id` | `string` (UUID) | yes | |
| `tenant_id` | `string` | yes | |
| `namespace` | `string` | yes | |
| `context` | `ExecutionContext` | no | default `{}` |
| `metadata` | `unknown` | no | opaque JSON |
| `budget` | `Budget \| null` | no | `max_input_tokens`, `max_output_tokens`, `max_total_tokens`, `max_steps` |
| `dry_run` | `boolean` | no | default `false` |
| `idempotency_key` | `string \| null` | no | at-most-once creation dedup key |
| `priority` | `Priority` | no | [INFERRED] |

##### GET /instances – ListQuery

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `tenant_id` | `string` | no | – | scoped to caller's tenant if header present |
| `namespace` | `string` | no | – | |
| `state` | `string` | no | – | comma-separated `InstanceState` values |
| `sequence_id` | `string` (UUID) | no | – | |
| `limit` | `number` | no | 100 [INFERRED] | |
| `offset` | `number` | no | 0 | |

##### GET /instances/{id}/stream – SSE Events

| Event type | Payload | Notes |
|---|---|---|
| `state` | `{ instance_id: string, state: string }` | emitted on state transitions |
| `output` | `BlockOutput` JSON | emitted when new block outputs appear |
| `llm_delta` | `StreamEvent` JSON | live LLM text deltas from streaming `llm_call` steps |
| `done` | `{ state: string }` | emitted when instance reaches terminal state; stream closes |
| `error` | `{ error: string }` | emitted if instance disappears during stream |

Query params: `poll_ms` (number, 100–5000, default 500). Concurrency limited by `AppState::stream_limiter` (default 256); returns 503 when exhausted.

##### POST /instances/{id}/signals – SendSignalRequest

```json
{
  "signal_type": "pause | resume | cancel | update_context | custom:<name>",
  "payload": <any JSON>
}
```

##### POST /instances/{id}/fork – ForkRequest

[INFERRED from openapi.rs schema reference `ForkRequest`] – forks an instance for time-travel; see `crate::instances::ForkRequest` schema.

##### POST /instances/{id}/resume-from/{block_id} – ResumeFromRequest

Body: `crate::instances::ResumeFromRequest` [INFERRED].

##### POST /instances/batch-action – BatchActionRequest

```json
{
  "action": "BatchAction",
  "filter": "BulkFilter"
}
```

Response: `BatchActionResponse`.

---

#### 2.4 Cron Schedules

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/cron` | `create_cron` | tenant | 201 / 400 |
| `GET` | `/cron` | `list_cron` | tenant | 200 |
| `GET` | `/cron/{id}` | `get_cron` | tenant | 200 / 404 |
| `PUT` | `/cron/{id}` | `update_cron` | tenant | 200 / 400 / 404 |
| `DELETE` | `/cron/{id}` | `delete_cron` | tenant | 204 |
| `GET` | `/cron/{id}/next-fires` | `next_fires` | tenant | 200 / 404 |

##### POST /cron – CreateCronRequest

| Field | Type (TS) | Required | Default | Notes |
|---|---|---|---|---|
| `tenant_id` | `string` | yes | – | |
| `namespace` | `string` | yes | – | |
| `sequence_id` | `string` (UUID) | yes | – | |
| `cron_expr` | `string` | yes | – | validated via `orch8_engine::cron::validate_cron_expr` |
| `timezone` | `string` | no | `"UTC"` | IANA tz name |
| `metadata` | `unknown` | no | `{}` | |
| `enabled` | `boolean` | no | `true` | |
| `overlap_policy` | `"allow" \| "skip" \| "buffer_one" \| "cancel_previous"` | no | `"allow"` | |

Response on 201:
```json
{ "id": "<uuid>", "next_fire_at": "<ISO8601 or null>" }
```

##### PUT /cron/{id} – UpdateCronRequest

All fields optional (partial update):

| Field | Type (TS) |
|---|---|
| `cron_expr` | `string \| null` |
| `timezone` | `string \| null` |
| `enabled` | `boolean \| null` |
| `metadata` | `unknown \| null` |
| `overlap_policy` | `OverlapPolicy \| null` |

##### GET /cron/{id}/next-fires – Query

| Param | Type | Required | Default | Range |
|---|---|---|---|---|
| `n` | `number` | no | 5 | 1–50 |

Response: `{ timezone: string, fires: string[] }` (ISO8601 UTC instants).

Business rules: cron expression validated on create and update. DST-correct next-fire calculation via `orch8_engine::cron::calculate_next_fire_after`.

---

#### 2.5 Workers & Tasks

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `GET` | `/workers` | `list_workers` | tenant | 200 |
| `GET` | `/handlers` | `list_handlers` | tenant | 200 |
| `GET` | `/workers/tasks` | `list_tasks` | tenant | 200 |
| `GET` | `/workers/tasks/stats` | `task_stats` | tenant | 200 |
| `POST` | `/workers/tasks/poll` | `poll_tasks` | tenant | 200 |
| `POST` | `/workers/tasks/poll/queue` | `poll_tasks_from_queue` | tenant | 200 |
| `POST` | `/workers/tasks/{id}/complete` | `complete_task` | tenant | 200 / 404 |
| `POST` | `/workers/tasks/{id}/fail` | `fail_task` | tenant | 200 / 404 |
| `POST` | `/workers/tasks/{id}/heartbeat` | `heartbeat_task` | tenant | 200 / 404 |
| `POST` | `/workers/commands` | `enqueue_command` | tenant | 201 |
| `DELETE` | `/workers/commands/{id}` | `ack_command` | tenant | 204 |
| `GET` | `/workers/{worker_id}/commands` | `list_commands` | tenant | 200 |
| `POST` | `/workers/version-pins` | `set_version_pin` | tenant | 200 |
| `GET` | `/workers/version-pins` | `list_version_pins` | tenant | 200 |
| `DELETE` | `/workers/version-pins/{tenant_id}/{handler_name}` | `delete_version_pin` | tenant | 204 |

##### POST /workers/tasks/poll – PollRequest

| Field | Type (TS) | Required | Default | Notes |
|---|---|---|---|---|
| `handler_name` | `string` | yes | – | |
| `worker_id` | `string` | yes | – | |
| `limit` | `number` | no | 1 | max 1000 |
| `version` | `string \| null` | no | – | worker build version |

Version pin enforcement: if a `(tenant, handler)` version pin exists and `version` doesn't satisfy `min_version`, returns empty `[]` without claiming tasks (workers.rs:281-299). Registration is still recorded.

##### POST /workers/tasks/poll/queue – QueuePollRequest

Same as `PollRequest` plus:

| Field | Type (TS) | Required |
|---|---|---|
| `queue_name` | `string` | yes |

##### POST /workers/tasks/{id}/complete – CompleteRequest

| Field | Type (TS) | Required | Notes |
|---|---|---|---|
| `worker_id` | `string` | yes | |
| `output` | `unknown` | yes | JSON output stored as `BlockOutput` |
| `logs` | `StepLogEntry[]` | no | default `[]` |

Business rules: output object keys are merged into `context.data`. If instance is terminal or paused at completion time, output is accepted but state transition is skipped. Circuit breaker success is recorded.

##### POST /workers/tasks/{id}/fail – FailRequest

| Field | Type (TS) | Required | Notes |
|---|---|---|---|
| `worker_id` | `string` | yes | |
| `message` | `string` | yes | error message |
| `retryable` | `boolean` | no | default `false` |
| `logs` | `StepLogEntry[]` | no | default `[]` |

Business rules: if `retryable=true`, checks step's `RetryPolicy`; if `attempt + 1 < max_attempts`, creates a new pending task with `attempt+1`. Otherwise fails the instance. Circuit breaker failure recorded in all cases.

##### GET /workers – Query params

| Param | Type | Default | Notes |
|---|---|---|---|
| `alive_within_secs` | `number` | 60 | liveness window |
| `include_stale` | `boolean` | `false` | include workers outside window |

Response: `WorkerInfo[]`:
```json
{
  "worker_id": "string",
  "handlers": "string[]",
  "queues": "string[]",
  "version": "string | null",
  "last_seen_at": "ISO8601",
  "alive": "boolean",
  "in_flight": "number"
}
```

##### GET /workers/tasks – Query params

| Param | Type | Default | Max |
|---|---|---|---|
| `tenant_id` | `string` | – | – |
| `state` | `string` | – | comma-sep: `pending,claimed,completed,failed` |
| `handler_name` | `string` | – | – |
| `worker_id` | `string` | – | – |
| `queue_name` | `string` | – | – |
| `limit` | `number` | 50 | 1000 |
| `offset` | `number` | 0 | – |

##### POST /workers/version-pins – SetVersionPinRequest

```json
{ "tenant_id": "string", "handler_name": "string", "min_version": "string" }
```

---

#### 2.6 Triggers

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/triggers` | `create_trigger` | tenant | 201 / 400 |
| `GET` | `/triggers` | `list_triggers` | tenant | 200 |
| `GET` | `/triggers/{slug}` | `get_trigger` | tenant | 200 / 404 |
| `DELETE` | `/triggers/{slug}` | `delete_trigger` | tenant | 204 / 404 |
| `POST` | `/triggers/{slug}/fire` | `fire_trigger` | tenant | 201 / 400 / 404 |

##### POST /triggers – CreateTriggerRequest

| Field | Type (TS) | Required | Default | Constraints |
|---|---|---|---|---|
| `slug` | `string` | yes | – | 1–255 chars |
| `sequence_name` | `string` | yes | – | 1–255 chars |
| `version` | `number \| null` | no | – | |
| `tenant_id` | `string` | yes | – | |
| `namespace` | `string` | no | `"default"` | |
| `secret` | `string \| null` | no | – | |
| `trigger_type` | `"webhook" \| "event" \| "nats" \| "activepieces_poll"` | no | `"webhook"` | |
| `config` | `unknown` | no | `{}` | validated if `trigger_type = "activepieces_poll"` |

Business rules:
- `activepieces_poll` config is validated against `orch8_engine::ap_poll::parse_config`.
- `POST /triggers/{slug}/fire` checks `X-Trigger-Secret` header (constant-time comparison) if trigger has a `secret`.
- `fire_trigger` sets `metadata.source = "http_fire"`.

##### GET /triggers/{slug}

For `trigger_type = "activepieces_poll"`, the response includes an additional `poll_state` field:
```json
{
  "poll_state": {
    "cursor": "...",
    "last_error": "...",
    "consecutive_failures": 0,
    "last_poll_at": "ISO8601"
  }
}
```

---

#### 2.7 Webhooks (Public – No API Key Auth)

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/webhooks/{slug}` | `webhooks::public_webhook` | HMAC headers only | 202 / 401 / 404 |

**Not** mounted through `build_router` – mounted by `orch8-server` after auth middleware. Body size limit: 1 MB.

Required headers (when trigger has a secret):

| Header | Type | Notes |
|---|---|---|
| `x-trigger-secret` | `string` | constant-time compared against trigger's `secret` |
| `x-trigger-timestamp` | `string` (unix epoch i64) | must be within ±300s (past) / ±60s (future) of server clock |
| `x-trigger-nonce` | `string` | unique per-request; replay prevention (5m window, up to 100k nonces cached) |

Rejection rules:
- `trigger_type != "webhook"` → 404 (does not reveal existence).
- `trigger.enabled = false` → 404.
- No `secret` configured → 401 (webhooks without secrets rejected to prevent unauthenticated fires).

Response on 202:
```json
{ "instance_id": "<uuid>", "trigger": "<slug>" }
```

---

#### 2.8 Webhook Outbox (Operator – Global, Not Tenant-Scoped)

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `GET` | `/webhooks/outbox` | `list_outbox` | root | 200 |
| `POST` | `/webhooks/outbox/{id}/redeliver` | `redeliver_outbox` | root | 200 / 404 / 502 |
| `DELETE` | `/webhooks/outbox/{id}` | `discard_outbox` | root | 204 |

##### GET /webhooks/outbox – Query

| Param | Type | Default | Max |
|---|---|---|---|
| `limit` | `number` | 100 | 1000 |

Business rules: on `redeliver`, if delivery succeeds the row is deleted; on failure `502 BadGateway` is returned with the reason.

---

#### 2.9 Sessions

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/sessions` | `create_session` | tenant | 201 |
| `GET` | `/sessions/{id}` | `get_session` | tenant | 200 |
| `GET` | `/sessions/by-key/{tenant_id}/{key}` | `get_session_by_key` | tenant | 200 |
| `PATCH` | `/sessions/{id}/data` | `update_session_data` | tenant | 200 |
| `PATCH` | `/sessions/{id}/state` | `update_session_state` | tenant | 200 |
| `GET` | `/sessions/{id}/instances` | `list_session_instances` | tenant | 200 |

##### POST /sessions – CreateSessionRequest

| Field | Type (TS) | Required | Constraints |
|---|---|---|---|
| `tenant_id` | `string` | yes | |
| `session_key` | `string` | yes | 1–512 chars |
| `data` | `unknown` | no | default `{}` |
| `expires_at` | `string` (ISO8601) | no | optional expiry |

##### GET /sessions/by-key path params

| Param | Type | Max |
|---|---|---|
| `tenant_id` | `string` | 128 chars |
| `key` | `string` | – |

---

#### 2.10 Circuit Breakers

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `GET` | `/circuit-breakers` | `list_all_breakers` | tenant | 200 |
| `GET` | `/tenants/{tenant_id}/circuit-breakers` | `list_breakers_for_tenant` | tenant | 200 |
| `GET` | `/tenants/{tenant_id}/circuit-breakers/{handler}` | `get_breaker` | tenant | 200 / 404 |
| `POST` | `/tenants/{tenant_id}/circuit-breakers/{handler}/reset` | `reset_breaker` | tenant | 200 |

Business rules:
- `GET /circuit-breakers` returns an empty list for unscoped callers (no cross-tenant info leak).
- Path `{tenant_id}` is checked against the caller's tenant header via `guard_tenant`; returns 404 on mismatch (not 403, to avoid tenant enumeration).
- Endpoints return `503` when circuit breaker registry is not configured.

States: `CircuitBreakerState` has a `BreakerState` field: `Closed | Open | HalfOpen`.

---

#### 2.11 Resource Pools

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/pools` | `create_pool` | tenant | 201 |
| `GET` | `/pools` | `list_pools` | tenant | 200 |
| `GET` | `/pools/{id}` | `get_pool` | tenant | 200 / 404 |
| `DELETE` | `/pools/{id}` | `delete_pool` | tenant | 204 |
| `GET` | `/pools/{pool_id}/resources` | `list_resources` | tenant | 200 |
| `POST` | `/pools/{pool_id}/resources` | `add_resource` | tenant | 201 |
| `PUT` | `/pools/{pool_id}/resources/{resource_id}` | `update_resource` | tenant | 200 |
| `DELETE` | `/pools/{pool_id}/resources/{resource_id}` | `delete_resource` | tenant | 204 |

##### POST /pools – CreatePoolRequest

| Field | Type (TS) | Required | Default |
|---|---|---|---|
| `tenant_id` | `string` | yes | – |
| `name` | `string` | yes | – |
| `strategy` | `"round_robin" \| "weighted" \| "random" \| ...` | no | `"round_robin"` |

##### POST /pools/{pool_id}/resources – AddResourceRequest

| Field | Type (TS) | Required | Default | Constraints |
|---|---|---|---|---|
| `resource_key` | `string` | yes | – | 1–255 chars |
| `name` | `string` | yes | – | 1–255 chars |
| `weight` | `number` | no | 1 | must be ≥1 |
| `daily_cap` | `number` | no | 0 | |
| `warmup_start` | `string` | no | – | YYYY-MM-DD format |
| `warmup_days` | `number` | no | 0 | |
| `warmup_start_cap` | `number` | no | 0 | |

##### PUT /pools/{pool_id}/resources/{resource_id} – UpdateResourceRequest

All fields optional:

| Field | Type (TS) |
|---|---|
| `name` | `string \| null` |
| `weight` | `number \| null` |
| `enabled` | `boolean \| null` |
| `daily_cap` | `number \| null` |
| `warmup_start` | `string \| null` (YYYY-MM-DD) |
| `warmup_days` | `number \| null` |
| `warmup_start_cap` | `number \| null` |

---

#### 2.12 Cluster

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `GET` | `/cluster/nodes` | `list_nodes` | any | 200 |
| `POST` | `/cluster/nodes/{id}/drain` | `drain_node` | any | 200 |

Both handlers have no explicit `tenant_ctx`; no tenant-scoping enforcement [INFERRED – root/admin only in practice].

---

#### 2.13 Credentials

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/credentials` | `create_credential` | tenant | 201 |
| `GET` | `/credentials` | `list_credentials` | tenant | 200 |
| `GET` | `/credentials/{id}` | `get_credential` | tenant | 200 / 404 |
| `PATCH` | `/credentials/{id}` | `update_credential` | tenant | 200 / 404 |
| `DELETE` | `/credentials/{id}` | `delete_credential` | tenant | 204 |

**Secret values are never returned.** Responses use `CredentialResponse` which strips `value` and `refresh_token`, replacing the latter with `has_refresh_token: boolean`.

##### POST /credentials – CreateCredentialRequest

| Field | Type (TS) | Required | Constraints |
|---|---|---|---|
| `id` | `string` | yes | 1–255 chars; `[a-zA-Z0-9\-_.]` only (URL-safe) |
| `name` | `string` | yes | non-empty |
| `kind` | `CredentialKind` | no | `"api_key" \| "oauth2" \| "basic" \| ...` |
| `value` | `string` | yes | write-only; stored encrypted |
| `tenant_id` | `string` | no | default `""` |
| `expires_at` | `string` (ISO8601) | no | |
| `refresh_url` | `string` | no | |
| `refresh_token` | `string` | no | required when `kind = "oauth2"` and `refresh_url` set |
| `description` | `string` | no | |

##### CredentialResponse (read shape)

| Field | Type (TS) | Notes |
|---|---|---|
| `id` | `string` | |
| `tenant_id` | `string` | |
| `name` | `string` | |
| `kind` | `CredentialKind` | |
| `enabled` | `boolean` | |
| `expires_at` | `string \| null` | |
| `refresh_url` | `string \| null` | |
| `has_refresh_token` | `boolean` | |
| `description` | `string \| null` | |
| `created_at` | `string` | ISO8601 |
| `updated_at` | `string` | ISO8601 |

---

#### 2.14 API Keys (Admin-Only)

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/api-keys` | `create_api_key` | **root key only** | 201 / 403 |
| `GET` | `/api-keys` | `list_api_keys` | **root key only** | 200 / 403 |
| `DELETE` | `/api-keys/{id}` | `revoke_api_key` | **root key only** | 204 / 403 / 404 |

Per-tenant keys calling these endpoints receive `403 Forbidden`.

##### POST /api-keys – CreateApiKeyRequest

| Field | Type (TS) | Required | Notes |
|---|---|---|---|
| `tenant_id` | `string` | yes | non-empty |
| `name` | `string` | no | default `""` |
| `expires_at` | `string` (ISO8601) | no | omit for non-expiring |

Response on 201 – `CreatedApiKey` (plaintext `secret` returned only once):

```json
{
  "id": "string",
  "tenant_id": "string",
  "name": "string",
  "secret": "plaintext-secret-store-now",
  "created_at": "ISO8601",
  "expires_at": "ISO8601 | null"
}
```

##### GET /api-keys – Query

| Param | Type | Required |
|---|---|---|
| `tenant_id` | `string` | yes |

Response: `ApiKeyInfo[]` – never includes `secret` or its hash.

---

#### 2.15 Queue Routing Rules

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/routing-rules` | `create_rule` | tenant | 201 / 400 |
| `GET` | `/routing-rules` | `list_rules` | tenant | 200 |
| `GET` | `/routing-rules/{id}` | `get_rule` | tenant | 200 / 404 |
| `DELETE` | `/routing-rules/{id}` | `delete_rule` | tenant | 204 / 404 |

##### POST /routing-rules – CreateRoutingRuleRequest

| Field | Type (TS) | Required | Default | Notes |
|---|---|---|---|---|
| `tenant_id` | `string` | yes | – | |
| `handler_name` | `string` | yes | – | non-empty |
| `match_queue` | `string \| null` | no | – | optional source queue filter |
| `queue_override` | `string` | yes | – | non-empty; the target queue name |
| `priority` | `number` (i32) | no | 0 | higher wins |
| `enabled` | `boolean` | no | `true` | |

---

#### 2.16 Queue Dispatch Config

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/queues/dispatch` | `set_dispatch` | tenant | 200 / 400 |
| `GET` | `/queues/dispatch` | `list_dispatch` | tenant | 200 |
| `DELETE` | `/queues/dispatch/{tenant_id}/{queue_name}` | `delete_dispatch` | tenant | 204 |

##### POST /queues/dispatch – SetDispatchRequest

| Field | Type (TS) | Required | Notes |
|---|---|---|---|
| `tenant_id` | `string` | yes | |
| `queue_name` | `string` | yes | non-empty |
| `mode` | `"poll" \| "push"` | yes | |
| `push_url` | `string \| null` | cond. | required when `mode = "push"` |
| `secret` | `string \| null` | no | HMAC signing secret; never echoed back in response |

---

#### 2.17 Approvals

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `GET` | `/approvals` | `approvals::list_approvals` | tenant | 200 |

##### GET /approvals – Query

| Param | Type | Default |
|---|---|---|
| `tenant_id` | `string \| null` | – |
| `namespace` | `string \| null` | – |
| `offset` | `number` | 0 |
| `limit` | `number` | 100 (max 1000) |

Response: `ApprovalsResponse`:
```json
{
  "items": [
    {
      "instance_id": "uuid",
      "tenant_id": "string",
      "namespace": "string",
      "sequence_id": "uuid",
      "sequence_name": "string",
      "block_id": "string",
      "prompt": "string",
      "choices": [{ "label": "string", "value": "string" }],
      "store_as": "string | null",
      "timeout_seconds": "number | null",
      "escalation_handler": "string | null",
      "waiting_since": "ISO8601",
      "deadline": "ISO8601 | null",
      "metadata": "unknown",
      "allow_comment": "boolean"
    }
  ],
  "total": "number"
}
```

Default choices when `HumanInputDef.choices` is null: `[{ label: "Yes", value: "yes" }, { label: "No", value: "no" }]`.

---

#### 2.18 Rollback Policies

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/rollback-policies` | `create_policy` | tenant | 201 |
| `GET` | `/rollback-policies` | `list_policies` | tenant | 200 |
| `GET` | `/rollback-policies/{name}` | `get_policy` | tenant | 200 |
| `DELETE` | `/rollback-policies/{name}` | `delete_policy` | tenant | 204 |

Path param `{name}` is the `sequence_name`. Query param `tenant_id` also accepted on `GET` and `DELETE`.

##### POST /rollback-policies – CreatePolicyRequest

| Field | Type (TS) | Required | Constraints |
|---|---|---|---|
| `tenant_id` | `string \| null` | no | defaults to `"default"` |
| `sequence_name` | `string` | yes | non-empty |
| `error_rate_threshold` | `number` | yes | 0.0–1.0 |
| `time_window_secs` | `number` (i32) | yes | must be positive |
| `cooldown_secs` | `number \| null` | no | |
| `confirmation_window_secs` | `number \| null` | no | must be `< time_window_secs` when set |
| `webhook_url` | `string \| null` | no | must be valid http/https URL with host |

Auto-rollback behavior (telemetry.rs): when `ingest_errors` is called with a `sequence_name`, `check_rollback` runs:
1. Cooldown guard: skip if last rollback < `cooldown_secs` ago.
2. Primary check: error rate over `time_window_secs`.
3. Confirmation guard: also check rate over `confirmation_window_secs` (both must exceed threshold).
4. On breach: record rollback event, deprecate sequence, mark `"unpublished"`, publish manifest removal, fire optional `webhook_url`.

---

#### 2.19 Usage

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `GET` | `/usage` | `usage::get_usage` | tenant or admin | 200 / 400 |

##### GET /usage – Query

| Param | Type | Required | Notes |
|---|---|---|---|
| `tenant` | `string` | cond. | required for unscoped callers; ignored for tenant-scoped |
| `start` | `string` (RFC 3339) | no | default: `end - 30d` |
| `end` | `string` (RFC 3339) | no | default: now |

Response:
```json
{
  "tenant": "string",
  "start": "ISO8601",
  "end": "ISO8601",
  "usage": [
    {
      "kind": "string",
      "model": "string",
      "events": "number",
      "input_tokens": "number",
      "output_tokens": "number",
      "cost_usd": "number | null"
    }
  ],
  "total_cost_usd": "number",
  "cost_is_estimate": true
}
```

Cost is always `true` (list prices, no discounts). Cost `null` for unknown models. Rounded to 6 decimal places.

---

#### 2.20 Telemetry (Mobile)

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/telemetry/mobile` | `ingest_telemetry` | tenant | 202 |
| `POST` | `/telemetry/mobile/errors` | `ingest_errors` | tenant | 202 |
| `GET` | `/telemetry/mobile/dashboard` | `dashboard_queries` | tenant | 200 |

##### POST /telemetry/mobile – IngestTelemetryRequest

| Field | Type (TS) | Required | Constraint |
|---|---|---|---|
| `events` | `TelemetryBatchItem[]` | yes | max 500 items |
| `tenant_id` | `string \| null` | no | |

`TelemetryBatchItem`: `{ event_type, payload, timestamp, device: DeviceContext }`.
`DeviceContext`: `{ device_id, os_name, os_version, app_version, sdk_version }`.

Response: `{ accepted: number }` (202).

##### POST /telemetry/mobile/errors – IngestErrorRequest

| Field | Type (TS) | Required |
|---|---|---|
| `error_type` | `string` | yes |
| `message` | `string` | yes |
| `stack_trace` | `string \| null` | no |
| `device` | `DeviceContext` | yes |
| `tenant_id` | `string \| null` | no |
| `instance_id` | `string \| null` | no |
| `sequence_name` | `string \| null` | no |

If `sequence_name` present, auto-rollback check is triggered asynchronously.

##### GET /telemetry/mobile/dashboard – Query

| Param | Type | Required | Notes |
|---|---|---|---|
| `query_type` | `"sync_completed_versions" \| "error_rate_per_sequence" \| "top_failing_steps" \| "device_os_breakdown"` | yes | |
| `tenant_id` | `string \| null` | no | |
| `start_time` | `string` (ISO8601) | no | default: now - 7d |
| `end_time` | `string` (ISO8601) | no | default: now |

Response: `{ rows: [{ dimension: string, count: number, percentage: number }] }`.

---

#### 2.21 Mobile Sync (Conditional – only when `mobile_sync_enabled = true`)

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/mobile/sync` | `handle_sync` | tenant | 200 |
| `POST` | `/mobile/devices/register` | `register_device` | tenant | 201 |
| `GET` | `/mobile/devices` | `list_devices` | tenant | 200 |
| `GET` | `/mobile/approvals` | `list_approvals` | tenant | 200 |
| `POST` | `/mobile/approvals/{id}/resolve` | `resolve_approval` | tenant | 200 / 404 |
| `GET` | `/mobile/status` | `list_status` | tenant | 200 |
| `POST` | `/mobile/commands` | `create_command` | tenant | 201 |

All arrays in `/mobile/sync` request are capped at 500 items each.

`resolve_approval`: verifies ownership before mutation (mobile_sync.rs:407-430). Cross-tenant resolution → 404 (not 403).

`create_command`: verifies device ownership before enqueuing (mobile_sync.rs:559-571). On approval/command creation triggers fire-and-forget silent push notification.

---

#### 2.22 Plugins

| Method | Path | Handler fn | Auth | Success |
|---|---|---|---|---|
| `POST` | `/plugins` | `create_plugin` | tenant | 201 |
| `GET` | `/plugins` | `list_plugins` | tenant | 200 |
| `GET` | `/plugins/{name}` | `get_plugin` | tenant | 200 / 404 |
| `PATCH` | `/plugins/{name}` | `update_plugin` | tenant | 200 / 404 |
| `DELETE` | `/plugins/{name}` | `delete_plugin` | tenant | 204 / 404 |

##### POST /plugins – CreatePluginRequest

| Field | Type (TS) | Required | Constraints |
|---|---|---|---|
| `name` | `string` | yes | 1–255 chars |
| `plugin_type` | `"wasm" \| "grpc" \| ...` | yes | `PluginType` enum |
| `source` | `string` | yes | 1–2048 chars; WASM path or gRPC endpoint |
| `tenant_id` | `string` | no | default `""` |
| `config` | `unknown` | no | default `{}` |
| `description` | `string \| null` | no | |

---

#### 2.23 MCP Server (JSON-RPC 2.0 over HTTP)

| Method | Path | Handler fn | Auth | Notes |
|---|---|---|---|---|
| `POST` | `/mcp` | `mcp_server::handle_mcp` | tenant | Single endpoint, routes via `method` field |

This is **one HTTP endpoint** that speaks JSON-RPC 2.0. It is mounted inside `api_routes()` so the same tenant auth middleware applies.

##### MCP Methods

| Method | Description |
|---|---|
| `initialize` | Protocol handshake; echoes client's `protocolVersion` if known (`2024-11-05`, `2025-03-26`, `2025-06-18`), otherwise defaults to `2025-06-18` |
| `ping` | Keepalive; returns `{}` |
| `tools/list` | Returns the static 8-tool catalog |
| `tools/call` | Dispatches to named tool |

Notifications (no `id` field): HTTP 202, empty body.

Error codes: `-32700` parse error, `-32600` invalid request, `-32601` unknown method, `-32602` invalid params (including unknown tool name).

Domain failures come back as `tools/call` result with `isError: true`, NOT as JSON-RPC errors.

##### MCP Tools (all map to existing HTTP endpoints)

| Tool name | HTTP equivalent | Required args | Optional args |
|---|---|---|---|
| `list_sequences` | `GET /sequences` | – | `namespace: string`, `limit: integer (1–1000, default 200)` |
| `create_instance` | `POST /instances` | one of `sequence_id` or `sequence_name` | `tenant_id`, `namespace` (default `"default"`), `context`, `metadata`, `budget`, `dry_run`, `idempotency_key` |
| `get_instance_status` | `GET /instances/{id}` | `instance_id: string (UUID)` | – |
| `get_instance_outputs` | `GET /instances/{id}/outputs` | `instance_id: string (UUID)` | – |
| `send_signal` | `POST /instances/{id}/signals` | `instance_id: string (UUID)`, `signal: string` | `payload: any` |
| `retry_instance` | `POST /instances/{id}/retry` | `instance_id: string (UUID)` | – |
| `list_dlq` | `GET /instances/dlq` | – | `limit: integer (1–1000, default 100)` |
| `get_usage` | `GET /usage` | – | `tenant: string`, `start: date-time`, `end: date-time` |

All 8 tools map to existing HTTP endpoints (NOT-HTTP-only tools: none).

`send_signal` signal values: `pause`, `resume`, `cancel`, `update_context`, `custom:<name>`.

`create_instance` tenant resolution order: explicit `tenant_id` arg → middleware-bound tenant → `"default"`. A mismatching explicit tenant still 403s at the REST handler level.

---

### 3. Model Pricing (Internal – No HTTP Endpoint)

`model_pricing.rs` is a pure library module. It provides `price_for_model(model: &str) -> Option<ModelPrice>` and `estimate_cost_usd(model, input_tokens, output_tokens) -> Option<f64>` used by `GET /usage`.

**No HTTP endpoints are registered from `model_pricing.rs`.**

Lookup algorithm: normalize (trim, lowercase, strip `provider/` prefix), then longest-prefix match with separator boundary. `gpt-4o-mini` hits its own entry and does NOT fall back to `gpt-4o`.

Override via `ORCH8_MODEL_PRICING` env var: JSON object of `{ "prefix": { "input_per_1m": f64, "output_per_1m": f64 } }`, merged over defaults. Invalid JSON → warning logged, defaults used.

Built-in families (mid-2025 list prices, USD per 1M tokens):

| Prefix | Input/1M | Output/1M |
|---|---|---|
| `gpt-4o` | 2.50 | 10.00 |
| `gpt-4o-mini` | 0.15 | 0.60 |
| `gpt-4.1` | 2.00 | 8.00 |
| `gpt-4.1-mini` | 0.40 | 1.60 |
| `gpt-4.1-nano` | 0.10 | 0.40 |
| `o1` | 15.00 | 60.00 |
| `o3` | 2.00 | 8.00 |
| `o4-mini` | 1.10 | 4.40 |
| `claude-opus-4` | 15.00 | 75.00 |
| `claude-sonnet-4` | 3.00 | 15.00 |
| `claude-haiku` | 1.00 | 5.00 |
| `claude-haiku-4-5` | 1.00 | 5.00 |
| `claude-3-5-sonnet` | 3.00 | 15.00 |
| `claude-3-7-sonnet` | 3.00 | 15.00 |
| `claude-3-opus` | 15.00 | 75.00 |
| `gemini-2.5-pro` | 1.25 | 10.00 |
| `gemini-2.5-flash` | 0.30 | 2.50 |
| `deepseek-chat` | 0.27 | 1.10 |
| `deepseek-reasoner` | 0.55 | 2.19 |
| … (full list: 44 entries) | | |

---

### 4. Core Data Entities

These entities are used across the API surface (sourced from `orch8_types` references in `openapi.rs`). SQL schemas are not in the assigned files; column details are [INFERRED] from handler field access patterns.

| Entity | Key Fields (TS types) | Notes |
|---|---|---|
| `TaskInstance` | `id: string(UUID)`, `sequence_id: string(UUID)`, `tenant_id: string`, `namespace: string`, `state: InstanceState`, `next_fire_at: string\|null`, `priority: Priority`, `timezone: string`, `metadata: unknown`, `context: ExecutionContext`, `concurrency_key: string\|null`, `max_concurrency: number\|null`, `idempotency_key: string\|null`, `session_id: string(UUID)\|null`, `parent_instance_id: string(UUID)\|null`, `budget: Budget\|null`, `created_at: string`, `updated_at: string` | Core workflow instance |
| `SequenceDefinition` | `id: string(UUID)`, `tenant_id: string`, `namespace: string`, `name: string`, `version: number`, `deprecated: boolean`, `status: SequenceStatus`, `blocks: BlockDefinition[]`, `interceptors: InterceptorDef[]\|null`, `input_schema: unknown\|null`, `sla: SlaPolicy\|null`, `created_at: string` | Workflow definition |
| `CronSchedule` | `id: string(UUID)`, `tenant_id: string`, `namespace: string`, `sequence_id: string(UUID)`, `cron_expr: string`, `timezone: string`, `enabled: boolean`, `overlap_policy: OverlapPolicy`, `metadata: unknown`, `skipped_fires: number`, `last_skipped_at: string\|null`, `last_triggered_at: string\|null`, `next_fire_at: string\|null`, `created_at: string`, `updated_at: string` | Cron trigger |
| `WorkerTask` | `id: string(UUID)`, `instance_id: string(UUID)`, `block_id: string`, `handler_name: string`, `queue_name: string\|null`, `params: unknown`, `context: unknown`, `attempt: number`, `timeout_ms: number\|null`, `state: WorkerTaskState`, `worker_id: string\|null`, `claimed_at: string\|null`, `heartbeat_at: string\|null`, `completed_at: string\|null`, `output: unknown\|null`, `error_message: string\|null`, `error_retryable: boolean\|null`, `created_at: string` | External worker task |
| `TriggerDef` | `slug: string`, `sequence_name: string`, `version: number\|null`, `tenant_id: string`, `namespace: string`, `enabled: boolean`, `secret: SecretString\|null`, `trigger_type: TriggerType`, `config: unknown`, `created_at: string`, `updated_at: string` | Event trigger |
| `Session` | `id: string(UUID)`, `tenant_id: string`, `session_key: string`, `data: unknown`, `state: SessionState`, `created_at: string`, `updated_at: string`, `expires_at: string\|null` | Cross-instance session |
| `ResourcePool` | `id: string(UUID)`, `tenant_id: string`, `name: string`, `strategy: RotationStrategy`, `round_robin_index: number`, `created_at: string`, `updated_at: string` | Resource pool |
| `PoolResource` | `id: string(UUID)`, `pool_id: string(UUID)`, `resource_key: string`, `name: string`, `weight: number`, `enabled: boolean`, `daily_cap: number`, `daily_usage: number`, `daily_usage_date: string\|null`, `warmup_start: string\|null`, `warmup_days: number`, `warmup_start_cap: number`, `created_at: string` | Resource within pool |
| `ClusterNode` | `id: string(UUID)`, ...`NodeStatus` | Cluster node |
| `QueueRoutingRule` | `id: string(UUID)`, `tenant_id: string`, `handler_name: string`, `match_queue: string\|null`, `queue_override: string`, `priority: number`, `enabled: boolean`, `created_at: string`, `updated_at: string` | Queue routing rule |
| `QueueDispatchConfig` | `tenant_id: string`, `queue_name: string`, `mode: "poll"\|"push"`, `push_url: string\|null`, `secret: string\|null` (write-only), `created_at: string`, `updated_at: string` | Queue dispatch config |
| `WebhookOutboxEntry` | `id: string(UUID)`, `url: string`, ...payload fields | Parked outbox delivery |
| `ExecutionNode` | `id: string(UUID)`, `instance_id: string(UUID)`, `block_id: string`, `parent_id: string(UUID)\|null`, `block_type: BlockType`, `branch_index: number\|null`, `state: NodeState`, `started_at: string\|null`, `completed_at: string\|null` | Node in execution tree |
| `BlockOutput` | `id: string(UUID)`, `instance_id: string(UUID)`, `block_id: string`, `output: unknown`, `output_ref: string\|null`, `output_size: number`, `attempt: number`, `created_at: string` | Step output |
| `Checkpoint` | fields from `orch8_types::checkpoint::Checkpoint` | [INFERRED from openapi.rs reference] |
| `AuditLogEntry` | fields from `orch8_types::audit::AuditLogEntry` | [INFERRED from openapi.rs reference] |
| `WorkerRegistration` | `worker_id: string`, `handler_name: string`, `queue_name: string\|null`, `version: string\|null`, `tenant_id: string\|null`, `last_seen_at: string` | Worker heartbeat record |
| `WorkerVersionPin` | `tenant_id: string`, `handler_name: string`, `min_version: string`, `created_at: string`, `updated_at: string` | Version gate |
| `WorkerCommand` | `id: string(UUID)`, `worker_id: string`, `command: WorkerCommandKind`, `payload: unknown`, `created_at: string` | Worker control command |
| `CredentialDef` | server-internal; exposed as `CredentialResponse` (secret stripped) | |
| `ApiKeyRecord` | `id: string`, `tenant_id: string`, `name: string`, `created_at: string`, `last_used_at: string\|null`, `expires_at: string\|null`, `revoked: boolean` | API key metadata |
| `RollbackPolicy` | `id: number(i64)`, `tenant_id: string`, `sequence_name: string`, `error_rate_threshold: number`, `time_window_secs: number`, `enabled: boolean`, `cooldown_secs: number`, `confirmation_window_secs: number`, `webhook_url: string\|null`, `created_at: string`, `updated_at: string` | Auto-rollback policy |

---

### 5. Enum / State Sets

#### InstanceState
`Scheduled | Running | Paused | Waiting | Completed | Failed | Cancelled`

Terminal states: `Completed`, `Failed`, `Cancelled` (lib: streaming.rs:56-60).

#### SequenceStatus
`Draft | Staging | Production | Unpublished`

Allowed transitions (sequences.rs: `SequenceStatus::can_transition_to`): [INFERRED – exact transition table lives in `orch8_types::sequence::SequenceStatus`].

#### WorkerTaskState
`Pending | Claimed | Completed | Failed`

#### SessionState
`Active | ...` [INFERRED – full variant list in `orch8_types::session::SessionState`]

#### BreakerState (circuit breaker)
`Closed | Open | HalfOpen`

#### OverlapPolicy (cron)
`allow | skip | buffer_one | cancel_previous`

#### TriggerType
`webhook | event | nats | activepieces_poll`

#### WorkerCommandKind
`drain | reload | ping`

#### NodeState
`Pending | Running | Waiting | Completed | Failed | Skipped` [INFERRED from workers.rs:729,979]

#### BlockType
[INFERRED – from `orch8_types::execution::BlockType`]

---

### 6. Business Rules Summary

| # | Rule | Source |
|---|---|---|
| 1 | Duplicate `block_id` in a sequence rejected at authoring | sequences.rs:50 |
| 2 | `input_schema` validated as well-formed JSON Schema at sequence create | sequences.rs:55-58 |
| 3 | Template expressions linted on sequence create; warnings returned in 201 | sequences.rs:61-69 |
| 4 | `DELETE /sequences/{id}` blocked when active (non-terminal) instances exist | sequences.rs:205-224 |
| 5 | Sequence status transitions validated against allowed-transitions matrix | sequences.rs:546-553 |
| 6 | Sequence promote requires `Staging` source status | sequences.rs:499-502 |
| 7 | `migrate-instance` blocked across tenant boundaries | sequences.rs:392-398 |
| 8 | `migrate-instance` blocked for terminal instances | sequences.rs:372-376 |
| 9 | Credentials `id` must match `[a-zA-Z0-9\-_.]` (URL-safe for `credentials://` scheme) | credentials.rs:154-160 |
| 10 | `oauth2` credential with `refresh_url` requires `refresh_token` | credentials.rs:161-166 |
| 11 | Credential secret values never returned in API responses | credentials.rs:84-103 |
| 12 | API key plaintext returned only once at creation (SHA-256 hash stored) | api_keys.rs:8-11 |
| 13 | API key management requires root/admin key – per-tenant keys receive 403 | api_keys.rs:33-42 |
| 14 | Worker version pins: workers below `min_version` get empty poll result | workers.rs:281-299 |
| 15 | `complete_task`: output object keys shallow-merged into `context.data` | workers.rs:703-717 |
| 16 | `complete_task` / `fail_task`: terminal/paused instance skips state transition, still accepts work | workers.rs:683-700, 894-911 |
| 17 | `fail_task`: `retryable=true` checks `RetryPolicy.max_attempts`; creates new pending task with `attempt+1` | workers.rs:920-1092 |
| 18 | Circuit breaker outcome recorded for external worker success/failure | workers.rs:812-816, 1120-1128 |
| 19 | Cron expression validated on create and update | cron.rs:139-141, 298-299 |
| 20 | `next_fires` n clamped to 1–50 | cron.rs:241 |
| 21 | Trigger `slug` and `sequence_name` max 255 chars | triggers.rs:83-92 |
| 22 | `activepieces_poll` trigger config validated at creation | triggers.rs:95-99 |
| 23 | `fire_trigger` checks `x-trigger-secret` header (constant-time) | triggers.rs:270-277 |
| 24 | Public webhook requires HMAC secret, timestamp within 300s past / 60s future, and unique nonce | webhooks.rs:120-181 |
| 25 | Public webhook without configured secret is rejected (unsafe) | webhooks.rs:122-129 |
| 26 | Pool `resource_key` 1–255 chars; `weight ≥ 1`; `name` 1–255 chars | pools.rs:192-204 |
| 27 | `warmup_start` must parse as `YYYY-MM-DD` | pools.rs:213-220 |
| 28 | Circuit breaker path `{tenant_id}` returns 404 (not 403) on mismatch to avoid tenant enumeration | circuit_breakers.rs:19-23 |
| 29 | `GET /circuit-breakers` returns empty list for unscoped callers | circuit_breakers.rs:56-64 |
| 30 | Session `session_key` 1–512 chars | sessions.rs:50-53 |
| 31 | Session `by-key` `tenant_id` max 128 chars | sessions.rs:110-113 |
| 32 | `rollback-policies` `error_rate_threshold` in [0.0, 1.0], `time_window_secs > 0` | rollback.rs:79-86 |
| 33 | Rollback `webhook_url` must be http/https with host | rollback.rs:91-106 |
| 34 | Auto-rollback cooldown and confirmation-window hysteresis guards | telemetry.rs:187-246 |
| 35 | Auto-rollback deprecates sequence and marks `"unpublished"` on breach | telemetry.rs:262-279 |
| 36 | SSE stream concurrency capped (default 256); returns 503 when full | streaming.rs:101-107 |
| 37 | SSE stream poll interval clamped to 100–5000ms | streaming.rs:117 |
| 38 | Mobile sync arrays max 500 items each | mobile_sync.rs:95-109 |
| 39 | Mobile `resolve_approval`: ownership verified before mutation | mobile_sync.rs:407-430 |
| 40 | Mobile `create_command`: device ownership verified before enqueue | mobile_sync.rs:559-571 |
| 41 | Queue dispatch `push` mode requires non-empty `push_url` | queue_dispatch.rs:57-60 |
| 42 | Queue dispatch `secret` never echoed in response | queue_dispatch.rs:78-80 |
| 43 | Routing rule `handler_name` and `queue_override` must be non-empty | queue_routing.rs:66-70 |
| 44 | Telemetry batch max 500 events | telemetry.rs:68-74 |
| 45 | `list_sequences` limit default 200, max 1000 | sequences.rs:296-297 |
| 46 | `migrate-instance` cross-tenant → 403 Forbidden | sequences.rs:392-398 |

---

### 7. OpenAPI Tags

| Tag | Description |
|---|---|
| `health` | Health check endpoints |
| `sequences` | Sequence definition management |
| `instances` | Task instance lifecycle |
| `cron` | Cron schedule management |
| `workers` | External worker task polling |
| `sessions` | Cross-instance session management |
| `circuit_breakers` | Circuit breaker inspection and reset |
| `pools` | Resource pool management |
| `cluster` | Multi-node cluster management |
| `credentials` | Shared secrets referenced by step params via `credentials://<id>` |
| `triggers` | Trigger definitions that convert inbound events into instance creations |
| `webhooks` | Public, unauthenticated webhook ingestion (HMAC-protected via trigger secret) |
| `usage` | LLM token usage and cost aggregation |
| `routing` | Queue routing rules and dispatch config |

---

### 8. Open Issues

1. Exact `InstanceState` → allowed signal transitions matrix not determinable from assigned files (enforced inside `orch8_engine`, not `orch8_api`).
2. Full `SequenceStatus` transition graph: `can_transition_to` logic lives in `orch8_types::sequence::SequenceStatus` (not read).
3. `CreateInstanceRequest` full field list (all fields) is in `instances/lifecycle.rs` sub-module (not directly read – inferred from MCP tool and openapi.rs schema reference).
4. `ListQuery` for `GET /instances` full parameter set is in `instances/types.rs` (not directly read).
5. `ForkRequest`, `ResumeFromRequest`, `SaveCheckpointRequest`, `PruneCheckpointsRequest`, `InjectBlocksRequest` schemas are in `instances/` sub-modules (not read).
6. `StreamEvent` shape from `orch8_engine::stream_bus` not fully documented (only mentioned in streaming.rs).
7. `Budget` type field list (`max_input_tokens`, `max_output_tokens`, `max_total_tokens`, `max_steps`) inferred from MCP tool catalog only.
8. Full `CredentialKind` variant list not determinable without reading `orch8_types::credential`.
9. Full `PluginType` variant list not determinable without reading `orch8_types::plugin`.
10. Full `RotationStrategy` variant list not determinable without reading `orch8_types::pool`.
11. SQL table schemas (column types, PKs, FKs, indexes, constraints) are not in the assigned files – they are in `orch8-storage`.
12. Whether `GET /cluster/nodes` requires admin/root vs tenant key – no explicit auth enforcement visible in `cluster.rs` handlers (no `tenant_ctx` parameter); [INFERRED to be root-only in practice].
13. `list_sequences_array` (`GET /sequences.json`) is not in the utoipa path list (`openapi.rs`) – it will not appear in the generated OpenAPI spec.
14. Several `sequences.rs` handlers (`delete_sequence`, `set_sequence_status`, `unpublish_sequence`, `promote_sequence`) are not listed in `openapi.rs` `paths()` – they will be missing from the Swagger UI but are live HTTP routes.
15. `telemetry.rs` and `rollback.rs` handlers have no `#[utoipa::path]` annotations and are absent from the OpenAPI spec.
16. `mobile_sync.rs`, `approvals.rs`, `credentials.rs`, `api_keys.rs`, `plugins.rs` handlers have no `#[utoipa::path]` annotations.
17. MCP protocol version `"2025-06-18"` is the latest known; client libraries using `"2024-11-05"` or `"2025-03-26"` are also accepted verbatim.
18. `AppState::mobile_sync_enabled` flag source (config key / env var name) not determinable from assigned files.
