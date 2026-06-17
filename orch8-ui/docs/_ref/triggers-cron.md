## Triggers & Cron Schedules

Sources: `engine/orch8-api/src/triggers.rs`, `engine/orch8-types/src/trigger.rs`, `engine/orch8-api/src/cron.rs`, `engine/orch8-types/src/cron.rs`, `engine/orch8-engine/src/ap_poll.rs`, `engine/orch8-engine/src/cron.rs`.

---

### Overview

**Triggers** are named event sources that create workflow instances on demand. Each trigger binds a unique slug to a sequence name; when the trigger fires, the engine looks up the sequence, creates a new `TaskInstance`, and starts it with the event payload as initial context data.

**Cron schedules** create instances on a recurring calendar schedule. They reference a sequence by UUID (`sequence_id`) rather than name, support timezone-aware firing, and can enforce concurrency overlap policies.

Both resources are fully multi-tenant. Auth uses `X-API-Key` + `X-Tenant-Id` (see [Auth rules](#auth)).

Path prefix: all endpoints are mounted under `/api/v1/…` (canonical) **and** at the bare root `/…` (legacy, deprecated, will be removed in a future major release). The legacy mount is a verbatim copy — both prefixes behave identically. (`lib.rs:132–145`)

---

### Auth

All trigger and cron endpoints use the standard API key + optional tenant header scheme:

| Header | Required | Notes |
|---|---|---|
| `X-API-Key` | Yes (when key auth is configured) | Identifies the caller; scopes the tenant when the key is tenant-bound |
| `X-Tenant-Id` | Optional / conditional | Must match the key's tenant when both are present; used as fallback when key has no tenant |

`OptionalTenant` is an Axum extractor that carries the resolved tenant context after middleware runs (`auth.rs:21`). When a key is bound to a tenant, `X-Tenant-Id` cannot be used to cross tenants.

`fire_trigger` additionally requires `X-Trigger-Secret` (a separate header, not the API key) when the trigger has a `secret` configured — see [POST /triggers/{slug}/fire](#post-triggersslugfire).

---

## 1. Triggers

### 1.1 Shared Types

#### TriggerType

Enum (`serde(rename_all = "snake_case")`). Default: `"webhook"`. (`trigger.rs:10–28`)

| Variant (wire) | Description |
|---|---|
| `"webhook"` | Inbound HTTP webhook. `POST /triggers/{slug}/fire` or the public `/webhooks/{slug}` endpoint fires it. |
| `"nats"` | Receives messages from a NATS subject. Managed by the engine's in-process listener loop. Requires NATS feature flag. |
| `"file_watch"` | Watches a filesystem path for changes. Config must include a `"path"` string key. |
| `"event"` | In-process event bus. No HMAC validation — intended for trusted server-to-server or in-cluster use. |
| `"activepieces_poll"` | Polling trigger via the ActivePieces Node sidecar. The engine periodically polls the sidecar and creates one instance per returned item. Config is validated at creation time. |

TypeScript union: `"webhook" | "nats" | "file_watch" | "event" | "activepieces_poll"`

#### TriggerDef (response schema)

Returned by all trigger read endpoints. (`trigger.rs:98–128`)

| Field | TS Type | Nullable/Optional | Default | Notes |
|---|---|---|---|---|
| `slug` | `string` | required | — | Unique identifier; 1–255 chars; pattern `^[a-z0-9][a-z0-9-]*$` (CONVENTIONS.md) |
| `sequence_name` | `string` | required | — | Name of the sequence to instantiate; 1–255 chars |
| `version` | `number \| null` | optional, omitted if null | — | If omitted, uses the latest published version |
| `tenant_id` | `string` | required | — | Tenant that owns this trigger |
| `namespace` | `string` | required | `"default"` | Namespace for created instances |
| `enabled` | `boolean` | required | `true` | If `false`, firing returns 400 |
| `secret` | `string \| null` | optional, omitted if null | — | **Always serialized as `"[REDACTED]"` in API responses** — the raw value is never returned after creation (`trigger.rs:117`, test at `trigger.rs:259`) |
| `trigger_type` | `TriggerType` | required | `"webhook"` | See TriggerType table |
| `config` | `unknown` | required | `null` | Type-specific configuration JSON; validated for `"activepieces_poll"` |
| `created_at` | `string` (ISO 8601 UTC) | required | — | Server-set at creation |
| `updated_at` | `string` (ISO 8601 UTC) | required | — | Server-set at creation; not updated on fire |

#### TriggerPollState (embedded in GET response for activepieces_poll triggers)

(`trigger.rs:61–95`)

| Field | TS Type | Nullable/Optional | Default | Notes |
|---|---|---|---|---|
| `slug` | `string` | required | — | Trigger slug this state belongs to |
| `state` | `unknown` | required | `null` | Opaque cursor blob from the sidecar's last successful poll; sent back verbatim on the next poll |
| `last_poll_at` | `string \| null` (ISO 8601 UTC) | optional, omitted if null | — | When the last poll attempt completed (success or failure) |
| `last_error` | `string \| null` | optional, omitted if null | — | Error message from most recent failed poll; cleared on success |
| `consecutive_failures` | `number` | required | `0` | Number of consecutive failed polls; reset to 0 on success |
| `updated_at` | `string` (ISO 8601 UTC) | required | — | When poll state was last written |

---

### 1.2 Endpoint Reference

#### POST /triggers — Create Trigger

| | |
|---|---|
| **Handler** | `create_trigger` (`triggers.rs:73`) |
| **Canonical path** | `POST /api/v1/triggers` |
| **Legacy path** | `POST /triggers` |
| **Auth** | `X-API-Key` + `X-Tenant-Id` (tenant-scoped) |
| **Success** | `201 Created` + `TriggerDef` body |
| **Errors** | `400 Bad Request` (validation), `401 Unauthorized` (tenant mismatch) |

**Request body** (`CreateTriggerRequest`, `triggers.rs:38–52`):

| Field | TS Type | Required | Default | Constraints |
|---|---|---|---|---|
| `slug` | `string` | yes | — | 1–255 chars; pattern `^[a-z0-9][a-z0-9-]*$` (CONVENTIONS.md `SLUG_RE`); must be non-empty (`triggers.rs:78`) |
| `sequence_name` | `string` | yes | — | 1–255 chars; must be non-empty (`triggers.rs:78`) |
| `version` | `number \| null` | no | `null` | Specific sequence version to bind; omit for latest |
| `tenant_id` | `string` | yes | — | Must match `X-Tenant-Id` when header is present (`triggers.rs:101`) |
| `namespace` | `string` | no | `"default"` | Serde default via `orch8_types::serde_defaults::default_namespace` |
| `secret` | `string \| null` | no | `null` | If provided, firing requires `X-Trigger-Secret` header matching this value (constant-time compare) |
| `trigger_type` | `TriggerType` | no | `"webhook"` | See TriggerType enum |
| `config` | `unknown` | no | `null` | For `"activepieces_poll"` see [ActivepiecesPoll config](#activepieces_poll-config); for `"file_watch"` must include `"path"` string |

**Validation rules** (`triggers.rs:78–98`):

1. `slug` and `sequence_name` must be non-empty.
2. `slug` length ≤ 255 characters.
3. `sequence_name` length ≤ 255 characters.
4. If `trigger_type = "activepieces_poll"`, `config` is validated by `orch8_engine::ap_poll::parse_config` — see [ActivepiecesPoll config](#activepieces_poll-config).

**`enabled` field behavior**: newly created triggers are always `enabled = true` regardless of any field in the request body — `enabled` is not part of `CreateTriggerRequest` and is hard-coded at creation (`triggers.rs:113`). [INFERRED: there is no update endpoint for triggers, so `enabled` cannot be toggled post-creation via the API.]

**Instance metadata injected on fire** (`engine/orch8-engine/src/triggers.rs:185–189`):

```json
{
  "_trigger": "<slug>",
  "_trigger_type": "<trigger_type>",
  "_trigger_event": { "source": "http_fire" }
}
```

**Response** (`201 Created`): full `TriggerDef` object as described above. `secret` value is `"[REDACTED]"` in the response.

```json
{
  "slug": "on-push",
  "sequence_name": "ci-pipeline",
  "version": null,
  "tenant_id": "t_acme",
  "namespace": "default",
  "enabled": true,
  "trigger_type": "webhook",
  "config": null,
  "created_at": "2026-06-17T10:00:00Z",
  "updated_at": "2026-06-17T10:00:00Z"
}
```

---

#### GET /triggers — List Triggers

| | |
|---|---|
| **Handler** | `list_triggers` (`triggers.rs:134`) |
| **Canonical path** | `GET /api/v1/triggers` |
| **Legacy path** | `GET /triggers` |
| **Auth** | `X-API-Key` + `X-Tenant-Id` |
| **Success** | `200 OK` + `TriggerDef[]` body |
| **Errors** | None documented |

**Query parameters** (`TriggerQuery`, `triggers.rs:54–64`):

| Param | TS Type | Required | Default | Notes |
|---|---|---|---|---|
| `tenant_id` | `string` | no | — | Filter to a specific tenant; ignored when caller's key is already tenant-scoped |
| `limit` | `number` | no | `100` | Maximum number of results to return |

**Response** (`200 OK`): JSON array of `TriggerDef` objects. No pagination envelope — the array is returned directly. `has_more` is not included. [INFERRED: consumers should pass `limit` and compare result count to detect truncation.]

```json
[
  {
    "slug": "on-push",
    "sequence_name": "ci-pipeline",
    "tenant_id": "t_acme",
    "namespace": "default",
    "enabled": true,
    "trigger_type": "webhook",
    "config": null,
    "created_at": "2026-06-17T10:00:00Z",
    "updated_at": "2026-06-17T10:00:00Z"
  }
]
```

---

#### GET /triggers/{slug} — Get Trigger

| | |
|---|---|
| **Handler** | `get_trigger` (`triggers.rs:158`) |
| **Canonical path** | `GET /api/v1/triggers/{slug}` |
| **Legacy path** | `GET /triggers/{slug}` |
| **Auth** | `X-API-Key` + `X-Tenant-Id` |
| **Success** | `200 OK` + `TriggerDef` (or `TriggerDef` + `poll_state` for `activepieces_poll`) |
| **Errors** | `404 Not Found` |

**Path parameters**:

| Param | TS Type | Required | Notes |
|---|---|---|---|
| `slug` | `string` | yes | Trigger slug (case-sensitive) |

**Special behavior for `activepieces_poll` triggers** (`triggers.rs:177–194`): The response object is augmented with a `poll_state` field containing the runtime bookkeeping for the polling loop. This is a JSON merge — `poll_state` is inserted at the top level of the `TriggerDef` object.

```json
{
  "slug": "stripe-new-payment",
  "sequence_name": "payment-pipeline",
  "tenant_id": "t_acme",
  "namespace": "default",
  "enabled": true,
  "trigger_type": "activepieces_poll",
  "config": {
    "piece": "stripe",
    "trigger": "new_payment",
    "interval_secs": 60
  },
  "created_at": "2026-06-17T10:00:00Z",
  "updated_at": "2026-06-17T10:00:00Z",
  "poll_state": {
    "slug": "stripe-new-payment",
    "state": null,
    "last_poll_at": "2026-06-17T11:00:00Z",
    "last_error": null,
    "consecutive_failures": 0,
    "updated_at": "2026-06-17T11:00:00Z"
  }
}
```

When `poll_state` has never been written, the field is `null` (`triggers.rs:187`).

**Error**: `404` if `slug` is not found. Cross-tenant access returns `404` (not `403`) to avoid revealing existence.

---

#### DELETE /triggers/{slug} — Delete Trigger

| | |
|---|---|
| **Handler** | `delete_trigger` (`triggers.rs:205`) |
| **Canonical path** | `DELETE /api/v1/triggers/{slug}` |
| **Legacy path** | `DELETE /triggers/{slug}` |
| **Auth** | `X-API-Key` + `X-Tenant-Id` |
| **Success** | `204 No Content` (empty body) |
| **Errors** | `404 Not Found` |

**Path parameters**:

| Param | TS Type | Required | Notes |
|---|---|---|---|
| `slug` | `string` | yes | Trigger slug |

The trigger is fetched first to verify existence and tenant ownership, then deleted. Cross-tenant access returns `404`.

[INFERRED: deleting a trigger does not cancel in-progress instances that were created by it. The running instances continue independently.]

---

#### POST /triggers/{slug}/fire — Fire Trigger

| | |
|---|---|
| **Handler** | `fire_trigger` (`triggers.rs:244`) |
| **Canonical path** | `POST /api/v1/triggers/{slug}/fire` |
| **Legacy path** | `POST /triggers/{slug}/fire` |
| **Auth** | `X-API-Key` + `X-Tenant-Id` + optional `X-Trigger-Secret` |
| **Success** | `201 Created` + fire response object |
| **Errors** | `400 Bad Request` (trigger disabled or bad secret), `401 Unauthorized` (wrong secret), `404 Not Found` |

**Path parameters**:

| Param | TS Type | Required | Notes |
|---|---|---|---|
| `slug` | `string` | yes | Trigger slug |

**Request headers**:

| Header | Required | Notes |
|---|---|---|
| `X-Trigger-Secret` | Conditional | Required when trigger has a `secret` configured; compared constant-time against the stored secret (`triggers.rs:270–278`) |

**Request body**: any JSON value (`serde_json::Value`). Becomes the `context.data` of the created instance.

```json
{ "ref": "refs/heads/main", "sha": "abc123" }
```

**Validation rules** (`triggers.rs:263–278`):

1. Trigger must be `enabled = true`; if not, returns `400` with message `"trigger '{slug}' is disabled"`.
2. If trigger has a `secret`, the `X-Trigger-Secret` header must match; mismatch returns `401`.

**Instance creation** (`triggers.rs:281–288`): calls `orch8_engine::triggers::create_trigger_instance`. This:
1. Resolves the sequence by `(tenant, namespace, sequence_name, version)`.
2. Creates a `TaskInstance` with state `"scheduled"`, priority `"normal"`, and metadata:
   ```json
   { "_trigger": "<slug>", "_trigger_type": "<type>", "_trigger_event": { "source": "http_fire" } }
   ```
3. Persists via `storage.create_instance`.

**Response** (`201 Created`):

```json
{
  "instance_id": "019xxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "trigger": "on-push",
  "sequence_name": "ci-pipeline"
}
```

| Field | TS Type | Notes |
|---|---|---|
| `instance_id` | `string` (UUID v7) | ID of the created instance |
| `trigger` | `string` | Slug of the trigger that fired |
| `sequence_name` | `string` | Name of the sequence instantiated |

**Error** `404`: Trigger slug not found, or cross-tenant access attempt.

---

### 1.3 ActivepiecesPoll Config Schema

When `trigger_type = "activepieces_poll"`, the `config` field is validated by `orch8_engine::ap_poll::parse_config` at create time (`triggers.rs:95–98`, `ap_poll.rs:109–172`).

| Field | TS Type | Required | Constraints |
|---|---|---|---|
| `piece` | `string` | yes | Non-empty; only lowercase ASCII letters, digits, and hyphens; must not start with `-` |
| `trigger` | `string` | yes | Non-empty string (piece trigger name, e.g. `"new_failed_payment"`) |
| `auth` | `unknown` | no | Passed verbatim to the sidecar; supports `credentials://` reference strings |
| `props` | `unknown` | no | Trigger properties; passed verbatim to the sidecar; defaults to `{}` |
| `interval_secs` | `number` | no | Positive integer ≥ 1; mutually exclusive with `cron` |
| `cron` | `string` | no | Standard cron expression (see cron validation rules); mutually exclusive with `interval_secs` |

If neither `interval_secs` nor `cron` is set, the engine falls back to `DEFAULT_POLL_INTERVAL_SECS = 60` seconds (`ap_poll.rs:63`).

The minimum poll delay enforced by the engine is 1 second (`ap_poll.rs:67`).

**Validation errors (400)** — any of the following cause a `400` with message `"invalid activepieces_poll config: <details>"`:
- `config` is not a JSON object
- `piece` is missing, empty, or contains uppercase/non-alphanumeric characters (other than `-`)
- `piece` starts with `-`
- `trigger` is missing or empty
- `interval_secs` is not a positive integer
- `cron` does not parse as a valid cron expression
- Both `interval_secs` and `cron` are set simultaneously

```json
{
  "piece": "stripe",
  "trigger": "new_payment",
  "auth": { "apiKey": "sk_live_..." },
  "props": { "account": "acct_123" },
  "interval_secs": 300
}
```

---

### 1.4 Slug Validation Rules

The `slug` field is the primary identifier and URL path segment for triggers.

- **Pattern**: `^[a-z0-9][a-z0-9-]*$` — must start with a lowercase letter or digit; subsequent characters may be lowercase letters, digits, or hyphens (`CONVENTIONS.md:71`, `SLUG_RE`).
- **Minimum length**: 1 character.
- **Maximum length**: 255 characters (`triggers.rs:83`).
- **Case sensitivity**: lowercase only; uppercase characters are rejected.
- **Uniqueness**: slugs are unique globally (not scoped per-tenant). The storage layer enforces this — attempting to create a duplicate slug returns a storage conflict error. [INFERRED: response code for duplicate slug conflicts is likely `409 Conflict` via `ApiError::from_storage`, but exact code is not confirmed in these files.]

---

### 1.5 Instance Creation Flow

When a trigger fires (via HTTP fire, NATS message, file change, or ActivePieces poll), the following happens:

1. **Sequence resolution**: `storage.get_sequence_by_name(tenant_id, namespace, sequence_name, version)`. Returns `404` if not found.
2. **Instance building**: A `TaskInstance` is constructed with:
   - `state: "scheduled"`
   - `priority: "normal"`
   - `next_fire_at: <now>` (immediately eligible for dispatch)
   - `context.data`: the event payload (request body for HTTP fire)
   - `metadata._trigger`: slug
   - `metadata._trigger_type`: trigger type
   - `metadata._trigger_event`: source metadata (e.g. `{"source": "http_fire"}`)
   - `tenant_id`, `namespace` from the trigger definition
   - `session_id`, `parent_instance_id`, `concurrency_key`, `idempotency_key`: all `null`
3. **Persistence**: `storage.create_instance(instance)`.

(`engine/orch8-engine/src/triggers.rs:168–248`)

---

## 2. Cron Schedules

### 2.1 Shared Types

#### OverlapPolicy

Enum (`serde(rename_all = "snake_case")`). Default: `"allow"`. (`cron.rs:12–28`)

| Variant (wire) | Description |
|---|---|
| `"allow"` | Fire regardless of previous runs (default). |
| `"skip"` | Skip the occurrence when a previous run is still active. Skips are counted in `skipped_fires` / `last_skipped_at` and the `orch8_cron_skipped_total` metric. |
| `"buffer_one"` | Defer the occurrence until the previous run finishes, then fire once. Multiple missed occurrences collapse into one. |
| `"cancel_previous"` | Cancel still-active previous runs before firing. |

TypeScript union: `"allow" | "skip" | "buffer_one" | "cancel_previous"`

#### CronSchedule (response schema)

(`cron.rs:56–82`)

| Field | TS Type | Nullable/Optional | Default | Notes |
|---|---|---|---|---|
| `id` | `string` (UUID v7) | required | — | Server-assigned at creation; UUIDv7 (time-ordered) |
| `tenant_id` | `string` | required | — | Tenant that owns this schedule |
| `namespace` | `string` | required | — | Namespace for created instances |
| `sequence_id` | `string` (UUID) | required | — | UUID of the sequence to instantiate (by ID, not name) |
| `cron_expr` | `string` | required | — | Cron expression (5-, 6-, or 7-field; see [Cron Expression Format](#cron-expression-format)) |
| `timezone` | `string` | required | `"UTC"` | IANA timezone name (e.g. `"America/New_York"`) |
| `enabled` | `boolean` | required | `true` | Disabled schedules do not fire |
| `metadata` | `unknown` | required | `{}` | Injected into created instances; arbitrary JSON |
| `overlap_policy` | `OverlapPolicy` | required | `"allow"` | Concurrency control when previous run still active |
| `skipped_fires` | `number` | required | `0` | Count of occurrences skipped by the `"skip"` policy |
| `last_skipped_at` | `string \| null` (ISO 8601 UTC) | nullable | — | When the `"skip"` policy last skipped an occurrence |
| `last_triggered_at` | `string \| null` (ISO 8601 UTC) | nullable | — | When the schedule last successfully fired |
| `next_fire_at` | `string \| null` (ISO 8601 UTC) | nullable | — | Pre-computed next fire time; `null` if the expression has no future occurrences |
| `created_at` | `string` (ISO 8601 UTC) | required | — | Server-set at creation |
| `updated_at` | `string` (ISO 8601 UTC) | required | — | Updated on each PUT |

---

### 2.2 Endpoint Reference

#### POST /cron — Create Cron Schedule

| | |
|---|---|
| **Handler** | `create_cron` (`cron.rs:132`) |
| **Canonical path** | `POST /api/v1/cron` |
| **Legacy path** | `POST /cron` |
| **Auth** | `X-API-Key` + `X-Tenant-Id` |
| **Success** | `201 Created` + create response object |
| **Errors** | `400 Bad Request` (invalid cron expression) |

**Request body** (`CreateCronRequest`, `cron.rs:28–43`):

| Field | TS Type | Required | Default | Constraints |
|---|---|---|---|---|
| `tenant_id` | `string` | yes | — | Must match `X-Tenant-Id` when header is present |
| `namespace` | `string` | yes | — | Namespace for created instances |
| `sequence_id` | `string` (UUID) | yes | — | UUID of the sequence to instantiate |
| `cron_expr` | `string` | yes | — | Cron expression; validated by `validate_cron_expr` |
| `timezone` | `string` | no | `"UTC"` | IANA timezone name |
| `metadata` | `unknown` | no | `{}` | Arbitrary JSON injected into instances |
| `enabled` | `boolean` | no | `true` | |
| `overlap_policy` | `OverlapPolicy` | no | `"allow"` | |

**Validation**: `cron_expr` is validated by `orch8_engine::cron::validate_cron_expr` — see [Cron Expression Format](#cron-expression-format). Invalid expressions return `400`.

**`next_fire_at` computation**: After building the schedule, the server calls `calculate_next_fire` to compute `next_fire_at` before persisting. The value reflects the first upcoming fire time relative to `now` at creation time.

**Response** (`201 Created`):

```json
{
  "id": "019xxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "next_fire_at": "2026-06-18T09:00:00Z"
}
```

| Field | TS Type | Notes |
|---|---|---|
| `id` | `string` (UUID v7) | Server-assigned schedule ID |
| `next_fire_at` | `string \| null` (ISO 8601 UTC) | First upcoming fire time; `null` if expression has no future occurrences |

Note: the create response is a **minimal object** (id + next_fire_at), not the full `CronSchedule`. Fetch via `GET /cron/{id}` if the full record is needed.

---

#### GET /cron — List Cron Schedules

| | |
|---|---|
| **Handler** | `list_cron` (`cron.rs:254`) |
| **Canonical path** | `GET /api/v1/cron` |
| **Legacy path** | `GET /cron` |
| **Auth** | `X-API-Key` + `X-Tenant-Id` |
| **Success** | `200 OK` + `CronSchedule[]` |
| **Errors** | None documented |

**Query parameters** (`ListCronQuery`, `cron.rs:63–67`):

| Param | TS Type | Required | Default | Notes |
|---|---|---|---|---|
| `tenant_id` | `string` | no | — | Filter by tenant; ignored when key is already tenant-scoped |
| `limit` | `number` | no | `100` | Maximum results to return |

**Response** (`200 OK`): JSON array of `CronSchedule` objects (full schema). No pagination envelope.

```json
[
  {
    "id": "019xxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "tenant_id": "t_acme",
    "namespace": "default",
    "sequence_id": "018xxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "cron_expr": "0 9 * * MON-FRI",
    "timezone": "America/New_York",
    "enabled": true,
    "metadata": {},
    "overlap_policy": "skip",
    "skipped_fires": 0,
    "last_skipped_at": null,
    "last_triggered_at": null,
    "next_fire_at": "2026-06-17T13:00:00Z",
    "created_at": "2026-06-17T10:00:00Z",
    "updated_at": "2026-06-17T10:00:00Z"
  }
]
```

---

#### GET /cron/{id} — Get Cron Schedule

| | |
|---|---|
| **Handler** | `get_cron` (`cron.rs:191`) |
| **Canonical path** | `GET /api/v1/cron/{id}` |
| **Legacy path** | `GET /cron/{id}` |
| **Auth** | `X-API-Key` + `X-Tenant-Id` |
| **Success** | `200 OK` + `CronSchedule` |
| **Errors** | `404 Not Found` |

**Path parameters**:

| Param | TS Type | Required | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | yes | Cron schedule UUID |

**Response** (`200 OK`): full `CronSchedule` object.

---

#### GET /cron/{id}/next-fires — Preview Next Fire Times

| | |
|---|---|
| **Handler** | `next_fires` (`cron.rs:222`) |
| **Canonical path** | `GET /api/v1/cron/{id}/next-fires` |
| **Legacy path** | `GET /cron/{id}/next-fires` |
| **Auth** | `X-API-Key` + `X-Tenant-Id` |
| **Success** | `200 OK` + next-fires response object |
| **Errors** | `404 Not Found` |

**Path parameters**:

| Param | TS Type | Required | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | yes | Cron schedule UUID |

**Query parameters** (`NextFiresQuery`, `cron.rs:73–77`):

| Param | TS Type | Required | Default | Constraints |
|---|---|---|---|---|
| `n` | `number` | no | `5` | Number of upcoming fires to return; server clamps to range `[1, 50]` (`cron.rs:241`) |

**DST-correct computation** (`cron.rs:83–108`): The server iterates up to `n` times, each time computing the next fire after the previous one using `orch8_engine::cron::calculate_next_fire_after`. This function correctly handles:
- **Spring-forward gaps**: an occurrence falling in a nonexistent local time fires at the gap's end (the first valid instant) instead of being skipped.
- **Fall-back ambiguity**: an occurrence in an ambiguous local time fires once at the pre-transition (first) occurrence.

Stops early if the expression has no further occurrences.

**Response** (`200 OK`):

```json
{
  "timezone": "America/New_York",
  "fires": [
    "2026-06-18T13:00:00Z",
    "2026-06-19T13:00:00Z",
    "2026-06-22T13:00:00Z",
    "2026-06-23T13:00:00Z",
    "2026-06-24T13:00:00Z"
  ]
}
```

| Field | TS Type | Notes |
|---|---|---|
| `timezone` | `string` | The schedule's configured timezone (IANA name) |
| `fires` | `string[]` (ISO 8601 UTC) | Upcoming fire instants in UTC; may be fewer than `n` if the expression runs out |

---

#### PUT /cron/{id} — Update Cron Schedule

| | |
|---|---|
| **Handler** | `update_cron` (`cron.rs:278`) |
| **Canonical path** | `PUT /api/v1/cron/{id}` |
| **Legacy path** | `PUT /cron/{id}` |
| **Auth** | `X-API-Key` + `X-Tenant-Id` |
| **Success** | `200 OK` + updated `CronSchedule` |
| **Errors** | `400 Bad Request` (invalid cron expression), `404 Not Found` |

**Path parameters**:

| Param | TS Type | Required | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | yes | Cron schedule UUID |

**Request body** (`UpdateCronRequest`, `cron.rs:54–60`): all fields optional; only provided fields are updated (patch semantics):

| Field | TS Type | Required | Notes |
|---|---|---|---|
| `cron_expr` | `string \| null` | no | If provided, validated by `validate_cron_expr`; replaces existing expression |
| `timezone` | `string \| null` | no | IANA timezone name; replaces existing timezone |
| `enabled` | `boolean \| null` | no | Enable or disable the schedule |
| `metadata` | `unknown \| null` | no | Replaces existing metadata entirely (not merged) |
| `overlap_policy` | `OverlapPolicy \| null` | no | Replaces existing policy |

**Side effects**: After applying updates, `next_fire_at` is recomputed via `calculate_next_fire` (`cron.rs:315`). The returned `CronSchedule` reflects the new `next_fire_at`.

**Immutable fields**: `id`, `tenant_id`, `namespace`, `sequence_id`, `created_at` cannot be updated. `skipped_fires`, `last_skipped_at`, `last_triggered_at` are engine-managed and not settable via this endpoint.

**Response** (`200 OK`): full updated `CronSchedule` object.

---

#### DELETE /cron/{id} — Delete Cron Schedule

| | |
|---|---|
| **Handler** | `delete_cron` (`cron.rs:330`) |
| **Canonical path** | `DELETE /api/v1/cron/{id}` |
| **Legacy path** | `DELETE /cron/{id}` |
| **Auth** | `X-API-Key` + `X-Tenant-Id` |
| **Success** | `204 No Content` (empty body) |
| **Errors** | `404 Not Found` |

**Path parameters**:

| Param | TS Type | Required | Notes |
|---|---|---|---|
| `id` | `string` (UUID) | yes | Cron schedule UUID |

Cross-tenant access returns `404`.

[INFERRED: deleting a schedule does not cancel in-flight instances it has created.]

---

### 2.3 Cron Expression Format

The engine accepts three field shapes, all validated by the `cron` crate (`orch8_engine/src/cron.rs:298–306, 382–388`):

| Shape | Fields | Example | Notes |
|---|---|---|---|
| 5-field (Unix standard) | `min hour dom mon dow` | `"0 9 * * MON-FRI"` | Normalized internally by prepending `"0"` (seconds) and appending `"*"` (year) |
| 6-field (cron crate native) | `sec min hour dom mon dow` | `"0 0 9 * * MON-FRI"` | Passed directly to cron parser |
| 7-field | `sec min hour dom mon dow year` | `"0 0 9 * * MON-FRI *"` | Passed directly to cron parser |

**Timezone**: stored as an IANA timezone string (e.g. `"UTC"`, `"America/New_York"`, `"Europe/Berlin"`). Parsed at fire time via `chrono_tz`. If the timezone string is invalid, the engine falls back to UTC rather than failing. [INFERRED: the API does not validate timezone names at create/update time — an invalid timezone silently falls back to UTC at runtime.]

**Validation at API level**: `validate_cron_expr` is called synchronously in `create_cron` and `update_cron`. An invalid expression returns `400` with message `"invalid cron expression: <parser error>"`.

**Examples of valid expressions**:
```
"0 0 9 * * MON-FRI *"    (9 AM Mon-Fri, 7-field)
"0 */5 * * * * *"         (every 5 minutes, 7-field)
"0 0 0 1 * * *"           (midnight on the 1st, 7-field)
"0 9 * * MON-FRI"         (9 AM Mon-Fri, 5-field — normalized by API)
"* * * * *"               (every minute, 5-field)
```

---

### 2.4 Instance Creation Flow (Cron)

When a cron schedule fires, the engine's scheduler loop:

1. Queries for enabled schedules with `next_fire_at <= now`.
2. Applies the `overlap_policy` by inspecting active instances linked to the schedule.
3. If policy allows firing:
   - Creates a `TaskInstance` referencing `sequence_id` (by UUID, not name).
   - Injects `metadata` from the schedule into the instance.
4. Recomputes `next_fire_at` via `calculate_next_fire` and updates the schedule row.

[INFERRED: the exact instance metadata shape for cron-created instances (e.g., whether `_trigger` or `_cron` keys are injected) is not confirmed in the read files — cron instance creation is handled by the engine's cron loop, not the API layer.]

---

### 2.5 Differences: Triggers vs. Cron Schedules

| Aspect | Triggers | Cron Schedules |
|---|---|---|
| Identifier | `slug` (string, URL-safe) | `id` (UUID v7) |
| Sequence reference | By name (`sequence_name`) + optional `version` | By UUID (`sequence_id`) |
| Fire mechanism | HTTP fire, NATS, file watch, AP poll | Calendar schedule (engine loop) |
| Update | No update endpoint (delete + recreate) | `PUT /cron/{id}` with patch semantics |
| Concurrency control | None (always fires) | `overlap_policy` field |
| Timezone | N/A | IANA timezone; DST-correct |
| Secret/auth | Optional `secret` checked via `X-Trigger-Secret` | N/A |
| Enabled toggle | Set at creation only (no update endpoint) | Togglable via `PUT` |

---

## 3. Open Issues

1. **Trigger update endpoint**: There is no `PUT /triggers/{slug}` or `PATCH /triggers/{slug}`. The `enabled` flag, `sequence_name`, `config`, and other fields cannot be changed without deleting and recreating the trigger. It is not confirmed whether this is intentional (immutable design) or a gap.

2. **Slug uniqueness scope**: The code uses slug as a primary key without tenant scoping in the storage calls (`storage.get_trigger(&slug)`, `storage.delete_trigger(&slug)`). It is not confirmed whether slugs are globally unique across all tenants or only per-tenant. The list endpoint filters by tenant, but the slug itself may be globally unique. Needs storage-layer confirmation.

3. **HTTP status for duplicate slug**: When `create_trigger` is called with an already-existing slug, the storage backend returns an error translated via `ApiError::from_storage`. The exact HTTP status code (likely `409 Conflict`) is not confirmed without reading the `ApiError::from_storage` implementation.

4. **Trigger `enabled` toggle**: No update endpoint exists for triggers. Once created with `enabled = true`, there is no documented way to disable a trigger without deleting it. Needs product clarification.

5. **Timezone validation**: `CreateCronRequest` and `UpdateCronRequest` accept any string for `timezone`. The engine falls back to UTC if the IANA string is invalid. The API does not return an error for invalid timezone strings. This may cause silent misconfiguration.

6. **Cron instance metadata shape**: The exact keys injected into the instance metadata by the cron loop (`_cron`, `_schedule_id`, etc.) are not visible in the read files. Only the HTTP-fire trigger metadata shape is confirmed (`_trigger`, `_trigger_type`, `_trigger_event`).

7. **`file_watch` config schema**: The `"file_watch"` trigger type requires a `"path"` string in `config` (confirmed at runtime in the engine, `triggers.rs:350`), but this is not validated at API creation time — no call to a `parse_config`-equivalent for file_watch triggers exists in `triggers.rs`. The exact additional config fields beyond `"path"` (e.g., recursive, debounce) are unknown without reading the full `run_file_watch_listener` implementation.

8. **`nats` trigger config schema**: The `config` fields required for NATS triggers (e.g., `subject`, `queue_group`) are not validated at the API layer and are not documented in the read files.

9. **Poll state `state` field structure**: `TriggerPollState.state` is typed as `serde_json::Value` / `unknown`. The actual structure of the cursor blob (which is an opaque ActivePieces store snapshot) is not specified in these files.

10. **Max `n` not enforced via 400**: `GET /cron/{id}/next-fires?n=` silently clamps values above 50 to 50 (`cron.rs:241`) rather than returning a `400`. UI should communicate this ceiling to users.
