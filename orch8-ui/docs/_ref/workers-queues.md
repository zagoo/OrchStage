## External Workers, Tasks, Queues & Routing

> **Auth note** – All endpoints require `X-API-Key`. Admin/root keys see all tenants; tenant-scoped keys automatically filter to their own tenant. The optional `X-Tenant-Id` header may narrow scope further (some paths enforce it). All auth rules below are stated from the operator UI perspective (admin key).

Source files:
- `engine/orch8-api/src/workers.rs`
- `engine/orch8-api/src/queue_dispatch.rs`
- `engine/orch8-api/src/queue_routing.rs`
- `engine/orch8-types/src/worker.rs`
- `engine/orch8-types/src/worker_filter.rs`
- `engine/orch8-types/src/queue_dispatch.rs`
- `engine/orch8-types/src/queue_routing.rs`

---

### Path Prefixes

Every route listed below is served under **two** prefix trees:

| Prefix | Example |
|---|---|
| `/api/v1` | `/api/v1/workers` |
| `` (legacy, no prefix) | `/workers` |

Only the un-prefixed form is shown in the tables; prepend `/api/v1` for the canonical versioned path.

---

### Worker Task State Machine

A `WorkerTask` passes through four states. `Completed` and `Failed` are terminal.

```
         ┌─────────────────────────────────────┐
         │                                     │
  [created] → Pending ──► Claimed ──► Completed (terminal)
                              │
                              └──► Failed     (terminal, unless retryable)
                              │
                              └──► Pending    (reset on retryable fail when
                                              retry budget remains)
```

| State | Description | How entered |
|---|---|---|
| `pending` | Awaiting poll/claim | Task created by engine, or reset after retryable failure |
| `claimed` | Leased to a worker | `POST /workers/tasks/poll` or `POST /workers/tasks/poll/queue` atomically sets this |
| `completed` | Succeeded | `POST /workers/tasks/{id}/complete` |
| `failed` | Permanently failed | `POST /workers/tasks/{id}/fail` with `retryable=false`, or retry budget exhausted |

**Liveness / lease expiry:** A claimed task whose `heartbeat_at` (or `claimed_at` if no heartbeat received) is older than **60 seconds** is considered stale and eligible for reaping by the engine background task. Workers must call `POST /workers/tasks/{id}/heartbeat` more frequently than this window.

**Retry semantics on fail:**
- `retryable: true` + retry budget remaining → task is reset to `Pending` with `attempt + 1`; instance transitions to `Scheduled`
- `retryable: true` + budget exhausted (or no retry policy on the step) → task `Failed`; instance transitions to `Failed`
- `retryable: false` → task `Failed`; instance transitions to `Scheduled` (tree path) or `Failed` (fast path)

---

### Entities

#### `WorkerTask`

Rust type: `orch8_types::worker::WorkerTask` (`worker.rs:115`).

TypeScript equivalent: `WorkerTask`

| Field | Rust type | TS type | Required | Notes |
|---|---|---|---|---|
| `id` | `Uuid` | `string` | yes | UUID v7 |
| `instance_id` | `InstanceId` (Uuid) | `string` | yes | Owning workflow instance |
| `block_id` | `BlockId` (String) | `string` | yes | Block/step within the sequence |
| `handler_name` | `String` | `string` | yes | Handler this task is dispatched to |
| `queue_name` | `Option<String>` | `string \| undefined` | no | Named task queue; absent means default queue |
| `params` | `serde_json::Value` | `unknown` | yes | Step parameters passed to the worker |
| `context` | `serde_json::Value` | `unknown` | yes | Serialized `ExecutionContext`; raw JSON to avoid coupling workers to Rust types |
| `attempt` | `u16` | `number` | yes | 0-based attempt counter; incremented on retry |
| `timeout_ms` | `Option<i64>` | `number \| null` | no | Task-level timeout in milliseconds |
| `state` | `WorkerTaskState` | `"pending" \| "claimed" \| "completed" \| "failed"` | yes | Current lifecycle state |
| `worker_id` | `Option<String>` | `string \| null` | no | Set when claimed |
| `claimed_at` | `Option<DateTime<Utc>>` | `string \| null` (ISO 8601) | no | When task was leased |
| `heartbeat_at` | `Option<DateTime<Utc>>` | `string \| null` (ISO 8601) | no | Most recent heartbeat timestamp |
| `completed_at` | `Option<DateTime<Utc>>` | `string \| null` (ISO 8601) | no | When task reached terminal state |
| `output` | `Option<serde_json::Value>` | `unknown \| null` | no | Worker-reported result on completion |
| `error_message` | `Option<String>` | `string \| null` | no | Failure message |
| `error_retryable` | `Option<bool>` | `boolean \| null` | no | Whether the failure was marked retryable |
| `created_at` | `DateTime<Utc>` | `string` (ISO 8601) | yes | Row creation time |

