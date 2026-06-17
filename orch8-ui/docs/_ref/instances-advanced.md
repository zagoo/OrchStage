## Instances: Fork, Inject, Checkpoints, Timeline, Outputs, Artifacts, Audit

This section covers the advanced instance operations used for time-travel debugging, dynamic workflow mutation, output inspection, binary artifact access, and per-instance audit history. All endpoints are served at both canonical (`/api/v1/...`) and legacy bare (`/...`) paths. Auth: `X-API-Key` header required; tenant-scoped requests also need `X-Tenant-Id`.

---

### Shared Auth Model

Every endpoint in this section performs tenant ownership enforcement:

- If `X-Tenant-Id` is present (tenant-scoped key), the target instance's `tenant_id` must match. A mismatch returns `404 Not Found` — the same error as a genuinely missing instance, so existence cannot be probed across tenants.
- If the key is a root/admin key with no `X-Tenant-Id`, all instances are accessible.

---

## Fork Instance

### `POST /api/v1/instances/{id}/fork`

**Legacy path:** `POST /instances/{id}/fork`  
**OperationId / handler:** `fork_instance`  
**Tag:** `instances`

Clone a running, completed, or failed instance into a new sandbox that resumes execution from an arbitrary top-level block. The source instance is **never mutated**: forking is permitted from any source state. The fork gets a fresh identity, starts in `scheduled` state, and fires immediately once its pre-fork output seeds have been written.

#### Operational Use Case

Time-travel debugging and "what-if" branching without risking production side-effects. A fork re-uses the source instance's computed outputs for blocks before the fork point (skipping re-execution of those steps), then re-executes from `from_block_id` onward. By default the fork runs in `dry_run: true` mode to prevent re-firing real side-effects.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Source instance ID |

#### Request Body — `ForkRequest`

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `from_block_id` | string | Yes | — | Must be a top-level block ID of the source sequence | Execution resumes at (and re-runs) this block on the fork |
| `context` | object (JSON) | No | `null` | Must be a JSON object if present | Shallow-merged into the fork's `context.data` (same per-key semantics as resume-from) |
| `dry_run` | boolean | No | `true` | — | Whether the fork runs in dry-run mode; defaults `true` to prevent re-firing side-effects |
| `signals` | array of `InjectedSignal` | No | `[]` | — | Signals enqueued on the fork before it becomes claimable (avoids the racy "fork then signal" two-call pattern) |

##### `InjectedSignal` Object

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `signal_type` | `SignalType` | Yes | — | Type of the signal to inject |
| `payload` | any JSON | No | `{}` | Signal payload |

#### Request Body Example

```json
{
  "from_block_id": "enrich_profile",
  "context": { "feature_flag_new_scorer": true },
  "dry_run": true,
  "signals": [
    { "signal_type": "resume", "payload": { "manual": true } }
  ]
}
```

#### Response — `201 Created` — `ForkResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | ID of the newly created fork instance |
| `forked_from` | string (UUID) | Source instance ID |
| `state` | string | Always `"scheduled"` |
| `copied_blocks` | number | Count of pre-fork top-level blocks whose outputs were copied (will NOT re-execute) |
| `rerun_blocks` | array of string | Block IDs that could not be copied and will re-execute (plus all blocks from `from_block_id` onward) |
| `dry_run` | boolean | Whether the fork runs in dry-run mode |

#### Response Example

```json
{
  "id": "018f4b2c-0000-7000-8000-000000000001",
  "forked_from": "018f4b2c-0000-7000-8000-000000000000",
  "state": "scheduled",
  "copied_blocks": 3,
  "rerun_blocks": ["fetch_external_data"],
  "dry_run": true
}
```

The fork's `metadata` object is inherited from the source, with two keys added:
- `forked_from`: source instance UUID
- `forked_at_block`: value of `from_block_id`

#### Error Responses

| Status | Condition |
|--------|-----------|
| `400 Bad Request` | `from_block_id` is not a top-level block of the source sequence; or `context` is not a JSON object |
| `404 Not Found` | Instance or its sequence not found; or cross-tenant access attempted |

#### Business Rules

