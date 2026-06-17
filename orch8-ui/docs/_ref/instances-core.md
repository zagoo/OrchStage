## Instances: Lifecycle, Signals, Batch & Context

This section is the authoritative HTTP API reference for instance lifecycle management in Orch8.
All routes are mounted under both `/api/v1/...` (canonical) and `/...` (legacy root prefix).

Auth: every request requires the `X-API-Key` header. Tenant-scoped operations additionally require
`X-Tenant-Id`. When `X-Tenant-Id` is present it overrides any `tenant_id` in the request body or
query string — the header always wins for tenant isolation.

Source files:
- `engine/orch8-api/src/instances.rs` — router wiring
- `engine/orch8-api/src/instances/lifecycle.rs` — create, list, get, update, retry, resume
- `engine/orch8-api/src/instances/types.rs` — all request/response shapes
- `engine/orch8-api/src/instances/bulk.rs` — bulk/state, bulk/reschedule, batch-action, DLQ
- `engine/orch8-api/src/instances/signals.rs` — signal dispatch
- `engine/orch8-types/src/instance.rs` — `TaskInstance`, `InstanceState`, `Priority`, `Budget`
- `engine/orch8-types/src/context.rs` — `ExecutionContext`, `RuntimeContext`, `AuditEntry`
- `engine/orch8-types/src/signal.rs` — `Signal`, `SignalType`, `SignalAction`
- `engine/orch8-types/src/execution.rs` — `ExecutionNode`, `NodeState`, `BlockType`

---

### Instance State Machine

The `InstanceState` enum is the core of instance lifecycle management. The state machine is
enforced at runtime via `InstanceState::can_transition_to` (instance.rs:65).

#### States

| State | Description | Terminal? |
|---|---|---|
| `scheduled` | Queued; waiting to be claimed by the scheduler | No |
| `running` | Actively executing on a scheduler worker | No |
| `waiting` | Dispatched to an external worker; awaiting callback | No |
| `paused` | Explicitly paused (by signal or budget breach) | No |
| `completed` | All blocks executed successfully | **Yes** |
| `failed` | A block or the engine raised an unhandled error | **Yes** |
| `cancelled` | Received a cancel signal or operator-cancelled | **Yes** |

Terminal states: `completed`, `failed`, `cancelled` (instance.rs:98).

#### Allowed Transitions

The following table lists every valid `(from, to)` pair. Any unlisted pair returns HTTP 400 with
`"cannot transition from <from> to <to>"`.

| From | To | Notes |
|---|---|---|
| `scheduled` | `running` | Scheduler claims the instance |
| `scheduled` | `paused` | Pause signal received before claim |
| `scheduled` | `cancelled` | Cancel signal received before claim |
| `running` | `scheduled` | Yielded (e.g. checkpoint, concurrency back-pressure) |
| `running` | `waiting` | Step dispatched to external worker |
| `running` | `completed` | All blocks finished |
| `running` | `failed` | Unhandled step error |
| `running` | `paused` | Pause signal delivered mid-run |
| `running` | `cancelled` | Cancel signal delivered mid-run |
| `waiting` | `running` | External worker callback arrives |
| `waiting` | `scheduled` | Timeout or retry from waiting |
| `waiting` | `cancelled` | Cancel signal while waiting |
| `waiting` | `failed` | External worker reported failure |
| `paused` | `scheduled` | Resume signal delivered |
| `paused` | `cancelled` | Cancel signal while paused |
| `failed` | `scheduled` | **Retry** — clears stale execution tree + sentinel outputs |
| `completed` | `scheduled` | **Resume-from-block** surgery only (operator) |
| `cancelled` | `scheduled` | **Resume-from-block** surgery only (operator) |

Notes (instance.rs:83–93):
- `Failed -> Scheduled` is the retry escape hatch used by `POST /instances/{id}/retry` and `batch-action retry`.
- `Completed -> Scheduled` and `Cancelled -> Scheduled` are only valid when called via `POST /instances/{id}/resume-from/{block_id}`, which wipes the block's outputs first. These transitions are illegal through the generic `PATCH /instances/{id}/state` endpoint unless the application logic explicitly calls `can_transition_to` (the endpoint enforces it).

#### State Machine Diagram (text)

```
                   ┌─────────────────────────────────────────────────────────────┐
                   │                       SCHEDULED                             │
                   │    (initial state when created; also resume/retry target)   │
                   └───────────────────────────────────────────────────────────┬─┘
                          │ scheduler claims    │ pause signal    │ cancel       │
                          ▼                     ▼                 ▼             │
                       RUNNING             PAUSED ──cancel──> CANCELLED        │
                   /    |   |  \              │                   ▲            │
          waiting /     |   |   \ cancel     resume              │ resume-     │
                 /  fail│   │comp \            │                  │  from      │
                /       │   │      \           ▼                  │            │
          WAITING   FAILED  COMPLETED SCHEDULED               resume-from     │
              │       │       │                                    │            │
              │  retry│  r-f  │ r-f                                │            │
              └───────┴───────┴────────────────────────────────────┘            │
                      └──────────────────────────────────────────────────────────┘
```

---

### Core Entity: `TaskInstance`

Source: `engine/orch8-types/src/instance.rs:241`.

The complete wire shape of an instance as returned by GET/list endpoints.