#### `WorkerRegistration`

Rust type: `orch8_types::worker::WorkerRegistration` (`worker.rs:145`).

One row per `(worker_id, handler_name)` pair. `last_seen_at` is refreshed on every poll call even if no tasks are claimed.

| Field | Rust type | TS type | Required | Notes |
|---|---|---|---|---|
| `worker_id` | `String` | `string` | yes | Stable worker identity (caller-chosen) |
| `handler_name` | `String` | `string` | yes | Handler this registration covers |
| `queue_name` | `Option<String>` | `string \| undefined` | no | Present when queue-scoped poll was used |
| `version` | `Option<String>` | `string \| undefined` | no | Worker-reported build/deploy version |
| `tenant_id` | `Option<String>` | `string \| undefined` | no | Tenant scope of the polling credential |
| `last_seen_at` | `DateTime<Utc>` | `string` (ISO 8601) | yes | Refreshed on every poll |

#### `WorkerInfo` (aggregated fleet view)

Rust type: `workers.rs:421` (`WorkerInfo`, internal to the API crate).

The `GET /workers` response collapses multiple `WorkerRegistration` rows per `worker_id` into one `WorkerInfo`.

| Field | TS type | Notes |
|---|---|---|
| `worker_id` | `string` | Worker identity |
| `handlers` | `string[]` | Distinct handler names polled; sorted |
| `queues` | `string[]` | Distinct named queues polled; sorted; empty when default-queue only |
| `version` | `string \| null` | Most recently reported version |
| `last_seen_at` | `string` (ISO 8601) | Most recent poll across all registrations |
| `alive` | `boolean` | `last_seen_at >= (now - alive_within_secs)` |
| `in_flight` | `number` | Count of tasks currently in `claimed` state for this worker |

#### `WorkerCommand`

Rust type: `orch8_types::worker::WorkerCommand` (`worker.rs:164`).

| Field | Rust type | TS type | Notes |
|---|---|---|---|
| `id` | `Uuid` | `string` | UUID v7 |
| `worker_id` | `String` | `string` | Target worker |
| `command` | `WorkerCommandKind` | `"drain" \| "reload" \| "ping"` | See below |
| `payload` | `serde_json::Value` | `unknown` | Optional extra data (e.g. drain deadline) |
| `created_at` | `DateTime<Utc>` | `string` (ISO 8601) | |

Command semantics (`WorkerCommandKind`, `worker.rs:180`):

| Value | Meaning |
|---|---|
| `drain` | Worker stops claiming new tasks, finishes in-flight tasks, then shuts down or idles |
| `reload` | Worker re-reads config and re-registers handlers |
| `ping` | Liveness probe; worker should ack immediately |

#### `WorkerVersionPin`

Rust type: `orch8_types::worker::WorkerVersionPin` (`worker.rs:213`).

Keyed on `(tenant_id, handler_name)`. When a pin exists, a worker whose reported version does not satisfy `min_version` receives an empty task list at poll time (but the registration is still recorded).

| Field | Rust type | TS type | Notes |
|---|---|---|---|
| `tenant_id` | `String` | `string` | |
| `handler_name` | `String` | `string` | |
| `min_version` | `String` | `string` | Dot-separated numeric semver or arbitrary string |
| `created_at` | `DateTime<Utc>` | `string` (ISO 8601) | Set on first upsert |
| `updated_at` | `DateTime<Utc>` | `string` (ISO 8601) | Refreshed on every upsert |

#### `HandlerCatalog`

Rust type: `workers.rs:533` (`HandlerCatalog`, internal).

| Field | TS type | Notes |
|---|---|---|
| `builtin` | `string[]` | Handlers executed in-process by the engine |
| `external` | `string[]` | Handler names seen in the worker registry (deduplicated, sorted) |

#### `WorkerTaskStats`

Rust type: `orch8_types::worker_filter::WorkerTaskStats` (`worker_filter.rs:19`).