1. **Block granularity for copy/re-run partition.** Copyable = the block executed AND every member's latest `block_outputs` row has an inline payload (no externalized ref, no trailing sentinel). If any nested block in a composite group is non-copyable, the entire composite re-runs.
2. **Inline outputs only.** Artifact-backed (externalized) outputs cannot be safely shared across instances because ownership is keyed by the source instance ID. Such blocks go into `rerun_blocks`.
3. **Sentinel trailing rows.** A block whose latest row carries `output_ref = "__in_progress__"` or `"__error__"` is treated as non-copyable (mid-flight or crashed).
4. **Older `__retry__` rows do NOT block copy.** Retry markers behind a real inline output are skipped during the storage copy; this resets the attempt counter on the fork without preventing the copy.
5. **No concurrency/idempotency slots.** Fork instances have `concurrency_key = null`, `max_concurrency = null`, and `idempotency_key = null` — they cannot contend with or deduplicate against the source's production slots.
6. **Fork is un-claimable until armed.** The fork is created with `next_fire_at = null`; the scheduler's claim predicate (`next_fire_at <= now()`) will not pick it up. After outputs and signals are written, the fork is armed by setting `next_fire_at = now()`.
7. **Context patch must be a JSON object.** Any non-object value (array, string, number, boolean, null) at the `context` field returns `400 InvalidArgument`.
8. **`context.check_size`** is enforced after patching — if the merged context exceeds `max_context_bytes`, the request is rejected.

---

## Inject Blocks

### `POST /api/v1/instances/{id}/inject-blocks`

**Legacy path:** `POST /instances/{id}/inject-blocks`  
**OperationId / handler:** `inject_blocks`  
**Tag:** `instances`

Dynamically insert one or more blocks into a running instance's sequence at a specified position. The storage write is transactional: concurrent position-targeted injections cannot clobber each other.

#### Operational Use Case

Adding ad-hoc review steps, escalation paths, or compensating actions to an in-flight workflow without restarting it.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Instance ID |

#### Request Body — `InjectBlocksRequest`

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `blocks` | array of `BlockDefinition` | Yes | — | Must be a non-empty JSON array; each element must deserialize as a valid `BlockDefinition` | Blocks to inject |
| `position` | number (usize) | No | `null` | 0-indexed | Position in the instance's current block list at which to insert. `null` = append |

##### `BlockDefinition` Variants

Each block must include a `"type"` discriminant and the fields for that variant. Supported types (from `BlockDefinition` enum, `inject.rs:47-59`):

| Type string | Description |
|-------------|-------------|
| `step` | Single handler step |
| `parallel` | Parallel block group |
| `race` | Race (first-to-complete wins) block group |
| `loop` | Loop block |
| `for_each` | ForEach block |
| `router` | Router block |
| `try_catch` | Try/catch block |
| `sub_sequence` | Sub-sequence reference |
| `ab_split` | A/B split block |
| `cancellation_scope` | Cancellation scope block |

A minimal `step` definition example:

```json
[
  {
    "type": "step",
    "id": "manual_approval_1",
    "handler": "approval_handler",
    "params": { "approver": "ops-team" },
    "delay": null,
    "retry": null,
    "timeout": null
  }
]
```

#### Response — `200 OK`

```json
{
  "injected_block_ids": ["manual_approval_1"],
  "position": 2,
  "total_injected": 5
}
```

| Field | Type | Description |
|-------|------|-------------|
| `injected_block_ids` | array of string | IDs of the newly injected blocks |
| `position` | number or null | Injection position used (echoes request) |
| `total_injected` | number | Total count of blocks in the updated sequence |

#### Error Responses

| Status | Condition |
|--------|-----------|
| `400 Bad Request` | `blocks` is not a JSON array; array is empty; any element is not a valid `BlockDefinition` |
| `404 Not Found` | Instance not found or cross-tenant |

#### Business Rules

9. **Non-empty array required.** An empty `blocks` array returns `400`.
10. **Each block must parse as a `BlockDefinition`.** An unrecognized variant or missing required fields in any element returns `400` identifying the offending index (e.g., `"blocks[0] is not a valid BlockDefinition"`).
11. **Transactional write.** The storage backend merges and writes the injected blocks in a single transaction to prevent lost-update races on concurrent position-targeted injections.

---

## Checkpoints

### `POST /api/v1/instances/{id}/checkpoints`

**Legacy path:** `POST /instances/{id}/checkpoints`  
**OperationId / handler:** `save_checkpoint`  
**Tag:** `instances`

Persist an arbitrary execution-state snapshot for the instance. Used by the engine (or an operator) to create recovery points for long-running workflows.

#### Operational Use Case

Efficient recovery: instead of replaying from the very beginning, restore to the most recent checkpoint. The `checkpoint_data` is freeform JSON — typically contains completed block IDs, a context snapshot, and step counters.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Instance ID |

#### Request Body — `SaveCheckpointRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `checkpoint_data` | any JSON | Yes | Snapshot of execution state (no schema enforced server-side) |

Example:

```json
{
  "checkpoint_data": {
    "completed_blocks": ["fetch_user", "validate_input"],
    "context_snapshot": { "user_id": "u123", "score": 42 }
  }
}
```

#### Response — `201 Created`

```json
{ "id": "018f4b2c-1234-7000-8000-000000000002" }
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | ID of the newly created checkpoint (UUID v7) |

#### Error Responses

| Status | Condition |
|--------|-----------|
| `404 Not Found` | Instance not found or cross-tenant |

---

### `GET /api/v1/instances/{id}/checkpoints`

**Legacy path:** `GET /instances/{id}/checkpoints`  
**OperationId / handler:** `list_checkpoints`  
**Tag:** `instances`

List all checkpoints for an instance (most recent first, hard-capped at 100 rows).

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Instance ID |

#### Response — `200 OK` — `Checkpoint[]`

Array of `Checkpoint` objects (see entity table below).

```json
[
  {
    "id": "018f4b2c-1234-7000-8000-000000000002",
    "instance_id": "018f4b2c-0000-7000-8000-000000000000",
    "checkpoint_data": { "completed_blocks": ["fetch_user"] },
    "created_at": "2026-06-17T12:00:00Z"
  }
]
```

#### Business Rules

12. **Hard cap of 100 rows.** `list_checkpoints` always requests at most 100 rows from storage. [INFERRED: storage returns newest-first; no pagination beyond 100 is exposed.]

---

### `GET /api/v1/instances/{id}/checkpoints/latest`

**Legacy path:** `GET /instances/{id}/checkpoints/latest`  
**OperationId / handler:** `get_latest_checkpoint`  
**Tag:** `instances`

Return the single most recently created checkpoint for the instance.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Instance ID |

#### Response — `200 OK` — `Checkpoint`

Single `Checkpoint` object.

#### Error Responses

| Status | Condition |
|--------|-----------|
| `404 Not Found` | Instance not found, cross-tenant, OR no checkpoint exists for the instance |

---

### `POST /api/v1/instances/{id}/checkpoints/prune`

**Legacy path:** `POST /instances/{id}/checkpoints/prune`  
**OperationId / handler:** `prune_checkpoints`  
**Tag:** `instances`

Delete old checkpoints, keeping only the `keep` most recent ones.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Instance ID |

#### Request Body — `PruneCheckpointsRequest`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `keep` | number (u32) | Yes | >= 0 | Number of most recent checkpoints to retain |

```json
{ "keep": 5 }
```

#### Response — `200 OK` — `CountResponse`

```json
{ "count": 12 }
```

| Field | Type | Description |
|-------|------|-------------|
| `count` | number | Number of checkpoints deleted |

---

## Timeline

### `GET /api/v1/instances/{id}/timeline`

**Legacy path:** `GET /instances/{id}/timeline`  
**OperationId / handler:** `get_timeline`  
**Tag:** `instances`

Return a flat, chronological view of all executed blocks plus instance-level state transitions. Unlike `GET /instances/{id}/outputs` (which strips internal bookkeeping rows), the timeline **surfaces sentinel rows** (`__in_progress__`, `__retry__`, `__error__`) flagged via `is_sentinel: true` — necessary for time-travel debugging to see retries and crash markers.

#### Operational Use Case

The timeline is the primary debugging view. It combines:
- Executed-block entries with output payloads (paginated)
- Instance state transitions from the audit log
- Current instance state and context

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Instance ID |

#### Query Parameters

| Parameter | Type | Required | Default | Constraints | Description |
|-----------|------|----------|---------|-------------|-------------|
| `offset` | number (u64) | No | `0` | — | Pagination offset over executed-block entries |
| `limit` | number (u32) | No | `200` | 1–1000 (clamped) | Page size |
| `include_outputs` | boolean | No | `true` | — | When `false`, omits `output` payloads from entries and `context` from the instance summary |

#### Response — `200 OK` — `TimelineResponse`

| Field | Type | Description |
|-------|------|-------------|
| `instance` | `TimelineInstance` | Instance-level summary (see below) |
| `state_transitions` | `TimelineStateTransition[]` | State transitions from audit log, chronological (newest-first from storage, reversed), capped at 200 entries. Empty if audit logging is disabled |
| `entries` | `TimelineEntry[]` | Executed-block rows in execution order (`created_at ASC`), paginated |
| `offset` | number | Echoes request offset |
| `limit` | number | Effective page size (after clamping) |
| `has_more` | boolean | `true` when `entries.length >= limit` (full-page heuristic) |

##### `TimelineInstance` Object

| Field | Type | Nullable/Optional | Description |
|-------|------|-------------------|-------------|
| `id` | string (UUID) | No | Instance ID |
| `sequence_id` | string (UUID) | No | Sequence ID |
| `state` | `InstanceState` | No | Current instance state |
| `created_at` | string (ISO 8601) | No | Instance creation timestamp |
| `updated_at` | string (ISO 8601) | No | Last update timestamp |
| `context` | `ExecutionContext` | Omitted when `include_outputs=false` | Current execution context |

##### `TimelineEntry` Object

| Field | Type | Nullable/Optional | Description |
|-------|------|-------------------|-------------|
| `block_id` | string | No | Block identifier |
| `attempt` | number (u16) | No | Attempt number (0-indexed) |
| `completed_at` | string (ISO 8601) | No | When the block execution or sentinel write completed |
| `output` | any JSON | Omitted when `include_outputs=false` | Inline output payload. For externalized rows: the stored reference marker is returned as-is |
| `output_ref` | string | Omitted when null | Externalized-payload key OR sentinel tag: `"__in_progress__"`, `"__retry__"`, `"__error__"` |
| `is_sentinel` | boolean | No | `true` for crash-recovery sentinels, retry markers, or error markers |

##### `TimelineStateTransition` Object

| Field | Type | Nullable/Optional | Description |
|-------|------|-------------------|-------------|
| `from_state` | string | Optional (omitted if null) | Previous instance state |
| `to_state` | string | Optional (omitted if null) | New instance state |
| `at` | string (ISO 8601) | No | When the transition occurred |

#### Sentinel `output_ref` Values

| Value | Meaning |
|-------|---------|
| `"__in_progress__"` | Crash-recovery sentinel written before handler execution (block started but not yet completed) |
| `"__retry__"` | Retry marker written after a retryable failure to advance the attempt counter |
| `"__error__"` | Error marker for a terminal failure |

#### Response Example

```json
{
  "instance": {
    "id": "018f4b2c-0000-7000-8000-000000000000",
    "sequence_id": "018f4b00-0000-7000-8000-000000000000",
    "state": "running",
    "created_at": "2026-06-17T11:00:00Z",
    "updated_at": "2026-06-17T12:05:00Z",
    "context": { "data": { "user_id": "u123" }, "runtime": {} }
  },
  "state_transitions": [
    { "from_state": "scheduled", "to_state": "running", "at": "2026-06-17T11:00:01Z" }
  ],
  "entries": [
    {
      "block_id": "fetch_user",
      "attempt": 0,
      "completed_at": "2026-06-17T11:00:02Z",
      "output": { "name": "Alice" },
      "is_sentinel": false
    },
    {
      "block_id": "validate_input",
      "attempt": 0,
      "completed_at": "2026-06-17T11:00:03Z",
      "output_ref": "__retry__",
      "is_sentinel": true
    },
    {
      "block_id": "validate_input",
      "attempt": 1,
      "completed_at": "2026-06-17T11:00:05Z",
      "output": { "valid": true },
      "is_sentinel": false
    }
  ],
  "offset": 0,
  "limit": 200,
  "has_more": false
}
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| `404 Not Found` | Instance not found or cross-tenant |