| Field | Type (Rust → TS) | Required | Default | Notes |
|---|---|---|---|---|
| `id` | `InstanceId` → `string` (UUID) | Yes | — | Auto-generated UUIDv7 at creation |
| `sequence_id` | `SequenceId` → `string` (UUID) | Yes | — | FK to the sequence definition |
| `tenant_id` | `TenantId` → `string` | Yes | — | Must be non-empty |
| `namespace` | `Namespace` → `string` | Yes | — | Must be non-empty |
| `state` | `InstanceState` → `string` | Yes | — | See state machine above |
| `next_fire_at` | `Option<DateTime<Utc>>` → `string\|null` (ISO 8601) | No | `null` | Next scheduled execution time |
| `priority` | `Priority` → `string` | Yes | `"normal"` | `"low"`, `"normal"`, `"high"`, `"critical"` |
| `timezone` | `string` | Yes | `"UTC"` | IANA timezone string |
| `metadata` | `serde_json::Value` → `unknown` | Yes | `{}` | Free-form JSON; indexed for equality filter via GIN (Postgres) or `json_extract` (SQLite) |
| `context` | `ExecutionContext` → object | Yes | See below | Multi-section execution context |
| `concurrency_key` | `Option<String>` → `string\|undefined` | No | `undefined` | Limits parallel executions per key |
| `max_concurrency` | `Option<u32>` → `number\|undefined` | No | `undefined` | Max concurrent running instances sharing `concurrency_key` |
| `idempotency_key` | `Option<String>` → `string\|undefined` | No | `undefined` | Dedup key (see idempotency rules) |
| `session_id` | `Option<Uuid>` → `string\|undefined` | No | `undefined` | Cross-instance shared state session |
| `parent_instance_id` | `Option<InstanceId>` → `string\|undefined` | No | `undefined` | Set when spawned as a sub-sequence child |
| `budget` | `Option<Budget>` → object\|undefined | No | `undefined` | Resource caps; see `Budget` schema |
| `created_at` | `DateTime<Utc>` → `string` (ISO 8601) | Yes | — | Set at creation |
| `updated_at` | `DateTime<Utc>` → `string` (ISO 8601) | Yes | — | Set at last mutation |

#### `Priority` enum

Serialized as snake_case string. Ordering: `low < normal < high < critical`.

| Value | i16 repr | Default? |
|---|---|---|
| `"low"` | 0 | No |
| `"normal"` | 1 | **Yes** |
| `"high"` | 2 | No |
| `"critical"` | 3 | No |

---

### Core Entity: `ExecutionContext`

Source: `engine/orch8-types/src/context.rs:10`.

The context object is present on every instance and carries all runtime state. It is passed in full
on every scheduler tick, so its size is bounded by default to 256 KiB (see
`DEFAULT_MAX_CONTEXT_BYTES`). The configuration knob is `ORCH8_SCHEDULER__MAX_CONTEXT_BYTES`.

| Field | Type (Rust → TS) | Permission | Description |
|---|---|---|---|
| `data` | `serde_json::Value` → `unknown` | Read/write by step handlers | Arbitrary workflow data; should be a JSON object for merge operations |
| `config` | `serde_json::Value` → `unknown` | Read-only after init | Configuration values for the workflow |
| `audit` | `AuditEntry[]` | Append-only | Chronological audit trail of events |
| `runtime` | `RuntimeContext` → object | Read-only to handlers (engine-managed) | Engine state; see below |

All four fields default to their zero value (`null` / `[]` / default struct) when absent in a JSON
payload (context.rs:12–22).

#### `RuntimeContext` fields

Source: `engine/orch8-types/src/context.rs:146`.

| Field | Type (Rust → TS) | Default | Description |
|---|---|---|---|
| `current_step` | `Option<BlockId>` → `string\|null` | `null` | The block currently executing |
| `attempt` | `u32` → `number` | `0` | Retry attempt counter for the current step |
| `started_at` | `Option<DateTime<Utc>>` → `string\|null` | `null` | When the instance first started running |
| `current_step_started_at` | `Option<DateTime<Utc>>` → `string\|null` | `null` | When the current step began; baseline for per-step SLA / timeout |
| `resource_key` | `Option<ResourceKey>` → `string\|null` | `null` | Resource locking key |
| `instance_id` | `Option<String>` → `string\|undefined` | `undefined` | Self-reference; propagated to sub-sequences |
| `total_steps_executed` | `u32` → `number` | `0` | Cumulative step execution count; used for budget enforcement |
| `dry_run` | `bool` | `false` | Dry-run mode flag (see idempotency & dry-run rules) |
| `dry_run_auto_approve` | `bool` | `false` | Auto-approves `human_review` gates in dry-run mode |

#### `AuditEntry` fields

Source: `engine/orch8-types/src/context.rs:181`.

| Field | Type (Rust → TS) | Required | Description |
|---|---|---|---|
| `timestamp` | `DateTime<Utc>` → `string` (ISO 8601) | Yes | When the event occurred |
| `event` | `string` | Yes | Event name (e.g. `"started"`, `"step_completed"`) |
| `details` | `serde_json::Value` → `unknown` | Yes | Arbitrary JSON event details |

---

### Core Entity: `Budget`

Source: `engine/orch8-types/src/instance.rs:185`.

Optional per-instance resource budget. When any limit is exceeded the scheduler pauses the
instance and sets `metadata.paused_reason = "budget_exceeded"`. Resume via the normal
`paused -> scheduled` transition.

Budget is checked **pre-flight** (before executing work on each scheduler tick), so a single
tick may slightly overshoot. An instance resumed after a budget breach gets one more tick before
the check fires again (instance.rs:177–183).

All fields are optional; absent fields are omitted from JSON serialization (not serialized as
`null`).

| Field | Type (Rust → TS) | Description |
|---|---|---|
| `max_input_tokens` | `Option<i64>` → `number\|undefined` | Max total LLM prompt tokens |
| `max_output_tokens` | `Option<i64>` → `number\|undefined` | Max total LLM completion tokens |
| `max_total_tokens` | `Option<i64>` → `number\|undefined` | Max combined (input + output) LLM tokens |
| `max_steps` | `Option<i64>` → `number\|undefined` | Max `context.runtime.total_steps_executed` |

Breach logic (instance.rs:220–237): limits are checked in order: `max_input_tokens`,
`max_output_tokens`, `max_total_tokens`, `max_steps`. The first exceeded limit is reported.
A limit is breached when `actual > limit_value` (strictly greater than).