| Field | TS type | Notes |
|---|---|---|
| `by_state` | `Record<string, number>` | Task count keyed by state string |
| `by_handler` | `Record<string, Record<string, number>>` | Nested: handler_name → state → count |
| `active_workers` | `string[]` | Worker IDs with at least one claimed task |

#### `QueueDispatchConfig`

Rust type: `orch8_types::queue_dispatch::QueueDispatchConfig` (`queue_dispatch.rs:25`).

Keyed on `(tenant_id, queue_name)`. Controls whether tasks on a queue are delivered via worker-poll or pushed directly to a URL.

| Field | Rust type | TS type | Required | Notes |
|---|---|---|---|---|
| `tenant_id` | `String` | `string` | yes | |
| `queue_name` | `String` | `string` | yes | |
| `mode` | `DispatchMode` | `"poll" \| "push"` | yes | Default: `"poll"` |
| `push_url` | `Option<String>` | `string \| undefined` | conditional | Required when `mode = "push"` |
| `secret` | `Option<String>` | `string \| undefined` | no | HMAC signing secret; **never echoed back in responses** |
| `created_at` | `DateTime<Utc>` | `string` (ISO 8601) | yes | |
| `updated_at` | `DateTime<Utc>` | `string` (ISO 8601) | yes | |

#### `QueueRoutingRule`

Rust type: `orch8_types::queue_routing::QueueRoutingRule` (`queue_routing.rs:16`).

Evaluated at task-enqueue time. Highest `priority` wins; first match applies.

| Field | Rust type | TS type | Required | Default | Notes |
|---|---|---|---|---|---|
| `id` | `Uuid` | `string` | yes (server-generated) | — | UUID v7 |
| `tenant_id` | `String` | `string` | yes | — | |
| `handler_name` | `String` | `string` | yes | — | Handler this rule targets |
| `match_queue` | `Option<String>` | `string \| undefined` | no | `null` (matches any queue) | When set, rule only applies if task's current queue equals this value (queue remap X→Y) |
| `queue_override` | `String` | `string` | yes | — | Destination queue; must be non-empty |
| `priority` | `i32` | `number` | no | `0` | Higher value = evaluated first |
| `enabled` | `bool` | `boolean` | no | `true` | `false` disables without deleting |
| `created_at` | `DateTime<Utc>` | `string` (ISO 8601) | yes (server) | — | |
| `updated_at` | `DateTime<Utc>` | `string` (ISO 8601) | yes (server) | — | |

---

### Endpoints

#### Summary Table

| Method | Path | Handler fn | Auth | Description |
|---|---|---|---|---|
| `GET` | `/workers` | `list_workers` | Any | List live worker fleet |
| `GET` | `/handlers` | `list_handlers` | Any | Handler catalog (builtin + external) |
| `GET` | `/workers/tasks` | `list_tasks` | Any | List/filter worker tasks |
| `GET` | `/workers/tasks/stats` | `task_stats` | Any | Aggregate task stats |
| `POST` | `/workers/tasks/poll` | `poll_tasks` | Any | Poll (claim) tasks by handler |
| `POST` | `/workers/tasks/poll/queue` | `poll_tasks_from_queue` | Any | Poll tasks from a named queue |
| `POST` | `/workers/tasks/{id}/complete` | `complete_task` | Any (tenant-enforced) | Report task success |
| `POST` | `/workers/tasks/{id}/fail` | `fail_task` | Any (tenant-enforced) | Report task failure |
| `POST` | `/workers/tasks/{id}/heartbeat` | `heartbeat_task` | Any (tenant-enforced) | Extend task lease |
| `POST` | `/workers/commands` | `enqueue_command` | Admin | Queue a control command for a worker |
| `GET` | `/workers/{worker_id}/commands` | `list_commands` | Any | List pending commands for a worker |
| `DELETE` | `/workers/commands/{id}` | `ack_command` | Any | Acknowledge and delete a command |
| `POST` | `/workers/version-pins` | `set_version_pin` | Admin | Create/update version pin |
| `GET` | `/workers/version-pins` | `list_version_pins` | Admin | List version pins |
| `DELETE` | `/workers/version-pins/{tenant_id}/{handler_name}` | `delete_version_pin` | Admin | Delete version pin |
| `POST` | `/queues/dispatch` | `set_dispatch` | Admin | Create/update queue dispatch config |
| `GET` | `/queues/dispatch` | `list_dispatch` | Admin | List dispatch configs |
| `DELETE` | `/queues/dispatch/{tenant_id}/{queue_name}` | `delete_dispatch` | Admin | Delete dispatch config |
| `POST` | `/routing-rules` | `create_rule` | Any (tenant-enforced) | Create routing rule |
| `GET` | `/routing-rules` | `list_rules` | Any | List routing rules |
| `GET` | `/routing-rules/{id}` | `get_rule` | Any (tenant-enforced) | Get single routing rule |
| `DELETE` | `/routing-rules/{id}` | `delete_rule` | Any (tenant-enforced) | Delete routing rule |