#### Business Rules

13. **Sentinels are flagged, not hidden.** The timeline always includes `__in_progress__`, `__retry__`, and `__error__` rows; `is_sentinel: true` allows the UI to render them differently without filtering.
14. **State transitions capped at 200.** The audit log query uses a hard limit of 200 entries; transitions are returned chronologically (storage returns newest-first, reversed in-memory).
15. **Timeline limit is clamped.** Values outside `[1, 1000]` are silently clamped.
16. **`has_more` is a full-page heuristic.** If `entries.length >= limit`, `has_more` is `true`; this may produce a false positive on the exact-boundary case.
17. **`include_outputs=false` omits context too.** Because context can be as large as output payloads, the `context` field of `TimelineInstance` is also omitted when `include_outputs=false`.

---

## Outputs

### `GET /api/v1/instances/{id}/outputs`

**Legacy path:** `GET /instances/{id}/outputs`  
**OperationId / handler:** `get_outputs`  
**Tag:** `instances`

Return all non-sentinel `BlockOutput` rows for the instance. Internal bookkeeping rows (`__in_progress__`, `__retry__`) are stripped when a real output exists for that block; if the marker is the only row for a block it is retained so callers can see the step ran.

#### Operational Use Case

Programmatic inspection of every step's persisted output. Externalized payloads (large outputs stored in the artifact backend) are inflated in-place via a batched lookup before the response is sent — callers always receive resolved data, not opaque reference keys.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Instance ID |

#### Response — `200 OK` — `BlockOutput[]`