---

### Core Entity: `Signal`

Source: `engine/orch8-types/src/signal.rs:11`.

| Field | Type (Rust → TS) | Required | Description |
|---|---|---|---|
| `id` | `Uuid` → `string` | Yes | UUIDv7 assigned at enqueue time |
| `instance_id` | `InstanceId` → `string` | Yes | Target instance |
| `signal_type` | `SignalType` → `string` | Yes | See `SignalType` values |
| `payload` | `serde_json::Value` → `unknown` | Yes | Signal payload (opaque for most types) |
| `delivered` | `bool` | Yes | Whether the signal has been consumed by the engine |
| `created_at` | `DateTime<Utc>` → `string` | Yes | When the signal was enqueued |
| `delivered_at` | `Option<DateTime<Utc>>` → `string\|null` | No | When the signal was consumed |

#### `SignalType` values

Source: `engine/orch8-types/src/signal.rs:23`.

| Wire value | Description | Payload required? |
|---|---|---|
| `"pause"` | Pause the instance | No (payload ignored) |
| `"resume"` | Resume a paused instance | No (payload ignored) |
| `"cancel"` | Cancel the instance | No (payload ignored) |
| `"update_context"` | Replace the full `ExecutionContext` | **Yes** — full `ExecutionContext` object |
| `"custom:<name>"` | User-defined signal; `<name>` is the discriminator | No (opaque payload) |

Custom signal wire format: the `signal_type` field in the JSON body must be `"custom:<name>"` where
`<name>` is the user-defined name (e.g. `"custom:order_approved"`). Omitting the `"custom:"` prefix
causes a parse error — this is intentional to prevent typos silently becoming custom signals
(signal.rs:48–53).

---

### Core Entity: `ExecutionNode`

Source: `engine/orch8-types/src/execution.rs:112`.

Represents a node in the execution tree (one per block invocation within an instance run).

| Field | Type (Rust → TS) | Required | Description |
|---|---|---|---|
| `id` | `ExecutionNodeId` → `string` | Yes | Node identifier |
| `instance_id` | `InstanceId` → `string` | Yes | Owning instance |
| `block_id` | `BlockId` → `string` | Yes | Block definition ID from the sequence |
| `parent_id` | `Option<ExecutionNodeId>` → `string\|null` | No | Parent node (for nested composites) |
| `block_type` | `BlockType` → `string` | Yes | See `BlockType` values below |
| `branch_index` | `Option<i16>` → `number\|null` | No | Branch index for parallel/router/ab-split |
| `state` | `NodeState` → `string` | Yes | See `NodeState` values below |
| `started_at` | `Option<DateTime<Utc>>` → `string\|null` | No | When this node started |
| `completed_at` | `Option<DateTime<Utc>>` → `string\|null` | No | When this node finished |

#### `NodeState` values

`pending`, `running`, `waiting`, `completed`, `failed`, `cancelled`, `skipped`

#### `BlockType` values

`step`, `parallel`, `race`, `loop`, `for_each`, `router`, `try_catch`, `sub_sequence`, `ab_split`,
`cancellation_scope`

---

## Endpoints

### 1. Create Instance

**POST /instances**
**POST /api/v1/instances**

- operationId / handler: `create_instance`
- Auth: `X-API-Key`; `X-Tenant-Id` optional (overrides body `tenant_id` when present)
- Tag: `instances`

#### Request Body (`CreateInstanceRequest`)

| Field | Type (Rust → TS) | Required | Default | Constraints |
|---|---|---|---|---|
| `sequence_id` | `SequenceId` → `string` (UUID) | **Yes** | — | Must reference an existing sequence; 404 if not found |
| `tenant_id` | `TenantId` → `string` | **Yes** | — | Must be non-empty (trimmed); overridden by `X-Tenant-Id` header |
| `namespace` | `Namespace` → `string` | **Yes** | — | Must be non-empty (trimmed) |
| `priority` | `Priority` → `string` | No | `"normal"` | `"low"` \| `"normal"` \| `"high"` \| `"critical"` |
| `timezone` | `string` | No | `"UTC"` | IANA timezone string |
| `metadata` | `serde_json::Value` → `unknown` | No | `{}` | Free-form JSON metadata |
| `context` | `ExecutionContext` → object | No | `{}` | See `ExecutionContext` schema; validated against sequence `input_schema` (422 on failure) |
| `dry_run` | `bool` | No | `false` | Enables dry-run mode for this instance |
| `dry_run_auto_approve` | `bool` | No | `false` | Auto-approves `human_review` gates in dry-run mode; ignored unless `dry_run` is true |
| `next_fire_at` | `Option<DateTime<Utc>>` → `string\|null` (ISO 8601) | No | `null` (fires immediately) | Schedule the instance in the future |
| `concurrency_key` | `Option<String>` → `string\|null` | No | `null` | Concurrency grouping key |
| `max_concurrency` | `Option<u32>` → `number\|null` | No | `null` | Max concurrent instances with same key |
| `idempotency_key` | `Option<String>` → `string\|null` | No | `null` | Dedup key; see idempotency rules |
| `budget` | `Option<Budget>` → object\|null | No | `null` | Resource budget (see `Budget` schema) |

#### Idempotency Rules (lifecycle.rs:26–38, 122–144)

- If `idempotency_key` is a **non-empty string** and a matching instance already exists in the same
  tenant, the existing instance is returned as `200 OK` with `{ "id": "...", "deduplicated": true }`.
- Empty / absent keys skip the dedup lookup and rely on the DB unique constraint instead.
- **Dry-run mode scopes the key**: a non-empty key for a dry-run is stored as `"dryrun:<key>"` so a
  real run with the same key is not deduplicated to a prior simulation. A real run's key of the
  literal string `"dryrun:<x>"` shares the dedup namespace of a dry-run with key `<x>` — this edge
  case is documented and accepted.