---

#### `GET /workers`

List the live (or all) worker fleet, aggregated from registration rows.

**Query Parameters**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `alive_within_secs` | `number` | no | `60` | Liveness window in seconds; minimum effective value is 1 |
| `include_stale` | `boolean` | no | `false` | When `true`, includes workers last seen outside the liveness window |

**Response – 200**

`WorkerInfo[]` sorted by `last_seen_at` descending.

```json
[
  {
    "worker_id": "my-worker-1",
    "handlers": ["send-email", "resize-image"],
    "queues": ["bulk-email"],
    "version": "1.4.2",
    "last_seen_at": "2026-06-17T10:00:00Z",
    "alive": true,
    "in_flight": 3
  }
]
```

**Business rules:**
- Tenant-scoped callers see only their own workers plus workers with no `tenant_id` in their registration.
- `alive` = `last_seen_at >= (now - alive_within_secs)`.
- `handlers` and `queues` arrays are deduplicated and sorted alphabetically.
- `version` reflects the most recently seen version reported across all registrations for that worker.

---

#### `GET /handlers`

Return the handler catalog — which handlers the engine can execute in-process vs. via external workers.

**Query Parameters:** none

**Response – 200** `HandlerCatalog`

```json
{
  "builtin": ["delay", "condition", "foreach"],
  "external": ["resize-image", "send-email"]
}
```

**Business rules:**
- `external` is deduplicated and sorted; reflects current worker registry.
- Tenant-scoped callers see only handlers matching their own workers plus unscoped registrations.

---

#### `GET /workers/tasks`

List and filter worker tasks with pagination.

**Query Parameters**

| Name | Type | Required | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `tenant_id` | `string` | no | — | — | Admin-only filter; ignored for tenant-scoped callers (their ID is enforced) |
| `state` | `string` | no | — | Comma-separated; valid values: `pending`, `claimed`, `completed`, `failed` | Multiple states OR-ed |
| `handler_name` | `string` | no | — | — | Exact match |
| `worker_id` | `string` | no | — | — | Exact match |
| `queue_name` | `string` | no | — | — | Exact match |
| `limit` | `number` | no | `50` | 1 – 1000 (clamped) | Max rows returned |
| `offset` | `number` | no | `0` | ≥ 0 | Skip N rows |

**Response – 200** `WorkerTask[]` sorted descending by creation time.

```json
[
  {
    "id": "019012ab-cdef-7000-8000-000000000001",
    "instance_id": "019012ab-cdef-7000-8000-000000000002",
    "block_id": "step-1",
    "handler_name": "send-email",
    "queue_name": "bulk-email",
    "params": {"to": "user@example.com"},
    "context": {},
    "attempt": 0,
    "timeout_ms": 30000,
    "state": "claimed",
    "worker_id": "my-worker-1",
    "claimed_at": "2026-06-17T10:00:00Z",
    "heartbeat_at": "2026-06-17T10:00:30Z",
    "completed_at": null,
    "output": null,
    "error_message": null,
    "error_retryable": null,
    "created_at": "2026-06-17T09:59:55Z"
  }
]
```

**Error responses**

| Status | Condition |
|---|---|
| `400` | Unknown state value in `state` param |

---

#### `GET /workers/tasks/stats`

Aggregate task statistics, optionally scoped to the authenticated tenant.

**Query Parameters:** none (tenant scope is inferred from auth header)

**Response – 200** `WorkerTaskStats`

```json
{
  "by_state": {
    "pending": 12,
    "claimed": 5,
    "completed": 482,
    "failed": 3
  },
  "by_handler": {
    "send-email": {
      "pending": 10,
      "claimed": 3
    },
    "resize-image": {
      "pending": 2,
      "claimed": 2
    }
  },
  "active_workers": ["my-worker-1", "my-worker-2"]
}
```