Array of `BlockOutput` objects (see entity table below).

```json
[
  {
    "id": "018f4b2c-aaaa-7000-8000-000000000001",
    "instance_id": "018f4b2c-0000-7000-8000-000000000000",
    "block_id": "fetch_user",
    "output": { "name": "Alice", "email": "alice@example.com" },
    "output_ref": null,
    "output_size": 47,
    "attempt": 0,
    "created_at": "2026-06-17T11:00:02Z"
  }
]
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| `404 Not Found` | Instance not found or cross-tenant |

#### Business Rules

18. **Stripping rule for internal rows.** `__in_progress__` and `__retry__` rows are dropped when a real (non-sentinel) output exists for the same `block_id`. When a marker is the only row, it is retained.
19. **`__error__` rows are NOT stripped.** Only `__in_progress__` and `__retry__` match the internal-row check. An `__error__` sentinel is treated as a real (non-internal) output.
20. **Batched externalized resolution.** All `output_ref` values that represent externalized payloads (detected via `extract_ref_key`) are resolved in a single batch storage query. Per-output resolution failures are tolerated: a missing or unresolvable ref leaves the marker value intact, and a warning is logged. A storage-level batch failure also does not abort the endpoint.
21. **Multi-row blocks.** A block that was retried has multiple `BlockOutput` rows (one per attempt, plus markers). All non-stripped rows are returned; the UI should order by `created_at ASC` and treat the last non-sentinel row as the canonical output.

---

### `GET /api/v1/instances/{id}/tree`

**Legacy path:** `GET /instances/{id}/tree`  
**OperationId / handler:** `get_execution_tree`  
**Tag:** `instances`

Return the hierarchical execution tree for the instance. The tree is the structured complement of the flat timeline: one `ExecutionNode` per block, nested to reflect composite block containment.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Instance ID |

#### Response — `200 OK` — `ExecutionNode[]`

Array of `ExecutionNode` objects. [INFERRED from utoipa annotation: `Vec<orch8_types::execution::ExecutionNode>`; exact `ExecutionNode` schema is defined in `orch8-types/src/execution.rs`, which is outside this assignment's file set.]

#### Error Responses

| Status | Condition |
|--------|-----------|
| `404 Not Found` | Instance not found or cross-tenant |

---

## Step Logs

### `GET /api/v1/instances/{id}/logs`

**Legacy path:** `GET /instances/{id}/logs`  
**OperationId / handler:** `get_instance_logs` (defined in `lifecycle.rs:379`)  
**Tag:** `instances`

Return all step-scoped log lines for the instance, ordered oldest-first. Logs are captured two ways: external workers attach them when completing/failing a task, and the engine captures in-process handler logs via a tracing layer scoped to the `orch8.step` span.

#### Operational Use Case

Per-step log viewer in the dashboard. Each log line is keyed by `block_id`, so the UI can filter or group by step.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Instance ID |

#### Response — `200 OK` — `StepLog[]`

Array of `StepLog` objects.

```json
[
  {
    "block_id": "fetch_user",
    "ts": "2026-06-17T11:00:01.500Z",
    "level": "info",
    "message": "Fetching user u123 from DB"
  },
  {
    "block_id": "validate_input",
    "ts": "2026-06-17T11:00:03.200Z",
    "level": "warn",
    "message": "Validation took 1200ms, approaching timeout"
  }
]
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| `404 Not Found` | Instance not found or cross-tenant |

#### Business Rules

22. **No pagination.** `list_step_logs` is called without a limit parameter at the storage layer. [INFERRED: For long-running instances with heavy logging, the caller receives all stored logs in one response.]
23. **Ordered oldest-first.** Storage returns logs in `created_at ASC` order per the endpoint description.
24. **Shared `step_logs` store.** Both external worker logs and in-process tracing logs land in the same store, keyed by `(instance_id, block_id)`.

---

## Artifacts

### `GET /api/v1/instances/{id}/artifacts`

**Legacy path:** `GET /instances/{id}/artifacts`  
**OperationId / handler:** `list_instance_artifacts`  
**Tag:** `instances`

List metadata for all artifacts (binary blobs) produced by the instance's steps.

#### Operational Use Case

Enumerate artifact attachments for display in the instance detail view. Each artifact is a durable binary blob (image, rendered page, exported file, etc.) stored in the configured artifact backend (local filesystem or S3-compatible storage). Steps pass `ArtifactRef` objects in their JSON outputs rather than inline bytes; this endpoint resolves those references to browsable metadata.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Instance ID |

#### Response — `200 OK`