#### Pre-creation Validations

1. Tenant and namespace must be non-empty after trimming (422 → 400 `InvalidArgument`).
2. Sequence must exist (404 if not).
3. `context.data` is validated against the sequence's `input_schema` if present (422 `UnprocessableEntity`).
4. Serialized context must not exceed `max_context_bytes` (default 256 KiB).

#### Responses

| Status | Description | Body |
|---|---|---|
| 201 | Instance created | `{ "id": string }` |
| 200 | Deduplicated — idempotency key matched an existing instance | `{ "id": string, "deduplicated": true }` |
| 400 | Validation failure (empty tenant/namespace, bad priority, etc.) | error object |
| 404 | Referenced sequence not found | error object |
| 422 | `context.data` failed input schema validation | error object |

#### Example Request

```json
{
  "sequence_id": "01912e4d-1234-7abc-8def-000000000001",
  "tenant_id": "acme",
  "namespace": "orders",
  "priority": "high",
  "timezone": "America/New_York",
  "metadata": { "order_id": "ORD-42", "source": "web" },
  "context": {
    "data": { "order_id": "ORD-42", "amount": 99.99 },
    "config": { "retry_limit": 3 }
  },
  "dry_run": false,
  "next_fire_at": null,
  "idempotency_key": "order-ORD-42-fulfill",
  "budget": {
    "max_total_tokens": 50000,
    "max_steps": 20
  }
}
```

#### Example Response (201)

```json
{ "id": "01912e4d-abcd-7abc-8def-000000000099" }
```

---

### 2. Create Instances Batch

**POST /instances/batch**
**POST /api/v1/instances/batch**

- operationId / handler: `create_instances_batch`
- Auth: `X-API-Key`; `X-Tenant-Id` optional

#### Request Body (`BatchCreateRequest`)

| Field | Type (Rust → TS) | Required | Constraints |
|---|---|---|---|
| `instances` | `CreateInstanceRequest[]` | **Yes** | 0–10,000 items; empty batch returns `{ count: 0 }` with 200 (not 201) |

Each item in `instances` undergoes the same per-item validations as single create:
- tenant isolation enforced per item
- `tenant_id` and `namespace` must be non-empty
- context size checked per item
- all unique `sequence_id` values are resolved before any INSERT; 404 if any sequence is missing
- each item's `context.data` is validated against its sequence's `input_schema` (422 `instances[i]: ...`)

Mode-namespaced idempotency keys are applied per-item identically to single create.

#### Responses

| Status | Description | Body |
|---|---|---|
| 201 | Batch created (at least one item) | `{ "count": number }` |
| 200 | Empty batch (0 items passed) | `{ "count": 0 }` |
| 400 | Batch size > 10,000; or validation error | error object |
| 404 | A referenced sequence does not exist | error object |
| 422 | Input schema validation failure on one or more items | error object |

#### Example Request

```json
{
  "instances": [
    {
      "sequence_id": "01912e4d-1234-7abc-8def-000000000001",
      "tenant_id": "acme",
      "namespace": "orders",
      "context": { "data": { "order_id": "ORD-1" } }
    },
    {
      "sequence_id": "01912e4d-1234-7abc-8def-000000000001",
      "tenant_id": "acme",
      "namespace": "orders",
      "context": { "data": { "order_id": "ORD-2" } }
    }
  ]
}
```

#### Example Response

```json
{ "count": 2 }
```

---

### 3. List Instances

**GET /instances**
**GET /api/v1/instances**

- operationId / handler: `list_instances`
- Auth: `X-API-Key`; `X-Tenant-Id` optional

#### Query Parameters

| Name | Type | Required | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `tenant_id` | `string` | No | — | — | Overridden by `X-Tenant-Id` header if present |
| `namespace` | `string` | No | — | — | Filter by namespace |
| `sequence_id` | `string` (UUID) | No | — | Valid UUID | Filter by sequence |
| `state` | `string` | No | — | Comma-separated `InstanceState` values | E.g. `?state=running,waiting`; unknown values → 400 |
| `offset` | `number` | No | `0` | Non-negative integer | Pagination offset |
| `limit` | `number` | No | `100` | 1–1000 (capped by pagination) | Page size |
| `metadata.<key>` | `string` | No | — | String equality | Any additional param with `metadata.` prefix becomes a metadata filter; e.g. `?metadata.order_id=ORD-42` |

Multiple `metadata.<key>=<value>` params are combined with AND. Matching uses string equality on
top-level metadata keys (backed by a GIN index on Postgres, `json_extract` on SQLite).

Pagination: results are returned sorted descending (newest first) and wrapped in a
`PaginatedResponse`. The `limit` field is capped at 1000 by the `Pagination::capped()` method
[INFERRED — actual cap value not visible in these files; the `max 1000` note appears in the utoipa
annotation at lifecycle.rs:414].

#### Responses

| Status | Description | Body |
|---|---|---|
| 200 | Paginated list of instances | `PaginatedResponse<TaskInstance[]>` |
| 400 | Unknown state value in `state` param | error object |

#### Example

```
GET /api/v1/instances?tenant_id=acme&namespace=orders&state=running,waiting&metadata.source=web&limit=50&offset=0
```

---

### 4. Get Instance

**GET /instances/{id}**
**GET /api/v1/instances/{id}**

- operationId / handler: `get_instance`
- Auth: `X-API-Key`; `X-Tenant-Id` optional

#### Path Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | **Yes** | Instance ID |

If `X-Tenant-Id` is provided and the instance belongs to a different tenant, the response is
404 (not 403) — cross-tenant reads are hidden rather than disclosed (lifecycle.rs:324–329).

#### Responses

| Status | Description | Body |
|---|---|---|
| 200 | Instance found | `TaskInstance` |
| 404 | Instance not found (or cross-tenant attempt) | error object |

---

### 5. Get Instance Children