---

#### `POST /workers/tasks/poll`

Claim up to `limit` pending tasks for a given handler. This is the primary poll endpoint; worker registers itself as a side-effect.

**Request Body** `application/json`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `handler_name` | `string` | yes | — | Handler the worker serves |
| `worker_id` | `string` | yes | — | Stable worker identity (caller-chosen) |
| `limit` | `number` | no | `1` | 1 – 1000 (clamped server-side) |
| `version` | `string \| null` | no | `null` | Worker build/deploy version; checked against version pins |

```json
{
  "handler_name": "send-email",
  "worker_id": "my-worker-1",
  "limit": 5,
  "version": "1.4.2"
}
```

**Response – 200** `WorkerTask[]`

Returns an empty array when:
- No pending tasks exist for this handler, or
- A version pin blocks the worker (version below minimum; pin lookup failure is treated permissively — allows poll).

**Business rules:**
1. `limit` is clamped to 1000.
2. Version pin check: if a `(tenant_id, handler_name)` pin exists and `version` does not satisfy `min_version`, the poll returns `[]` but the registration is still recorded.
3. Version comparison is numeric semver (dot-separated integers, missing components default to 0). If either side has a non-numeric component, lexicographic `>=` is used. A worker with no reported version never satisfies any pin.
4. Worker registration is upserted as a best-effort side-effect; a registry write failure never fails the poll.
5. Claim is atomic (enforced inside a database lock) to prevent multiple workers from receiving the same task.
6. Tenant-scoped callers: tasks are claimed only from the caller's tenant (enforced inside the claim lock, not post-hoc).

---

#### `POST /workers/tasks/poll/queue`

Claim tasks from a specific named queue. Otherwise identical to the default poll.

**Request Body** `application/json`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `queue_name` | `string` | yes | — | Named queue to poll |
| `handler_name` | `string` | yes | — | Handler the worker serves |
| `worker_id` | `string` | yes | — | Stable worker identity |
| `limit` | `number` | no | `1` | 1 – 1000 (clamped) |
| `version` | `string \| null` | no | `null` | Worker build/deploy version |

```json
{
  "queue_name": "bulk-email",
  "handler_name": "send-email",
  "worker_id": "my-worker-1",
  "limit": 10,
  "version": "1.4.2"
}
```

**Response – 200** `WorkerTask[]` (same schema as default poll)

**Business rules:** Same as `POST /workers/tasks/poll` plus:
- Only tasks whose `queue_name` matches `queue_name` are eligible for claim.
- Registration records `queue_name` in addition to `handler_name`.

---

#### `POST /workers/tasks/{id}/complete`

Report successful completion of a claimed task.

**Path Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | yes | Worker task ID |

**Request Body** `application/json`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `worker_id` | `string` | yes | — | Must match the worker that claimed the task |
| `output` | `unknown` | yes | — | Any JSON value; merged into workflow instance context if it is an object |
| `logs` | `StepLogEntry[]` | no | `[]` | Worker-captured log lines; persisted best-effort |

```json
{
  "worker_id": "my-worker-1",
  "output": {"message_id": "msg-abc123"},
  "logs": [
    {"level": "info", "message": "Email sent to user@example.com", "timestamp": "2026-06-17T10:00:01Z"}
  ]
}
```

**Response – 200** `(empty body)`

**Error responses**

| Status | Condition |
|---|---|
| `404` | Task not found, or owning instance not found |
| `403` | Caller's tenant does not own the task's instance |

**Business rules:**
1. Tenant access is verified via the task's owning instance; orphaned tasks (instance deleted) return 404 to tenant-scoped callers.
2. If the owning instance is already in a terminal state or `Paused`, the completion is accepted (200) but no state transition is applied to the instance.
3. If `output` is a JSON object, its keys are merged into `instance.context.data` before the atomic write.
4. The engine performs an atomic write: saves `BlockOutput`, marks the execution tree node `Completed`, and transitions the instance to `Scheduled` — all in a single operation to close the race between the scheduler and the worker.
5. Circuit breaker: a success is recorded for the handler (skip-listed built-ins are excluded).
6. If `output` serialization fails, a `400` is returned.

---

#### `POST /workers/tasks/{id}/fail`

Report failure of a claimed task.

**Path Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | yes | Worker task ID |