```json
{
  "items": [
    {
      "key": "018f4b2c-0000-7000-8000-000000000000/a1b2c3",
      "size": 204800,
      "uri": "artifact://018f4b2c-0000-7000-8000-000000000000/a1b2c3"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `items` | array | List of artifact metadata objects |
| `items[].key` | string | Backend object key: `<instance_id>/<artifact_id>` |
| `items[].size` | number (u64) | Size in bytes |
| `items[].uri` | string | Logical URI: `artifact://<key>` |

#### Error Responses

| Status | Condition |
|--------|-----------|
| `404 Not Found` | Instance not found or cross-tenant |

#### Business Rules

25. **Existence is opaque across tenants.** The `require_owned_instance` helper returns `404` for both missing instances and cross-tenant access (same error, cannot probe existence).

---

### `GET /api/v1/artifacts/{key}`

**Legacy path:** `GET /artifacts/{key}`  
**OperationId / handler:** `get_artifact_bytes`  
**Tag:** `instances`

Download raw artifact bytes by object key. Tenant-scoped: ownership is verified by parsing the instance ID from the key prefix.

#### Operational Use Case

Stream artifact content for inline rendering (e.g., an image, a PDF preview) or download. The UI uses the `uri` from the artifact listing as the basis for this request, replacing the `artifact://` scheme with the API base URL.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | string | Yes | Artifact object key in the form `<instance_id>/<artifact_id>`. Axum captures as a wildcard segment (`{*key}`) to allow nested slashes |

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `content_type` | string | No | `"application/octet-stream"` | Override the `Content-Type` header in the response. The content type is not stored alongside the bytes; callers that know the MIME type (e.g. from the producing step's `ArtifactRef.content_type`) can pass it for inline rendering |

#### Response — `200 OK`

Raw bytes with `Content-Type` header set to either the `content_type` query param or `application/octet-stream`.

No JSON wrapper — the body is the artifact bytes.

#### Error Responses

| Status | Condition |
|--------|-----------|
| `404 Not Found` | Key does not contain a valid UUID prefix; instance not found; cross-tenant; or artifact bytes not found in storage |

#### Business Rules

26. **Tenant scope from key prefix.** The key format `<instance_id>/<artifact_id>` means the tenant check is performed by parsing the first segment as a UUID (the instance ID), then verifying the caller owns that instance.
27. **Content-Type not persisted.** The MIME type is only available from the `ArtifactRef` in the step output (which carries `content_type`). Callers that need inline rendering must pass `?content_type=<mime>`.
28. **Artifact blobs not swept on instance deletion.** The `ArtifactRef` code comment notes this as a known gap: object-store blobs are not automatically cleaned up when an instance is deleted.

---

## Audit Log

### `GET /api/v1/instances/{id}/audit`

**Legacy path:** `GET /instances/{id}/audit`  
**OperationId / handler:** `list_audit_log`  
**Tag:** `instances`

Return up to 200 audit log entries for the instance (newest-first). Entries are immutable records of state transitions and lifecycle events.

#### Operational Use Case

Compliance, debugging, and support investigation. Shows every state change, signal receipt, step completion, or step failure that was recorded for the instance's lifetime.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Instance ID |

#### Response — `200 OK` — `AuditLogEntry[]`

Array of `AuditLogEntry` objects.

```json
[
  {
    "id": "018f4b2c-ffff-7000-8000-000000000001",
    "instance_id": "018f4b2c-0000-7000-8000-000000000000",
    "tenant_id": "acme",
    "event_type": "state_transition",
    "from_state": "scheduled",
    "to_state": "running",
    "created_at": "2026-06-17T11:00:01Z"
  },
  {
    "id": "018f4b2c-ffff-7000-8000-000000000002",
    "instance_id": "018f4b2c-0000-7000-8000-000000000000",
    "tenant_id": "acme",
    "event_type": "step_completed",
    "block_id": "fetch_user",
    "details": { "duration_ms": 45 },
    "created_at": "2026-06-17T11:00:02Z"
  }
]
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| `404 Not Found` | Instance not found or cross-tenant |

#### Business Rules

29. **Hard cap of 200 entries.** The storage query uses a hard limit of `200`. Entries beyond this are not returned and there is no pagination mechanism.
30. **Audit log is best-effort.** The timeline endpoint notes that the audit log may be empty if audit logging is not enabled in the deployment.
31. **`from_state` / `to_state` / `block_id` are omitted from JSON when null.** These fields use `skip_serializing_if = "Option::is_none"`.

---

## Data Entities

### `Checkpoint`

Defined in `orch8-types/src/checkpoint.rs`.

| Field | Rust Type | TS Type | Nullable | Description |
|-------|-----------|---------|----------|-------------|
| `id` | `Uuid` | `string` | No | UUID v7, checkpoint identifier |
| `instance_id` | `InstanceId` | `string` | No | Owning instance ID |
| `checkpoint_data` | `serde_json::Value` | `unknown` | No | Freeform execution state snapshot. Typical shape: `{ completed_blocks: string[], context_snapshot: object }` |
| `created_at` | `DateTime<Utc>` | `string` (ISO 8601) | No | Creation timestamp |

### `BlockOutput`

Defined in `orch8-types/src/output.rs`.

| Field | Rust Type | TS Type | Nullable | Description |
|-------|-----------|---------|----------|-------------|
| `id` | `Uuid` | `string` | No | UUID v7, row identifier |
| `instance_id` | `InstanceId` | `string` | No | Owning instance ID |
| `block_id` | `BlockId` | `string` | No | Block identifier |
| `output` | `serde_json::Value` | `unknown` | No | Output payload. May be `null` for sentinel/externalized rows |
| `output_ref` | `Option<String>` | `string \| null` | Yes | Externalized-payload reference key OR sentinel tag (`__in_progress__`, `__retry__`, `__error__`) |
| `output_size` | `u32` | `number` | No | Serialized output size in bytes |
| `attempt` | `u16` | `number` | No | Attempt number (0-indexed) |
| `created_at` | `DateTime<Utc>` | `string` (ISO 8601) | No | When the output row was persisted |

Note on multi-row blocks: a retried block produces multiple `BlockOutput` rows. Rows with `output_ref = "__retry__"` or `"__in_progress__"` are bookkeeping markers. The canonical output is the latest row without a sentinel `output_ref`.

### `ArtifactRef` (in step outputs)

Defined in `orch8-types/src/artifact.rs`. Travels inside step output JSON as `{ "artifact": { ... } }`.

| Field | Rust Type | TS Type | Nullable | Description |
|-------|-----------|---------|----------|-------------|
| `id` | `String` | `string` | No | Opaque artifact ID, unique within the instance |
| `instance_id` | `String` | `string` | No | Owning instance ID (string form) |
| `key` | `String` | `string` | No | Backend object key: `<instance_id>/<id>` |
| `content_type` | `String` | `string` | No | MIME type captured at store time (e.g. `image/png`, `text/html`) |
| `size` | `u64` | `number` | No | Size in bytes |
| `uri` | `String` | `string` | No | Logical URI: `artifact://<key>` |

### `ArtifactMeta` (from list endpoint)

Defined in `orch8-types/src/artifact.rs`. Used as the source for list-artifacts response items.

| Field | Rust Type | TS Type | Nullable | Description |
|-------|-----------|---------|----------|-------------|
| `key` | `String` | `string` | No | Backend object key |
| `size` | `u64` | `number` | No | Size in bytes |

The list endpoint wraps these as `{ key, size, uri }` where `uri = "artifact://" + key`.

### `AuditLogEntry`

Defined in `orch8-types/src/audit.rs`.

| Field | Rust Type | TS Type | Nullable | Description |
|-------|-----------|---------|----------|-------------|
| `id` | `Uuid` | `string` | No | UUID v7, entry identifier |
| `instance_id` | `InstanceId` | `string` | No | Owning instance ID |
| `tenant_id` | `TenantId` | `string` | No | Owning tenant |
| `event_type` | `String` | `string` | No | Event kind: `state_transition`, `signal_received`, `step_completed`, `step_failed`, others |
| `from_state` | `Option<String>` | `string \| undefined` | Yes | Previous state (for `state_transition` events); omitted from JSON if null |
| `to_state` | `Option<String>` | `string \| undefined` | Yes | New state (for `state_transition` events); omitted from JSON if null |
| `block_id` | `Option<String>` | `string \| undefined` | Yes | Related block ID (for step events); omitted from JSON if null |
| `details` | `serde_json::Value` | `unknown` | No | Additional event data (e.g. error message, signal payload, duration) |
| `created_at` | `DateTime<Utc>` | `string` (ISO 8601) | No | When the event occurred |

### `StepLog` / `StepLogEntry`

Defined in `orch8-types/src/step_log.rs`.

**`StepLog`** (returned by `GET /instances/{id}/logs`):

| Field | Rust Type | TS Type | Nullable | Description |
|-------|-----------|---------|----------|-------------|
| `block_id` | `String` | `string` | No | Block this log line belongs to |
| `ts` | `DateTime<Utc>` | `string` (ISO 8601) | No | Log line timestamp |
| `level` | `String` | `string` | No | Log level: `trace`, `debug`, `info`, `warn`, `error` |
| `message` | `String` | `string` | No | Log message text |

**`StepLogEntry`** (used when workers submit logs on task completion — not a direct API response type but the storage model):

| Field | Rust Type | TS Type | Description |
|-------|-----------|---------|-------------|
| `ts` | `DateTime<Utc>` | `string` | Log line timestamp |
| `level` | `String` | `string` | Log level (same values as above) |
| `message` | `String` | `string` | Log message text |

---

## Endpoint Reference Summary

| Method | Canonical Path | Legacy Path | Handler | Auth |
|--------|---------------|-------------|---------|------|
| POST | `/api/v1/instances/{id}/fork` | `/instances/{id}/fork` | `fork_instance` | Key + optional tenant |
| POST | `/api/v1/instances/{id}/inject-blocks` | `/instances/{id}/inject-blocks` | `inject_blocks` | Key + optional tenant |
| POST | `/api/v1/instances/{id}/checkpoints` | `/instances/{id}/checkpoints` | `save_checkpoint` | Key + optional tenant |
| GET | `/api/v1/instances/{id}/checkpoints` | `/instances/{id}/checkpoints` | `list_checkpoints` | Key + optional tenant |
| GET | `/api/v1/instances/{id}/checkpoints/latest` | `/instances/{id}/checkpoints/latest` | `get_latest_checkpoint` | Key + optional tenant |
| POST | `/api/v1/instances/{id}/checkpoints/prune` | `/instances/{id}/checkpoints/prune` | `prune_checkpoints` | Key + optional tenant |
| GET | `/api/v1/instances/{id}/timeline` | `/instances/{id}/timeline` | `get_timeline` | Key + optional tenant |
| GET | `/api/v1/instances/{id}/outputs` | `/instances/{id}/outputs` | `get_outputs` | Key + optional tenant |
| GET | `/api/v1/instances/{id}/tree` | `/instances/{id}/tree` | `get_execution_tree` | Key + optional tenant |
| GET | `/api/v1/instances/{id}/logs` | `/instances/{id}/logs` | `get_instance_logs` | Key + optional tenant |
| GET | `/api/v1/instances/{id}/artifacts` | `/instances/{id}/artifacts` | `list_instance_artifacts` | Key + optional tenant |
| GET | `/api/v1/artifacts/{*key}` | `/artifacts/{*key}` | `get_artifact_bytes` | Key + optional tenant |
| GET | `/api/v1/instances/{id}/audit` | `/instances/{id}/audit` | `list_audit_log` | Key + optional tenant |

---

## Open Issues

1. **`ExecutionNode` schema not in scope.** `GET /instances/{id}/tree` returns `Vec<ExecutionNode>` but `orch8-types/src/execution.rs` was not assigned. The exact shape of `ExecutionNode` (fields, nesting structure, status enums) is unknown from these files.
2. **Checkpoint `list_checkpoints` ordering not confirmed.** The hard cap of 100 rows is clear, but whether the storage returns newest-first or oldest-first is [INFERRED] from context; the Rust code does not explicitly specify ordering direction for `list_checkpoints`.
3. **`AuditLogEntry.event_type` enumeration is open.** The type file documents `state_transition`, `signal_received`, `step_completed`, `step_failed` as examples but the field is `String` — no exhaustive enum exists in the assigned files. Additional event types may be emitted by the engine.
4. **Artifact cleanup on instance deletion.** The `ArtifactRef` code comment (`artifact.rs:24`) explicitly notes that object-store blobs are not automatically swept when an instance is deleted. The UI should communicate this to operators — artifact storage will grow unbounded without manual pruning.
5. **`inject_blocks` on a completed/failed instance.** No state guard is enforced in the handler code. Whether injecting blocks into a non-running instance has defined semantics (or silently succeeds and has no effect) is not determinable from the assigned files.
6. **`save_checkpoint` auth variant.** The `save_checkpoint` handler uses `crate::auth::OptionalTenant` (via `enforce_tenant_access`), the same pattern as other endpoints. The checkpoint endpoint is not listed in any "engine-internal only" guard in the reviewed code, meaning external callers with a valid API key can create checkpoints. Whether this is intentional for external tooling is not stated.
7. **`StepLog` pagination.** `get_instance_logs` calls `list_step_logs` without any limit or offset parameter. For instances with high log volume this could return unbounded results. No pagination is exposed.
8. **Legacy root path deprecation timeline.** `lib.rs:144` marks the bare-path mount with `TODO(v2): remove this bare merge once all clients use /api/v1`. The target release for removing the legacy paths is not specified.