**GET /instances/{id}/children**
**GET /api/v1/instances/{id}/children**

- operationId / handler: `get_instance_children`
- Auth: `X-API-Key`; `X-Tenant-Id` optional

Returns all child instances spawned by this instance via SubSequence blocks.

#### Path Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | **Yes** | Parent instance ID |

Parent is resolved first; if parent is not found or is a different tenant, returns 404.
Tenant isolation is enforced against the parent's `tenant_id` (lifecycle.rs:357–360).

#### Responses

| Status | Description | Body |
|---|---|---|
| 200 | List of child instances | `TaskInstance[]` |
| 404 | Parent instance not found | error object |

---

### 6. Get Instance Logs

**GET /instances/{id}/logs**
**GET /api/v1/instances/{id}/logs**

- operationId / handler: `get_instance_logs`
- Auth: `X-API-Key`; `X-Tenant-Id` optional

Returns step-level logs for the instance, sorted oldest-first.

#### Path Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | **Yes** | Instance ID |

Tenant isolation enforced (same pattern as get_instance).

#### Responses

| Status | Description | Body |
|---|---|---|
| 200 | Step logs oldest-first | `StepLog[]` |
| 404 | Instance not found | error object |

---

### 7. Update Instance State

**PATCH /instances/{id}/state**
**PATCH /api/v1/instances/{id}/state**

- operationId / handler: `update_state`
- Auth: `X-API-Key`; `X-Tenant-Id` optional (enforced)

Manually drives the instance state machine. Validates the transition is legal before writing.

#### Path Parameters

| Name | Type | Required |
|---|---|---|
| `id` | `string` (UUID) | **Yes** |

#### Request Body (`UpdateStateRequest`)

| Field | Type | Required | Description |
|---|---|---|---|
| `state` | `InstanceState` (string) | **Yes** | Target state; must be reachable from current state |
| `next_fire_at` | `string\|null` (ISO 8601) | No | Override next scheduled fire time |

#### Parent Wake-up Side Effect (lifecycle.rs:510–538)

When this call drives a child instance to a terminal state (`failed`, `cancelled`, or `completed`)
**and** the child has a `parent_instance_id` **and** the parent is in `waiting` state, the parent
is automatically woken up by transitioning it to `scheduled` with `next_fire_at = now()`. This
mirrors the engine's internal `wake_parent_if_child` behavior, which only fires on engine-driven
transitions.

#### Responses

| Status | Description | Body |
|---|---|---|
| 200 | State updated | empty |
| 400 | Invalid state transition | error message |
| 404 | Instance not found | error object |

#### Example Request

```json
{ "state": "paused" }
```

---

### 8. Update Instance Context

**PATCH /instances/{id}/context**
**PATCH /api/v1/instances/{id}/context**

- operationId / handler: `update_context`
- Auth: `X-API-Key`; `X-Tenant-Id` optional (enforced)

Replaces the full `ExecutionContext` of an instance. The replacement context is size-checked
against `max_context_bytes` (default 256 KiB).

#### Path Parameters

| Name | Type | Required |
|---|---|---|
| `id` | `string` (UUID) | **Yes** |

#### Request Body (`UpdateContextRequest`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `context` | `ExecutionContext` | **Yes** | Full context replacement; must be valid `ExecutionContext` shape |

#### Responses

| Status | Description | Body |
|---|---|---|
| 200 | Context updated | empty |
| 404 | Instance not found | error object |
| 413 | Context exceeds size limit | error message |

#### Example Request

```json
{
  "context": {
    "data": { "order_id": "ORD-42", "approved": true },
    "config": { "retry_limit": 3 },
    "audit": [],
    "runtime": {}
  }
}
```

---

### 9. Retry Instance

**POST /instances/{id}/retry**
**POST /api/v1/instances/{id}/retry**

- operationId / handler: `retry_instance`
- Auth: `X-API-Key`; `X-Tenant-Id` optional (enforced)

Retries a `failed` instance. This is the DLQ rescue operation.

#### Path Parameters

| Name | Type | Required |
|---|---|---|
| `id` | `string` (UUID) | **Yes** |

#### Business Rules (lifecycle.rs:596–648)

1. Instance must be in `failed` state; any other state → 400.
2. The stale execution tree is deleted so the evaluator rebuilds from scratch.
3. **Sentinel block outputs** (in-progress markers from permanently failed steps) are deleted so
   those steps re-execute. **Real outputs** from successfully completed steps are preserved —
   side-effectful handlers (email, HTTP POST, etc.) will not re-fire.
4. Instance is transitioned to `scheduled` with `next_fire_at = now()`.

#### Responses

| Status | Description | Body |
|---|---|---|
| 200 | Instance retried | `{ "id": string, "state": "scheduled" }` |
| 400 | Instance is not in `failed` state | error message |
| 404 | Instance not found | error object |

---

### 10. Resume From Block

**POST /instances/{id}/resume-from/{block_id}**
**POST /api/v1/instances/{id}/resume-from/{block_id}**

- operationId / handler: `resume_from_block`
- Auth: `X-API-Key`; `X-Tenant-Id` optional (enforced)

DLQ surgery: re-run an instance from an arbitrary **top-level** block. Wipes the target block's
outputs and all outputs of blocks at or after it in the sequence's top-level `blocks` array
(including nested composites). Earlier blocks keep their outputs, so side-effectful handlers do
not re-run.

#### Path Parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | **Yes** | Instance ID |
| `block_id` | `string` | **Yes** | Block ID string; must be a **top-level** block of the sequence |

#### Request Body (`ResumeFromRequest`) — Optional

The entire body is optional. Send `{}` or omit the body entirely to resume without patching.

| Field | Type | Required | Notes |
|---|---|---|---|
| `context` | `serde_json::Value\|null` | No | Must be a JSON **object**; top-level keys are shallow-merged into `context.data` before re-scheduling |
| `signals` | `InjectedSignal[]` | No | Signals to enqueue atomically before the instance becomes claimable |