**Request Body** `application/json`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `worker_id` | `string` | yes | — | Must match the claiming worker |
| `message` | `string` | yes | — | Human-readable failure description |
| `retryable` | `boolean` | no | `false` | Whether the engine should check the step retry policy |
| `logs` | `StepLogEntry[]` | no | `[]` | Worker-captured log lines; persisted best-effort |

```json
{
  "worker_id": "my-worker-1",
  "message": "SMTP connection refused",
  "retryable": true,
  "logs": []
}
```

**Response – 200** `(empty body)`

**Error responses**

| Status | Condition |
|---|---|
| `404` | Task not found, or owning instance not found |
| `403` | Caller's tenant does not own the task's instance |

**Business rules:**
1. Tenant and instance ownership is enforced identically to `complete_task`.
2. If the owning instance is already terminal or `Paused`, the failure is accepted (200) but no state transition is applied.
3. **Retry decision tree** (`retryable: true`):
   - Engine reads the step's retry policy from the sequence definition.
   - If `attempt + 1 < max_attempts`: resets task to `Pending` with incremented `attempt`, instance → `Scheduled`.
   - If attempts exhausted or no retry policy on the step: task → `Failed`, instance → `Failed` (fast path) or node marked `Failed` + instance → `Scheduled` (tree path).
4. **Non-retryable** (`retryable: false`):
   - Tree path: execution node → `Failed`, instance → `Scheduled`.
   - Fast path (no execution tree): instance → `Failed`.
5. Circuit breaker: failure always recorded for the handler regardless of retry/non-retry path.

---

#### `POST /workers/tasks/{id}/heartbeat`

Extend the lease on a claimed task. Must be called more frequently than the stale threshold (60 seconds).

**Path Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | yes | Worker task ID |

**Request Body** `application/json`

| Field | Type | Required | Notes |
|---|---|---|---|
| `worker_id` | `string` | yes | Must match the claiming worker |

```json
{"worker_id": "my-worker-1"}
```

**Response – 200** `(empty body)`

**Error responses**

| Status | Condition |
|---|---|
| `404` | Task not found, task/instance not matching, or heartbeat update found nothing to update |
| `403` | Tenant access denied |

---

#### `POST /workers/commands`

Queue a control command for a specific worker (operator → worker channel).

**Request Body** `application/json`

| Field | Type | Required | Notes |
|---|---|---|---|
| `worker_id` | `string` | yes | Target worker (must be non-empty) |
| `command` | `"drain" \| "reload" \| "ping"` | yes | Command kind |
| `payload` | `unknown` | no | Optional JSON parameters (e.g. drain deadline) |

```json
{
  "worker_id": "my-worker-1",
  "command": "drain",
  "payload": {"deadline": "2026-06-17T11:00:00Z"}
}
```

**Response – 201** `WorkerCommand`

```json
{
  "id": "019012ab-cdef-7000-8000-000000000010",
  "worker_id": "my-worker-1",
  "command": "drain",
  "payload": {"deadline": "2026-06-17T11:00:00Z"},
  "created_at": "2026-06-17T10:00:00Z"
}
```

**Error responses**

| Status | Condition |
|---|---|
| `400` | `worker_id` is empty or blank |

**Business rules:**
- Commands are queued asynchronously. The worker must poll `GET /workers/{worker_id}/commands` to discover them.
- After acting on a command, the worker calls `DELETE /workers/commands/{id}` to acknowledge.

---

#### `GET /workers/{worker_id}/commands`

List all pending (un-acked) control commands for a given worker.

**Path Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `worker_id` | `string` | yes | Worker identity |

**Query Parameters:** none

**Response – 200** `WorkerCommand[]`

```json
[
  {
    "id": "019012ab-cdef-7000-8000-000000000010",
    "worker_id": "my-worker-1",
    "command": "ping",
    "payload": {},
    "created_at": "2026-06-17T10:05:00Z"
  }
]
```

---

#### `DELETE /workers/commands/{id}`

Acknowledge (and delete) a delivered command. The worker calls this after acting on it.

**Path Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | yes | Command ID |

**Response – 204** `(no body)`

---

#### `POST /workers/version-pins`

Create or update (upsert) a minimum-version pin for a `(tenant, handler)` pair.

**Request Body** `application/json`