`InjectedSignal`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `signal_type` | `SignalType` → `string` | **Yes** | Any valid signal type (see `SignalType` values) |
| `payload` | `serde_json::Value` | No | Defaults to `{}` |

#### Business Rules (lifecycle.rs:788–936)

1. Instance must be in a **quiescent** state: `failed`, `paused`, `completed`, or `cancelled`.
   Running/Scheduled/Waiting → 400 (`"pause or cancel the instance first"`).
2. `context` patch (if provided) must be a JSON object; non-object values → 400.
3. `block_id` must identify a top-level block in the sequence — nested blocks are not valid targets
   → 400. Sequence must exist → 404.
4. Wipe set: the target block + every block at or after it in top-level order + all blocks nested
   inside wiped composites (Parallel branches, Loop/ForEach bodies, Router routes, TryCatch arms,
   ABSplit variants, CancellationScope children).
5. Stale execution tree is deleted (identical to retry semantics).
6. Stale `worker_tasks` rows for wiped blocks are purged — the `UNIQUE(instance_id, block_id)`
   constraint would otherwise swallow re-dispatch via `ON CONFLICT DO NOTHING`.
7. Context patch (if any) is shallow-merged per key into `context.data`; size is rechecked.
8. Injected signals are enqueued **before** the state transition so they are pending when the
   instance is claimable (closes the race window of the separate "resume then signal" pattern).
9. Instance transitions to `scheduled` with `next_fire_at = now()`.

#### Responses

| Status | Description | Body |
|---|---|---|
| 200 | Instance re-scheduled | `{ "id": string, "state": "scheduled", "resumed_from": string, "outputs_deleted": number, "signals_enqueued": number }` |
| 400 | Invalid state; non-object context patch; unknown block_id; or block is not top-level | error message |
| 404 | Instance or sequence not found | error object |

#### Example Request

```json
{
  "context": { "approved_by": "admin@acme.com" },
  "signals": [
    { "signal_type": "custom:approval_received", "payload": { "decision": "approved" } }
  ]
}
```

---

### 11. Send Signal

**POST /instances/{id}/signals**
**POST /api/v1/instances/{id}/signals**

- operationId / handler: `send_signal`
- Auth: `X-API-Key`; `X-Tenant-Id` optional (enforced)

Enqueues a signal for an active (non-terminal) instance. Critical for HITL flows.

#### Path Parameters

| Name | Type | Required |
|---|---|---|
| `id` | `string` (UUID) | **Yes** |

#### Request Body (`SendSignalRequest`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `signal_type` | `SignalType` → `string` | **Yes** | Must be one of the `SignalType` wire values; custom signals need the `"custom:"` prefix |
| `payload` | `serde_json::Value` | No | Defaults to `{}`; for `update_context` must be a full `ExecutionContext` |

#### Business Rules (signals.rs)

1. Instance must exist; tenant isolation is enforced on the pre-check read.
2. Signal is persisted via `enqueue_signal_if_active`, which is an atomic operation: if the
   instance transitioned to a terminal state (`completed`, `failed`, `cancelled`) between the
   pre-check read and the INSERT, the signal is rejected with 400 (`"target is in a terminal state"`).
3. **Wake-up**: after enqueuing, if the instance is still in `scheduled` state (possibly with a
   future `next_fire_at`), its fire time is updated to `now()`. This is critical for HITL flows
   where `check_human_input` defers the instance for up to 5 seconds — without this, the signal
   would sit unprocessed until the deferred fire time.

#### Responses

| Status | Description | Body |
|---|---|---|
| 201 | Signal enqueued | `{ "signal_id": string }` |
| 400 | Instance is in a terminal state | error message |
| 404 | Instance not found | error object |

#### Common Signal Examples

Pause an instance:
```json
{ "signal_type": "pause" }
```

Resume a paused instance:
```json
{ "signal_type": "resume" }
```

Cancel an instance:
```json
{ "signal_type": "cancel" }
```

Send a HITL approval:
```json
{
  "signal_type": "custom:human_approved",
  "payload": { "approver": "alice@acme.com", "decision": "approved" }
}
```

Update context via signal:
```json
{
  "signal_type": "update_context",
  "payload": {
    "data": { "approved": true },
    "config": {},
    "audit": [],
    "runtime": {}
  }
}
```

---

### 12. Bulk Update State

**PATCH /instances/bulk/state**
**PATCH /api/v1/instances/bulk/state**

- operationId / handler: `bulk_update_state`
- Auth: `X-API-Key`; `X-Tenant-Id` optional (enforced)

Atomically updates the state of all instances matching the filter.

#### Request Body (`BulkUpdateStateRequest`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `filter` | `BulkFilter` | **Yes** | See `BulkFilter` schema below |
| `state` | `InstanceState` (string) | **Yes** | Target state for all matched instances |

#### `BulkFilter` Schema

| Field | Type | Required | Notes |
|---|---|---|---|
| `tenant_id` | `string\|null` | **Yes** (for bulk ops) | Must be non-null; bulk operations require an explicit tenant |
| `namespace` | `string\|null` | No | Filter by namespace |
| `sequence_id` | `string (UUID)\|null` | No | Filter by sequence |
| `states` | `InstanceState[]\|null` | No | Filter by current states |
| `metadata` | `Record<string, string>\|null` | No | Equality filter on `metadata` keys (AND combination) |

**Important**: bulk operations require an explicit `tenant_id` (either via `X-Tenant-Id` header or
`filter.tenant_id`). If neither is set, the call returns 400: `"bulk operations require a
tenant_id"` (bulk.rs:32–35).

Note: `BulkFilter.metadata` is supported in `batch_action` (bulk.rs:158–170) but is currently set
to `None` in `bulk_update_state` and `bulk_reschedule` (bulk.rs:43, 74) — metadata filtering is
only active for `batch-action`. [INFERRED]

#### Responses

| Status | Description | Body |
|---|---|---|
| 200 | Bulk update applied | `{ "count": number }` |
| 400 | Missing `tenant_id` | error message |

---

### 13. Bulk Reschedule

**PATCH /instances/bulk/reschedule**
**PATCH /api/v1/instances/bulk/reschedule**

- operationId / handler: `bulk_reschedule`
- Auth: `X-API-Key`; `X-Tenant-Id` optional (enforced)

Shifts `next_fire_at` for all matching instances by a fixed offset.

#### Request Body (`BulkRescheduleRequest`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `filter` | `BulkFilter` | **Yes** | Same as bulk update; `tenant_id` required |
| `offset_secs` | `i64` → `number` | **Yes** | Seconds to shift: positive = later, negative = earlier |

#### Responses

| Status | Description | Body |
|---|---|---|
| 200 | Bulk reschedule applied | `{ "count": number }` |
| 400 | Missing `tenant_id` | error message |

---

### 14. Batch Action

**POST /instances/batch-action**
**POST /api/v1/instances/batch-action**

- operationId / handler: `batch_action`
- Auth: `X-API-Key`; `X-Tenant-Id` optional (enforced)

Applies one control action to every instance matching the filter. Audited; supports dry-run.

#### Request Body (`BatchActionRequest`)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `filter` | `BulkFilter` | **Yes** | — | `tenant_id` required |
| `action` | `BatchAction` (string) | **Yes** | — | `"retry"`, `"pause"`, `"resume"`, `"cancel"`, `"signal"` |
| `signal_type` | `string\|null` | Cond. | `null` | Required when `action == "signal"`; the custom signal name without the `"custom:"` prefix |
| `payload` | `serde_json::Value` | No | `{}` | Payload for the `"signal"` action |
| `dry_run` | `bool` | No | `false` | When true, count matching instances but apply nothing |
| `limit` | `number` | No | `1000` | Hard cap: 1–10,000 instances acted on (clamped by server) |

#### `BatchAction` values

| Value | Description | Applicability |
|---|---|---|
| `"retry"` | Re-run — clears stale execution tree + sentinel outputs, then re-schedules | Only `failed` instances; others are **skipped** |
| `"pause"` | Enqueues a `pause` control signal | Active (non-terminal) instances only; terminal → **skipped** |
| `"resume"` | Enqueues a `resume` control signal | Active instances only |
| `"cancel"` | Enqueues a `cancel` control signal | Active instances only |
| `"signal"` | Enqueues a custom signal (`"custom:<signal_type>"`) | Active instances only; requires `signal_type` |

For `pause`, `resume`, `cancel`, `signal`: the signal is enqueued via `enqueue_signal_if_active`.
A terminal target results in a **skip** (not a failure).

#### Responses

| Status | Description | Body |
|---|---|---|
| 200 | Batch action result | `BatchActionResponse` |
| 400 | Missing `tenant_id`; `signal` action missing `signal_type` | error message |

#### `BatchActionResponse` Schema

| Field | Type | Description |
|---|---|---|
| `matched` | `number` | Instances matched by the filter (capped at `limit`) |
| `applied` | `number` | Instances the action was applied to |
| `skipped` | `number` | Instances not applicable (e.g. retry of non-failed, signal to terminal) |
| `failed` | `number` | Instances where a storage error occurred |
| `dry_run` | `bool` | Whether this was a dry-run |

#### Example: Bulk Retry Failed Instances

```json
{
  "filter": {
    "tenant_id": "acme",
    "namespace": "orders",
    "states": ["failed"]
  },
  "action": "retry",
  "dry_run": false,
  "limit": 500
}
```

#### Example: Dry-run Count

```json
{
  "filter": {
    "tenant_id": "acme",
    "states": ["running", "waiting"]
  },
  "action": "cancel",
  "dry_run": true
}
```

Response:
```json
{ "matched": 17, "applied": 0, "skipped": 0, "failed": 0, "dry_run": true }
```

---

### 15. List DLQ (Dead Letter Queue)

**GET /instances/dlq**
**GET /api/v1/instances/dlq**

- operationId / handler: `list_dlq`
- Auth: `X-API-Key`; `X-Tenant-Id` optional

Returns all `failed` instances. This is a convenience filter on top of `GET /instances` with
`state=failed` pre-applied (bulk.rs:104–111).

#### Query Parameters

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `tenant_id` | `string` | No | — | Overridden by `X-Tenant-Id` header |
| `namespace` | `string` | No | — | Filter by namespace |
| `sequence_id` | `string (UUID)` | No | — | Filter by sequence |
| `offset` | `number` | No | `0` | Pagination offset |
| `limit` | `number` | No | `100` | Page size (capped internally) |

Unlike `GET /instances`, `state` is not a parameter here — it is always `failed`. Results are
sorted descending (newest failed first).

#### Responses

| Status | Description | Body |
|---|---|---|
| 200 | Failed instances | `TaskInstance[]` |

---

## Business Rules Summary