| Field | Type | Required | Constraints | Notes |
|---|---|---|---|---|
| `tenant_id` | `string` | yes | — | |
| `handler_name` | `string` | yes | Non-empty after trim | |
| `min_version` | `string` | yes | Non-empty after trim | Dot-separated numeric semver or arbitrary string |

```json
{
  "tenant_id": "acme",
  "handler_name": "send-email",
  "min_version": "1.5.0"
}
```

**Response – 200** `WorkerVersionPin`

```json
{
  "tenant_id": "acme",
  "handler_name": "send-email",
  "min_version": "1.5.0",
  "created_at": "2026-06-17T10:00:00Z",
  "updated_at": "2026-06-17T10:00:00Z"
}
```

**Error responses**

| Status | Condition |
|---|---|
| `400` | `handler_name` or `min_version` empty/blank |

---

#### `GET /workers/version-pins`

List all version pins, optionally filtered by tenant.

**Query Parameters**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `tenant_id` | `string` | no | — | Filter to a specific tenant |

**Response – 200** `WorkerVersionPin[]`

---

#### `DELETE /workers/version-pins/{tenant_id}/{handler_name}`

Remove a version pin.

**Path Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `tenant_id` | `string` | yes | |
| `handler_name` | `string` | yes | |

**Response – 204** `(no body)`

---

#### `POST /queues/dispatch`

Create or update the dispatch configuration for a queue. Keyed on `(tenant_id, queue_name)`.

**Request Body** `application/json`

| Field | Type | Required | Constraints | Notes |
|---|---|---|---|---|
| `tenant_id` | `string` | yes | — | |
| `queue_name` | `string` | yes | Non-empty after trim | |
| `mode` | `"poll" \| "push"` | yes | — | `"poll"` = workers poll; `"push"` = engine POSTs to `push_url` |
| `push_url` | `string` | conditional | Non-empty when mode=push | Required when `mode = "push"` |
| `secret` | `string` | no | — | HMAC signing secret for push envelopes; stored but never returned |

```json
{
  "tenant_id": "acme",
  "queue_name": "bulk-email",
  "mode": "push",
  "push_url": "https://worker.example.com/tasks",
  "secret": "my-hmac-secret"
}
```

**Response – 200** `QueueDispatchConfig`

The `secret` field is **never included** in the response body.

```json
{
  "tenant_id": "acme",
  "queue_name": "bulk-email",
  "mode": "push",
  "push_url": "https://worker.example.com/tasks",
  "created_at": "2026-06-17T10:00:00Z",
  "updated_at": "2026-06-17T10:00:00Z"
}
```

**Error responses**

| Status | Condition |
|---|---|
| `400` | `queue_name` is empty, or `mode = "push"` with empty/missing `push_url` |

---

#### `GET /queues/dispatch`

List all queue dispatch configurations, optionally filtered by tenant.

**Query Parameters**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `tenant_id` | `string` | no | — | Filter to a specific tenant |

**Response – 200** `QueueDispatchConfig[]`

Note: `secret` is excluded from all items in the response.

---

#### `DELETE /queues/dispatch/{tenant_id}/{queue_name}`

Remove a queue dispatch configuration, reverting the queue to poll mode.

**Path Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `tenant_id` | `string` | yes | |
| `queue_name` | `string` | yes | |

**Response – 204** `(no body)`

---

#### `POST /routing-rules`

Create a new queue routing rule.

**Request Body** `application/json`

| Field | Type | Required | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `tenant_id` | `string` | yes | — | — | |
| `handler_name` | `string` | yes | — | Non-empty after trim | Handler this rule targets |
| `match_queue` | `string \| null` | no | `null` | — | When set, rule only fires if the task's current queue equals this value; `null` matches any queue |
| `queue_override` | `string` | yes | — | Non-empty after trim | Destination queue |
| `priority` | `number` | no | `0` | `i32` range | Higher = evaluated first |
| `enabled` | `boolean` | no | `true` | — | `false` = rule stored but not applied |

```json
{
  "tenant_id": "acme",
  "handler_name": "send-email",
  "match_queue": null,
  "queue_override": "bulk-email",
  "priority": 10,
  "enabled": true
}
```

**Response – 201** `QueueRoutingRule`

```json
{
  "id": "019012ab-cdef-7000-8000-000000000020",
  "tenant_id": "acme",
  "handler_name": "send-email",
  "queue_override": "bulk-email",
  "priority": 10,
  "enabled": true,
  "created_at": "2026-06-17T10:00:00Z",
  "updated_at": "2026-06-17T10:00:00Z"
}
```

**Error responses**

| Status | Condition |
|---|---|
| `400` | `handler_name` or `queue_override` empty/blank |
| `403` | Tenant-scoped caller attempting to create rule for a different tenant |

**Business rules:**
- `enforce_tenant_create` is called: a tenant-scoped key may only create rules for its own tenant.
- `match_queue` absent from JSON is identical to `null` (matches any queue).

---

#### `GET /routing-rules`

List queue routing rules, optionally filtered by tenant and handler.

**Query Parameters**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `tenant_id` | `string` | no | — | Filter by tenant; tenant-scoped callers are restricted to their own |
| `handler_name` | `string` | no | — | Filter by handler name |

**Response – 200** `QueueRoutingRule[]`

---

#### `GET /routing-rules/{id}`

Retrieve a single routing rule by ID.

**Path Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | yes | Rule ID |

**Response – 200** `QueueRoutingRule`

**Error responses**

| Status | Condition |
|---|---|
| `404` | Rule not found |
| `403` | Rule belongs to a different tenant than the caller |

---

#### `DELETE /routing-rules/{id}`

Delete a routing rule.

**Path Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | yes | Rule ID |

**Response – 204** `(no body)`

**Error responses**

| Status | Condition |
|---|---|
| `404` | Rule not found |
| `403` | Rule belongs to a different tenant than the caller |

---

### Queue Dispatch: Poll vs Push

By default all queues use **poll** mode — workers call `POST /workers/tasks/poll` or `POST /workers/tasks/poll/queue` repeatedly to claim tasks.

When a queue is configured for **push** mode (`POST /queues/dispatch`), the engine POSTs a signed task envelope to `push_url` at the moment a task is enqueued. The `worker_tasks` row is still written durably, so completion and failure reporting use exactly the same endpoints (`POST /workers/tasks/{id}/complete`, `POST /workers/tasks/{id}/fail`). The HMAC signing scheme matches the outbound webhook signing scheme.

---

### Queue Routing Rules — Evaluation Semantics

Rules are evaluated at task-enqueue time:

1. All enabled rules for `(tenant_id, handler_name)` are fetched.
2. Sorted by `priority` descending (highest first).
3. The first rule whose `match_queue` is either `null` (matches any) or equals the task's current queue wins.
4. The task's `queue_name` is rewritten to the winning rule's `queue_override`.
5. If no rule matches, the original queue (or default) is used.

`enabled: false` rules are stored but excluded from matching entirely.

---

### Version Pin — Comparison Algorithm

Source: `orch8_types::worker::version_satisfies` (`worker.rs:230`).

1. Parse both strings as dot-separated unsigned integers (strip leading `v`).
2. If both parse successfully: pad shorter to equal length with zeros; compare lexicographically on the integer component arrays (so `1.10.0 >= 1.9.0` correctly).
3. If either side fails to parse any component: fall back to plain string `>=` on the raw trimmed+`v`-stripped strings.
4. A worker with no `version` field never satisfies any pin.

---

### Worker Registration Lifecycle

- Registrations are upserted on every poll call (both `/poll` and `/poll/queue`), keyed on `(worker_id, handler_name)`.
- A worker serving 3 handlers has 3 registration rows.
- `last_seen_at` is updated on every upsert, independent of whether tasks were claimed.
- A failed registry upsert is logged and discarded — it never causes the poll to fail.
- The `GET /workers` endpoint aggregates registrations by `worker_id`, computing `alive` from `last_seen_at` vs. the configurable window (default 60 s).

---

### Stale Task Reaping

[INFERRED from worker.rs comments and the 60-second constant in `list_workers`] A background reaper task in the engine periodically scans claimed tasks where the lease has expired (no heartbeat within ~60 seconds). Stale tasks are reset to `Pending` so they can be re-claimed by another worker. The exact reaper interval and SQL predicate are not in the assigned source files.

---

### Circuit Breaker Integration

External worker completions and failures are fed into the same per-tenant per-handler circuit breaker that in-process steps use:
- `complete_task` → `record_success(tenant, handler_name)`
- `fail_task` → `record_failure(tenant, handler_name)` (both retryable and non-retryable paths)

Pure control-flow built-in handlers are excluded via an engine-internal skip-list (`is_breaker_tracked`). The circuit breaker thresholds and open/half-open state are not surfaced via this API surface.