| # | Rule | Source |
|---|---|---|
| BR-1 | `tenant_id` must be non-empty (trimmed) on single and batch create | lifecycle.rs:86, 220 |
| BR-2 | `namespace` must be non-empty (trimmed) on single and batch create | lifecycle.rs:91, 225 |
| BR-3 | `sequence_id` must reference an existing sequence (404 otherwise) | lifecycle.rs:100–105 |
| BR-4 | `context.data` is validated against the sequence's `input_schema` (422 on failure) | lifecycle.rs:109 |
| BR-5 | Context serialized size must not exceed `max_context_bytes` (default 256 KiB) | lifecycle.rs:112; context.rs:28 |
| BR-6 | Batch create: empty batch → 200 + `count=0`; > 10,000 → 400 | lifecycle.rs:203–209 |
| BR-7 | Idempotency keys for dry-run are prefixed `"dryrun:"` to isolate dedup namespace | lifecycle.rs:26–38 |
| BR-8 | Non-empty idempotency key match returns 200 with `deduplicated: true` | lifecycle.rs:131–145 |
| BR-9 | All instances are created in `scheduled` state (no other initial state) | lifecycle.rs:148 |
| BR-10 | State transitions are validated via `can_transition_to`; invalid transitions → 400 | lifecycle.rs:494–499; instance.rs:65 |
| BR-11 | Retry is only valid on `failed` instances | lifecycle.rs:612–617 |
| BR-12 | Retry deletes the stale execution tree | lifecycle.rs:624–627 |
| BR-13 | Retry deletes sentinel outputs (failed-step markers) but preserves completed outputs | lifecycle.rs:631–638 |
| BR-14 | resume-from-block only valid on quiescent states: `failed`, `paused`, `completed`, `cancelled` | lifecycle.rs:790–801 |
| BR-15 | resume-from-block: `block_id` must be a top-level block in the sequence | lifecycle.rs:825–832 |
| BR-16 | resume-from-block: context patch must be a JSON object (not array/string/number) | lifecycle.rs:804–812 |
| BR-17 | resume-from-block: wipes target block + all subsequent blocks including nested composites | lifecycle.rs:838–841 |
| BR-18 | resume-from-block: purges stale `worker_tasks` for wiped blocks to avoid ON CONFLICT swallow | lifecycle.rs:862–867 |
| BR-19 | resume-from-block: injected signals are enqueued **before** the wake transition | lifecycle.rs:894–912 |
| BR-20 | update_state: driving a child to terminal wakes a Waiting parent | lifecycle.rs:510–538 |
| BR-21 | Cross-tenant reads return 404 (not 403) to avoid tenant disclosure | lifecycle.rs:326–329 |
| BR-22 | Signal delivery: `enqueue_signal_if_active` is atomic; terminal instance → 400 | signals.rs:70–82 |
| BR-23 | Signal delivery: instance in `scheduled` state is woken to `next_fire_at = now()` after signal | signals.rs:89–96 |
| BR-24 | bulk/state and bulk/reschedule require explicit `tenant_id` | bulk.rs:32–35, 65–68 |
| BR-25 | batch-action requires explicit `tenant_id` | bulk.rs:145–149 |
| BR-26 | batch-action `signal` variant requires `signal_type` | bulk.rs:152–156 |
| BR-27 | batch-action `limit` is clamped to 1–10,000 server-side | bulk.rs:181 |
| BR-28 | batch-action retry skips non-failed instances | bulk.rs:236–238 |
| BR-29 | batch-action signal to terminal instance is skipped, not failed | bulk.rs:275–278 |
| BR-30 | Budget breach pauses the instance; `metadata.paused_reason = "budget_exceeded"` | instance.rs:177–183 |
| BR-31 | Budget check is pre-flight (before executing work on each tick); one tick may slightly overshoot | instance.rs:177 |
| BR-32 | Custom signal wire format requires `"custom:"` prefix to prevent typo-as-custom-signal | signal.rs:48–53 |
| BR-33 | `update_context` signal payload must be a full `ExecutionContext` object | signal.rs:119–127 |
| BR-34 | `dry_run` flag is OR-merged between the request field and `context.runtime.dry_run` | lifecycle.rs:117 |
| BR-35 | `dry_run_auto_approve` is OR-merged between request field and `context.runtime.dry_run_auto_approve` | lifecycle.rs:118 |

---

## Open Issues

The following items could not be determined from the assigned files:

1. **`PaginatedResponse` shape**: the list endpoint wraps results in `crate::PaginatedResponse` but its schema (total count, has_next, items field name, etc.) is not in the assigned files.
2. **`StepLog` schema**: `GET /instances/{id}/logs` returns `Vec<StepLog>` but the `StepLog` type is in `orch8-types/src/step_log.rs` which was not assigned.
3. **Pagination cap (`max 1000`)**: the utoipa annotation mentions `max 1000` for the list endpoint but `Pagination::capped()` implementation was not in scope.
4. **`BulkFilter.metadata` on `bulk_update_state` and `bulk_reschedule`**: the filter struct has a `metadata` field but these two bulk endpoints set `metadata_filter: None` unconditionally (bulk.rs:43, 74) — unclear if this is intentional or a gap.
5. **`schedule_id` vs `sequence_id` naming**: utoipa annotation uses `"sequence"` in path description but the router-level entity is `sequence_id`; no aliasing visible in assigned files.
6. **`PATCH /instances/{id}/state` with `Completed -> Scheduled`**: the transition table allows it (for resume-from-block surgery), but the PATCH endpoint does not validate whether the caller followed the required wipe procedure — it would transition without clearing outputs. Potentially a consistency risk [INFERRED].
7. **Max context bytes server config**: default is 256 KiB (`context.rs:28`) but the actual runtime value comes from `AppState::max_context_bytes`; the env var is `ORCH8_SCHEDULER__MAX_CONTEXT_BYTES`. Exact range/validation of this env var is not in scope.
8. **`session_id` semantics**: `TaskInstance.session_id` is documented as "cross-instance shared state" but the session management API is outside the assigned files.
9. **`list_dlq` sort order vs `list_instances`**: `list_dlq` uses `sort_ascending: false` (same as list_instances) per the code, but the DLQ view's pagination wrapping behavior (raw `Vec` vs `PaginatedResponse`) differs from list_instances — `list_dlq` returns a raw `Vec<TaskInstance>` without a pagination envelope (bulk.rs:125).
10. **`Budget` check timing during resumed run**: the comment at instance.rs:177 says a resumed instance "gets one more tick of work before the check fires again"; if this is still exceeded it pauses again. The exact behavior of the `"budget_exceeded"` metadata key lifecycle (when it is cleared) is not in the assigned files.
