## Usage, Telemetry & Model Pricing

This section covers all HTTP endpoints, database entities, and business rules for the Orch8 observability and billing surface: LLM token usage aggregation, mobile telemetry ingestion, dashboard queries, and the static model pricing table used for cost estimation.

All routes in this section are mounted under **both** `/api/v1/...` (canonical, preferred) and `/...` (legacy root, deprecated). Auth is via `X-API-Key` header plus optionally `X-Tenant-Id` for tenant scoping.

Sources: `orch8-api/src/usage.rs`, `orch8-api/src/telemetry.rs`, `orch8-api/src/model_pricing.rs`, `orch8-types/src/dedupe.rs`, `orch8-types/src/suggest.rs`, `engine/migrations/035_telemetry.sql`, `engine/migrations/041_usage_events.sql`, `engine/migrations/037_rollback_policies.sql`, `engine/migrations/040_rollback_policy_columns.sql`.

---

### Endpoint Summary

| Method | Canonical Path | Legacy Path | Handler | Tag |
|--------|---------------|-------------|---------|-----|
| GET | `/api/v1/usage` | `/usage` | `get_usage` | usage |
| POST | `/api/v1/telemetry/mobile` | `/telemetry/mobile` | `ingest_telemetry` | telemetry |
| POST | `/api/v1/telemetry/mobile/errors` | `/telemetry/mobile/errors` | `ingest_errors` | telemetry |
| GET | `/api/v1/telemetry/mobile/dashboard` | `/telemetry/mobile/dashboard` | `dashboard_queries` | telemetry |

There is no REST endpoint exposing the model pricing table directly — pricing is consumed internally by `get_usage`. See [Model Pricing Reference](#model-pricing-reference) for the full table and override mechanism.

---

### GET /usage

**Handler:** `get_usage` (`orch8-api/src/usage.rs:49`)
**Auth:** `X-API-Key` required. Header-scoped callers (those presenting `X-Tenant-Id`) are locked to their own tenant and cannot read another tenant's data. Unscoped/admin callers may specify an arbitrary tenant via the `?tenant=` query param.

#### Query Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `tenant` | `string` | Conditional | — | Tenant ID to report on. **Only honored when the caller presents no `X-Tenant-Id` header** (admin/unscoped key). Header-scoped callers: this parameter is silently ignored — the header tenant always takes precedence. At least one of `X-Tenant-Id` header or `?tenant=` must be resolvable; if neither is present the request fails with 400. |
| `start` | `string` (RFC 3339) | No | `end - 30 days` | Window start (inclusive). Parsed as `DateTime<Utc>`. If omitted, defaults to 30 days before `end`. |
| `end` | `string` (RFC 3339) | No | `now()` | Window end (inclusive). Parsed as `DateTime<Utc>`. If omitted, defaults to server UTC now at request time. |

Note: `start` and `end` are documented as `Option<String>` in the utoipa annotation (`orch8-api/src/usage.rs:41-43`) and parsed by the Rust `chrono` deserializer from the query string. The UI must send RFC 3339 / ISO 8601 strings with timezone offset (e.g. `2025-06-01T00:00:00Z`).

#### Response — 200 OK

Content-Type: `application/json`

```json
{
  "tenant": "acme",
  "start": "2025-05-18T00:00:00Z",
  "end": "2025-06-17T00:00:00Z",
  "usage": [
    {
      "kind": "llm_call",
      "model": "gpt-4o",
      "events": 42,
      "input_tokens": 100000,
      "output_tokens": 25000,
      "cost_usd": 0.5
    },
    {
      "kind": "agent",
      "model": "claude-sonnet-4",
      "events": 7,
      "input_tokens": 50000,
      "output_tokens": 12000,
      "cost_usd": 0.33
    },
    {
      "kind": "llm_call",
      "model": "totally-unknown-model",
      "events": 3,
      "input_tokens": 1000,
      "output_tokens": 200,
      "cost_usd": null
    }
  ],
  "total_cost_usd": 0.83,
  "cost_is_estimate": true
}
```

#### Response Schema

| Field | Type (TS) | Nullable | Description |
|-------|-----------|----------|-------------|
| `tenant` | `string` | No | The resolved tenant ID. |
| `start` | `string` (ISO 8601) | No | Effective window start used for the query. |
| `end` | `string` (ISO 8601) | No | Effective window end used for the query. |
| `usage` | `UsageAggregate[]` | No | One entry per `(kind, model)` pair observed in the window. |
| `usage[].kind` | `string` | No | Event kind (`"llm_call"`, `"agent"`, or any future kind emitted by the engine). |
| `usage[].model` | `string` | No | Model identifier as recorded in the usage event (e.g. `"gpt-4o"`, `"claude-sonnet-4-6"`). May be empty string if no model was specified. |
| `usage[].events` | `number` (i64) | No | Count of usage events in this aggregate group. |
| `usage[].input_tokens` | `number` (i64) | No | Total input (prompt) tokens summed across events. |
| `usage[].output_tokens` | `number` (i64) | No | Total output (completion) tokens summed across events. |
| `usage[].cost_usd` | `number \| null` | Yes | Estimated USD cost for this aggregate, or `null` if the model is not in the pricing table. Rounded to 6 decimal places. |
| `total_cost_usd` | `number` | No | Sum of all non-null `cost_usd` values across aggregates, rounded to 6 decimal places. Zero if no known models were found. |
| `cost_is_estimate` | `boolean` | No | Always `true`. Signals that costs are list-price estimates only (no caching/batch/tier discounts applied). |

#### Error Responses

| Status | Condition |
|--------|-----------|
| 400 | No tenant resolvable: no `X-Tenant-Id` header and no `?tenant=` query param supplied (error message: `"usage requires a tenant (X-Tenant-Id header or ?tenant=)"`). |

#### Business Rules

1. **Tenant isolation (BR-USG-1):** A caller presenting `X-Tenant-Id` is always scoped to that tenant — the `?tenant=` query param is silently ignored. Only callers without `X-Tenant-Id` (admin/root keys) may read an arbitrary tenant's usage via `?tenant=`. Evidence: `usage.rs:56-64`.
2. **Default window (BR-USG-2):** `start` defaults to `end - 30 days`, `end` defaults to server `now()`. The window is computed fresh per request, not cached. Evidence: `usage.rs:66-67`.
3. **Cost is always estimated (BR-USG-3):** The `cost_is_estimate` flag is hardcoded `true`. There is no mechanism to attach actual billed cost from provider invoices. Evidence: `usage.rs:105`.
4. **Unknown models produce null cost (BR-USG-4):** If a model identifier does not match any entry (or prefix) in the pricing table, `cost_usd` is `null` for that aggregate and the aggregate is excluded from `total_cost_usd`. Evidence: `usage.rs:82-86`, `model_pricing.rs:170`.
5. **Rounding (BR-USG-5):** Both per-aggregate `cost_usd` and `total_cost_usd` are rounded to 6 decimal places (`round6` at `usage.rs:20-22`). This is applied after the cost formula but before JSON serialization.
6. **Aggregation unit (BR-USG-6):** The storage layer (`query_usage`) groups records by `(kind, model)` within the tenant/time window — not by instance, block, or day. The UI receives one row per distinct `(kind, model)` pair.

---

### POST /telemetry/mobile

**Handler:** `ingest_telemetry` (`orch8-api/src/telemetry.rs:64`)
**Auth:** `X-API-Key` required. `X-Tenant-Id` optional. If no header tenant and no `tenant_id` in body, tenant defaults to `"default"`. Evidence: `telemetry.rs:75-76`.

#### Request Body Schema

Content-Type: `application/json`

```json
{
  "tenant_id": "acme",
  "events": [
    {
      "event_type": "screen_view",
      "payload": "{\"screen\": \"home\"}",
      "timestamp": "2025-06-17T10:30:00Z",
      "device": {
        "device_id": "device-abc123",
        "os_name": "iOS",
        "os_version": "18.0",
        "app_version": "2.4.1",
        "sdk_version": "1.0.0"
      }
    }
  ]
}
```

**Top-level fields (IngestTelemetryRequest):**

| Field | Type (TS) | Required | Description |
|-------|-----------|----------|-------------|
| `events` | `TelemetryBatchItem[]` | Yes | Array of telemetry events. Must not be empty (enforced by MAX_BATCH_SIZE guard). Maximum 500 items per request. |
| `tenant_id` | `string \| null` | No | Tenant override. Honored only when the caller has no `X-Tenant-Id` header; a header-scoped caller has their tenant overridden by the header. Falls back to `"default"` if neither is present. |

**TelemetryBatchItem fields:**

| Field | Type (TS) | Required | Description |
|-------|-----------|----------|-------------|
| `event_type` | `string` | Yes | Arbitrary event type label (e.g. `"screen_view"`, `"tap"`, `"sync_completed"`). No enum constraint enforced at API layer. |
| `payload` | `string` | Yes | Event payload. Accepted as a raw string; stored as JSONB. Callers should JSON-serialize their payload before including it here. |
| `timestamp` | `string` | Yes | Event timestamp as a string. Parsed as `DateTime<Utc>`; if unparseable, falls back to server `now()`. Should be RFC 3339 / ISO 8601. |
| `device` | `DeviceContext` | Yes | Device metadata attached to this event. |

**DeviceContext fields:**

| Field | Type (TS) | Required | Description |
|-------|-----------|----------|-------------|
| `device_id` | `string` | Yes | Unique device identifier. |
| `os_name` | `string` | Yes | Operating system name (e.g. `"iOS"`, `"Android"`). |
| `os_version` | `string` | Yes | Operating system version string. |
| `app_version` | `string` | Yes | Host application version. |
| `sdk_version` | `string` | Yes | Orch8 mobile SDK version. |

#### Response — 202 Accepted

```json
{ "accepted": 42 }
```

| Field | Type (TS) | Description |
|-------|-----------|-------------|
| `accepted` | `number` | Count of events successfully written to storage. May be less than the number sent if individual rows fail. |

#### Error Responses

| Status | Condition |
|--------|-----------|
| 413 | Batch size exceeds 500 items (`PayloadTooLarge`). Error message: `"batch size N exceeds maximum of 500"`. |
| 500 | Database write failure. |

#### Business Rules

7. **Batch size cap (BR-TEL-1):** The endpoint rejects requests where `events.length > 500` with a 413 before any DB writes. Constant `MAX_BATCH_SIZE = 500` at `telemetry.rs:15`. The UI must split large batches client-side.
8. **Fallback timestamp (BR-TEL-2):** If a `timestamp` string cannot be parsed as `DateTime<Utc>`, the storage event is timestamped with server `now()`. This is silent — no error is returned for bad timestamps. Evidence: `telemetry.rs:90`.
9. **Tenant resolution for telemetry (BR-TEL-3):** Header `X-Tenant-Id` takes precedence; then body `tenant_id`; then `"default"`. Unlike usage, there is no error when neither is present — the "default" tenant absorbs unidentified traffic. Evidence: `telemetry.rs:75-76`.

---

### POST /telemetry/mobile/errors

**Handler:** `ingest_errors` (`orch8-api/src/telemetry.rs:111`)
**Auth:** `X-API-Key` required. `X-Tenant-Id` optional. Same tenant resolution as `ingest_telemetry`.

#### Request Body Schema

Content-Type: `application/json`

```json
{
  "error_type": "NullPointerException",
  "message": "Attempted to read property of null",
  "stack_trace": "at com.example.Foo.bar(Foo.java:42)\n  at ...",
  "tenant_id": "acme",
  "instance_id": "3f7a1b2c-...",
  "sequence_name": "onboarding-flow",
  "device": {
    "device_id": "device-abc123",
    "os_name": "Android",
    "os_version": "14",
    "app_version": "2.4.1",
    "sdk_version": "1.0.0"
  }
}
```

**IngestErrorRequest fields:**

| Field | Type (TS) | Required | Description |
|-------|-----------|----------|-------------|
| `error_type` | `string` | Yes | Error classifier (e.g. exception class name, error code). |
| `message` | `string` | Yes | Human-readable error message. |
| `stack_trace` | `string \| null` | No | Full stack trace string. Stored verbatim. |
| `device` | `DeviceContext` | Yes | Same `DeviceContext` structure as batch events (see above). |
| `tenant_id` | `string \| null` | No | Tenant override. Same resolution rules as `ingest_telemetry`. |
| `instance_id` | `string \| null` | No | Workflow instance ID (`UUID` as string) to correlate this error to a running instance. |
| `sequence_name` | `string \| null` | No | Sequence (workflow definition) name to correlate with. **When present, triggers an auto-rollback policy check after the error is stored.** |

#### Response — 202 Accepted

No body. HTTP status 202 only.

#### Error Responses

| Status | Condition |
|--------|-----------|
| 500 | Database write failure. |

#### Business Rules

10. **Auto-rollback side-effect (BR-TEL-4):** When `sequence_name` is non-null, `ingest_errors` asynchronously calls `check_rollback(state, tenant, sequence_name)` after writing the error record. This may deprecate and unpublish the named sequence if its error rate exceeds the configured policy threshold. Rollback failures are logged as warnings but do not cause the HTTP request to fail. Evidence: `telemetry.rs:139-143`.
11. **Rollback hysteresis — cooldown (BR-TEL-5):** Auto-rollback is skipped if a rollback event for the same `(tenant, sequence_name)` was recorded within `cooldown_secs` of the current time. Default `cooldown_secs = 3600` (1 hour). Evidence: `telemetry.rs:186-206`, `040_rollback_policy_columns.sql:3`.
12. **Rollback hysteresis — confirmation window (BR-TEL-6):** When `confirmation_window_secs > 0` and is shorter than `time_window_secs`, both the primary error rate (over `time_window_secs`) AND the shorter confirmation window rate must each independently exceed `error_rate_threshold`. If the confirmation window rate is below the threshold, rollback is suppressed. This prevents brief spikes from triggering rollback prematurely. Evidence: `telemetry.rs:222-246`.
13. **Rollback triggers sequence deprecation and manifest update (BR-TEL-7):** A triggered rollback: (1) records a row in `rollback_history`, (2) calls `deprecate_sequence` on the matched sequence, (3) calls `update_sequence_status(id, "unpublished")`, (4) attempts manifest regeneration via `publisher.publish_manifest` with the sequence in the `removed` list, (5) fires a webhook POST to `policy.webhook_url` if configured (best-effort, non-blocking `tokio::spawn`). Evidence: `telemetry.rs:249-333`.
14. **Rollback webhook payload (BR-TEL-8):** The webhook POST body is:
    ```json
    {
      "event": "rollback_triggered",
      "tenant_id": "<tenant>",
      "sequence_name": "<name>",
      "error_rate": 0.12,
      "threshold": 0.05,
      "timestamp": "<RFC 3339>"
    }
    ```
    Webhook has a 10-second timeout and a pool of max 2 idle connections per host. Evidence: `telemetry.rs:307-333`.

---

### GET /telemetry/mobile/dashboard

**Handler:** `dashboard_queries` (`orch8-api/src/telemetry.rs:369`)
**Auth:** `X-API-Key` required. `X-Tenant-Id` optional. Same tenant resolution: header > query param `tenant_id` > `"default"`.

#### Query Parameters

| Name | Type | Required | Default | Constraints |
|------|------|----------|---------|-------------|
| `query_type` | `string` (enum) | Yes | — | Must be one of: `sync_completed_versions`, `error_rate_per_sequence`, `top_failing_steps`, `device_os_breakdown`. Case-sensitive (snake_case). |
| `tenant_id` | `string` | No | `"default"` (or header) | Tenant to query. See tenant resolution rules. |
| `start_time` | `string` (RFC 3339) | No | `now - 7 days` | Window start for aggregation. |
| `end_time` | `string` (RFC 3339) | No | `now()` | Window end for aggregation. |

**`query_type` enum values:**

| Value | Description |
|-------|-------------|
| `sync_completed_versions` | Distribution of completed sync versions across devices. |
| `error_rate_per_sequence` | Per-sequence error rate (dimension = sequence name). |
| `top_failing_steps` | Top failing step labels by count. |
| `device_os_breakdown` | Device OS name/version distribution. |

#### Response — 200 OK

```json
{
  "rows": [
    { "dimension": "iOS 18.0", "count": 1200, "percentage": 60.0 },
    { "dimension": "Android 14", "count": 600, "percentage": 30.0 },
    { "dimension": "iOS 17.6", "count": 200, "percentage": 10.0 }
  ]
}
```

**DashboardResponse fields:**

| Field | Type (TS) | Description |
|-------|-----------|-------------|
| `rows` | `DashboardRow[]` | Ordered list of dimension/count pairs. |

**DashboardRow fields:**

| Field | Type (TS) | Description |
|-------|-----------|-------------|
| `dimension` | `string` | The label for this group (e.g. OS name, sequence name, step label, version string). |
| `count` | `number` (i64) | Raw event/record count for this dimension. |
| `percentage` | `number` (f64) | This dimension's share of the total count, expressed as 0–100. Zero when total is 0. |

#### Error Responses

| Status | Condition |
|--------|-----------|
| 500 | Database query failure. |
| 400 | Invalid `query_type` value (deserialization error from Axum). |

#### Business Rules

15. **Default dashboard window (BR-TEL-9):** When `start_time`/`end_time` are omitted the window is `[now - 7 days, now]` (shorter than the usage 30-day default). Evidence: `telemetry.rs:378-379`.
16. **Percentage calculation (BR-TEL-10):** `percentage = (count / total) * 100.0` where `total` is the sum of all row counts from the storage query. When `total == 0`, percentage is `0.0` for all rows. There is no rounding applied — f64 raw. Evidence: `telemetry.rs:394-407`.
17. **Storage query delegation (BR-TEL-11):** The dashboard handler forwards `query_type` as a snake_case string to `storage.query_telemetry_dashboard`. The storage layer executes the corresponding SQL aggregation. The API layer imposes no additional filtering or transformation beyond tenant/time scoping and percentage math. Evidence: `telemetry.rs:382-392`.

---

### Model Pricing Reference

The model pricing table is a **process-scoped static table** initialized once at startup. It is used exclusively by `GET /usage` to estimate `cost_usd`. There is no HTTP endpoint to read or modify the table at runtime.

Source: `orch8-api/src/model_pricing.rs`.

#### Lookup Algorithm

1. **Normalize** the model name: trim whitespace, lowercase, strip a provider path prefix (`anthropic/claude-sonnet-4` → `claude-sonnet-4`). Evidence: `model_pricing.rs:133-139`.
2. **Longest-prefix match** among table keys: a table key matches if the normalized model name starts with that key AND the remainder is either empty or starts with a non-alphanumeric separator character. This ensures `gpt-4o-mini` does not fall back to `gpt-4o`, while `gpt-4o-2024-08-06` does fall back to `gpt-4o`. Evidence: `model_pricing.rs:147-159`.
3. Among all matching keys, the **longest** key wins.
4. If no key matches, returns `null` / `None` — the model is "unknown".

#### Cost Formula

```
cost_usd = (input_tokens / 1_000_000) * input_per_1m
         + (output_tokens / 1_000_000) * output_per_1m
```

Result is **not** rounded inside the pricing module — rounding to 6dp is applied in `usage.rs:round6` before JSON serialization.

#### Runtime Pricing Overrides

Set the `ORCH8_MODEL_PRICING` environment variable to a JSON object to override or extend the default table:

```json
{
  "gpt-4o": {"input_per_1m": 1.0, "output_per_1m": 2.0},
  "my-custom-llm": {"input_per_1m": 0.5, "output_per_1m": 1.0}
}
```

- Keys are normalized to lowercase on merge.
- Override entries **replace** matching defaults; non-overridden defaults survive unchanged.
- Invalid JSON in `ORCH8_MODEL_PRICING` logs a warning and leaves the defaults intact.
- The table is read exactly **once** at process start via `OnceLock` — changes to the env var after startup have no effect.

Evidence: `model_pricing.rs:91-128`.

#### ModelPrice Schema (TS-friendly)

```typescript
interface ModelPrice {
  input_per_1m: number;   // USD per 1M input tokens
  output_per_1m: number;  // USD per 1M output tokens
}
```

#### Default Pricing Table

All prices are USD per 1M tokens, list prices as of mid-2025. This table is the authoritative in-code default (`model_pricing.rs:27-81`).

**OpenAI**

| Model Prefix | Input $/1M | Output $/1M |
|-------------|-----------|------------|
| `gpt-4o` | 2.50 | 10.00 |
| `gpt-4o-mini` | 0.15 | 0.60 |
| `gpt-4.1` | 2.00 | 8.00 |
| `gpt-4.1-mini` | 0.40 | 1.60 |
| `gpt-4.1-nano` | 0.10 | 0.40 |
| `gpt-4-turbo` | 10.00 | 30.00 |
| `gpt-3.5-turbo` | 0.50 | 1.50 |
| `o1` | 15.00 | 60.00 |
| `o3` | 2.00 | 8.00 |
| `o3-mini` | 1.10 | 4.40 |
| `o4-mini` | 1.10 | 4.40 |

**Anthropic**

| Model Prefix | Input $/1M | Output $/1M |
|-------------|-----------|------------|
| `claude-opus-4` | 15.00 | 75.00 |
| `claude-sonnet-4` | 3.00 | 15.00 |
| `claude-haiku` | 1.00 | 5.00 |
| `claude-haiku-4-5` | 1.00 | 5.00 |
| `claude-3-5-sonnet` | 3.00 | 15.00 |
| `claude-3-5-haiku` | 0.80 | 4.00 |
| `claude-3-7-sonnet` | 3.00 | 15.00 |
| `claude-3-opus` | 15.00 | 75.00 |

**Google**

| Model Prefix | Input $/1M | Output $/1M |
|-------------|-----------|------------|
| `gemini-2.5-pro` | 1.25 | 10.00 |
| `gemini-2.5-flash` | 0.30 | 2.50 |
| `gemini-2.0-flash` | 0.10 | 0.40 |
| `gemini-1.5-pro` | 1.25 | 5.00 |
| `gemini-1.5-flash` | 0.075 | 0.30 |

**DeepSeek**

| Model Prefix | Input $/1M | Output $/1M |
|-------------|-----------|------------|
| `deepseek-chat` | 0.27 | 1.10 |
| `deepseek-reasoner` | 0.55 | 2.19 |

**Mistral**

| Model Prefix | Input $/1M | Output $/1M |
|-------------|-----------|------------|
| `mistral-large` | 2.00 | 6.00 |
| `mistral-medium` | 0.40 | 2.00 |
| `mistral-small` | 0.10 | 0.30 |

**Meta**

| Model Prefix | Input $/1M | Output $/1M |
|-------------|-----------|------------|
| `llama-3.3-70b` | 0.59 | 0.79 |
| `llama-3.1-70b` | 0.59 | 0.79 |
| `llama-3.1-8b` | 0.05 | 0.08 |
| `llama-3.1-405b` | 3.50 | 3.50 |

**xAI**

| Model Prefix | Input $/1M | Output $/1M |
|-------------|-----------|------------|
| `grok-3` | 3.00 | 15.00 |
| `grok-3-mini` | 0.30 | 0.50 |
| `grok-2` | 2.00 | 10.00 |

**Alibaba**

| Model Prefix | Input $/1M | Output $/1M |
|-------------|-----------|------------|
| `qwen-max` | 1.60 | 6.40 |
| `qwen-plus` | 0.40 | 1.20 |
| `qwen-turbo` | 0.05 | 0.20 |

**Cohere**

| Model Prefix | Input $/1M | Output $/1M |
|-------------|-----------|------------|
| `command-r` | 0.15 | 0.60 |
| `command-r-plus` | 2.50 | 10.00 |

**Amazon**

| Model Prefix | Input $/1M | Output $/1M |
|-------------|-----------|------------|
| `nova-pro` | 0.80 | 3.20 |
| `nova-lite` | 0.06 | 0.24 |

**Longest-prefix match edge cases (from unit tests):**

- `gpt-4o-mini-2024-07-18` → `gpt-4o-mini` (not `gpt-4o`)
- `gpt-4o-2024-08-06` → `gpt-4o`
- `claude-sonnet-4-6` → `claude-sonnet-4`
- `claude-haiku-4-5` → `claude-haiku-4-5` (has its own longer entry)
- `anthropic/claude-sonnet-4` → `claude-sonnet-4` (provider prefix stripped)
- `GPT-4o` → `gpt-4o` (case-insensitive)
- `gpt-4o2` → no match (alphanumeric continuation blocks match)

---

### Database Entities

#### `usage_events` (migration 041)

Stores per-LLM-call token usage records emitted by the engine's `llm_call` and `agent` step handlers.

| Column | SQL Type | Nullable | Default | Notes |
|--------|----------|----------|---------|-------|
| `id` | `BIGSERIAL` | No | auto | PK |
| `tenant_id` | `TEXT` | No | — | Tenant that owns this event. NOT NULL enforced. |
| `instance_id` | `UUID` | Yes | NULL | Workflow instance that generated the call. Optional. |
| `block_id` | `TEXT` | Yes | NULL | Block/step identifier within the instance. Optional. |
| `kind` | `TEXT` | No | — | Event kind label (e.g. `llm_call`, `agent`). NOT NULL. |
| `model` | `TEXT` | No | `''` | LLM model identifier. Empty string if not specified. |
| `input_tokens` | `BIGINT` | No | `0` | Input token count for this call. |
| `output_tokens` | `BIGINT` | No | `0` | Output token count for this call. |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Server-side creation timestamp. |

**Indexes:**
- `idx_usage_tenant_created` on `(tenant_id, created_at)` — primary query pattern for windowed aggregation.
- `idx_usage_kind_model` on `(kind, model)` — supports grouping by kind/model.

**TS-friendly type mapping:**

```typescript
interface UsageEvent {
  id: number;           // BIGSERIAL → number (safe up to 2^53)
  tenant_id: string;
  instance_id: string | null;  // UUID → string
  block_id: string | null;
  kind: string;
  model: string;
  input_tokens: number;   // BIGINT → number
  output_tokens: number;
  created_at: string;     // TIMESTAMPTZ → ISO 8601 string
}
```

#### `telemetry_mobile_events` (migration 035)

Stores individual telemetry events ingested from mobile SDKs.

| Column | SQL Type | Nullable | Default | Notes |
|--------|----------|----------|---------|-------|
| `id` | `BIGSERIAL` | No | auto | PK |
| `event_type` | `TEXT` | No | — | Event type label. |
| `payload` | `JSONB` | No | `'{}'` | Event payload. Stored as JSONB; input arrives as a string from the API. |
| `device_id` | `TEXT` | Yes | NULL | Device identifier. |
| `os_name` | `TEXT` | Yes | NULL | OS name. |
| `os_version` | `TEXT` | Yes | NULL | OS version string. |
| `app_version` | `TEXT` | Yes | NULL | Application version. |
| `sdk_version` | `TEXT` | Yes | NULL | SDK version. |
| `tenant_id` | `TEXT` | Yes | NULL | Tenant ID. Note: column is nullable despite the API always writing a value. |
| `received_at` | `TIMESTAMPTZ` | No | `NOW()` | Server-side arrival timestamp. |
| `created_at` | `TIMESTAMPTZ` | No | — | Client-reported event timestamp (no default — must be supplied by the storage layer). |

**Indexes:**
- `idx_telemetry_events_type` on `(event_type)`
- `idx_telemetry_events_device` on `(device_id)`
- `idx_telemetry_events_tenant` on `(tenant_id)`
- `idx_telemetry_events_received` on `(received_at)`

#### `telemetry_mobile_errors` (migration 035)

Stores structured error reports from mobile SDKs.

| Column | SQL Type | Nullable | Default | Notes |
|--------|----------|----------|---------|-------|
| `id` | `BIGSERIAL` | No | auto | PK |
| `error_type` | `TEXT` | No | — | Error classifier. |
| `message` | `TEXT` | No | — | Error message text. |
| `stack_trace` | `TEXT` | Yes | NULL | Full stack trace string. |
| `device_id` | `TEXT` | Yes | NULL | Device identifier. |
| `os_name` | `TEXT` | Yes | NULL | OS name. |
| `os_version` | `TEXT` | Yes | NULL | OS version string. |
| `app_version` | `TEXT` | Yes | NULL | Application version. |
| `sdk_version` | `TEXT` | Yes | NULL | SDK version. |
| `tenant_id` | `TEXT` | Yes | NULL | Tenant ID. |
| `instance_id` | `TEXT` | Yes | NULL | Correlated workflow instance UUID as text. |
| `sequence_name` | `TEXT` | Yes | NULL | Correlated sequence name. When non-null, triggers auto-rollback check. |
| `received_at` | `TIMESTAMPTZ` | No | `NOW()` | Server-side arrival timestamp. |

**Indexes:**
- `idx_telemetry_errors_device` on `(device_id)`
- `idx_telemetry_errors_tenant` on `(tenant_id)`
- `idx_telemetry_errors_received` on `(received_at)`

#### `rollback_policies` (migration 037 + 040)

Auto-rollback configuration per `(tenant_id, sequence_name)`.

| Column | SQL Type | Nullable | Default | Notes |
|--------|----------|----------|---------|-------|
| `id` | `BIGSERIAL` | No | auto | PK |
| `tenant_id` | `TEXT` | No | — | Tenant. |
| `sequence_name` | `TEXT` | No | — | Sequence the policy applies to. |
| `error_rate_threshold` | `REAL` | No | `0.05` | Fraction (0–1) above which rollback is triggered. |
| `time_window_secs` | `INTEGER` | No | `300` | Primary error-rate calculation window in seconds. |
| `enabled` | `INTEGER` | No | `1` | Treated as boolean: 1 = enabled, 0 = disabled. |
| `cooldown_secs` | `INTEGER` | No | `3600` | Minimum seconds between consecutive rollbacks. Added in migration 040. |
| `confirmation_window_secs` | `INTEGER` | No | `60` | Shorter window for hysteresis confirmation. 0 = disabled. Added in migration 040. |
| `webhook_url` | `TEXT` | Yes | NULL | Optional URL to POST rollback webhook. Added in migration 040. |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | Last update timestamp. |

**Constraints:**
- `UNIQUE(tenant_id, sequence_name)` — at most one policy per sequence per tenant.

**Indexes:**
- `idx_rollback_policies_tenant` on `(tenant_id)`
- `idx_rollback_policies_enabled` on `(enabled)`

#### `rollback_history` (migration 037)

Immutable log of auto-rollback events.

| Column | SQL Type | Nullable | Default | Notes |
|--------|----------|----------|---------|-------|
| `id` | `BIGSERIAL` | No | auto | PK |
| `tenant_id` | `TEXT` | No | — | Tenant. |
| `sequence_name` | `TEXT` | No | — | Sequence that was rolled back. |
| `triggered_at` | `TIMESTAMPTZ` | No | `NOW()` | When the rollback was triggered. |
| `error_rate` | `REAL` | No | — | Observed error rate at rollback time. |
| `threshold` | `REAL` | No | — | Policy threshold that was breached. |
| `previous_manifest_version` | `TEXT` | Yes | NULL | Manifest version before rollback (for audit). |
| `reason` | `TEXT` | No | `'threshold_breach'` | Rollback trigger reason. |
| `alert_sent` | `INTEGER` | No | `0` | Boolean: 1 if a webhook alert was delivered. |

**Indexes:**
- `idx_rollback_history_tenant` on `(tenant_id, sequence_name)`
- `idx_rollback_history_triggered` on `(triggered_at)`

---

### Supplementary Types

#### `DedupeScope` (`orch8-types/src/dedupe.rs`)

Used by the `emit_event` step handler (not directly by the observability endpoints, but stored in the dedupe table and relevant to understanding tenant isolation semantics).

| Variant | `scope_kind` (DB) | `scope_value` (DB) | Description |
|---------|-------------------|-------------------|-------------|
| `Parent(InstanceId)` | `"parent"` | UUID string of parent instance | Per-parent-instance dedupe. A retry of the same parent with the same key is idempotent; different parents are independent. **Default behavior.** |
| `Tenant(TenantId)` | `"tenant"` | Tenant ID string | Per-tenant dedupe. Any caller in the same tenant sharing the same key gets the same child instance. Enables at-most-once fan-out patterns. |

The two scopes are independent namespaces in the dedupe table (different `scope_kind` values); a `Parent` row and a `Tenant` row can share the same `scope_value` string without collision. Cross-tenant dedupe is intentionally not supported. Evidence: `dedupe.rs:1-21`.

#### `did_you_mean` utility (`orch8-types/src/suggest.rs`)

Helper used by various handlers to produce typo-correction suggestions in error messages. Not directly surfaced in API responses from the observability endpoints.

- Computes normalized Levenshtein distance between the input string and a list of candidates.
- Returns the closest candidate if distance is within 40% of the longer string length.
- Input is lowercased before comparison; case is preserved in the returned candidate.
- Returns `None` if no candidate is within threshold, or if the candidates list is empty.

This is used to power `"did you mean X?"` style error messages in the API.

---

### Open Issues

1. The `GET /usage` aggregation query shape (grouping by `(kind, model)`) is implemented in the storage backend (`query_usage`), which is not in scope for this assignment. The exact SQL and any secondary grouping dimensions (e.g. by day, by instance) are not determinable from the assigned files alone.
2. The `telemetry_mobile_events.payload` column is `JSONB` but the API layer accepts it as a raw `string` and passes it directly to storage. It is unclear whether the storage layer parses/validates the string as JSON before writing, or if invalid JSON can be stored. [INFERRED: invalid JSON would be rejected at the PostgreSQL level when storing to JSONB.]
3. There is no authentication/authorization documented for the telemetry endpoints beyond `X-API-Key`. Whether unauthenticated (no API key) mobile SDK calls are allowed is not determinable from the assigned files.
4. The `GET /telemetry/mobile/dashboard` endpoint accepts query parameters including `query_type`, but the deserialization is via Axum's `Query` extractor using serde. It is not documented in a `#[utoipa::path]` macro in the assigned file, so the endpoint does not appear in the generated OpenAPI spec. The UI team should be aware this endpoint may be absent from the Swagger UI.
5. `POST /telemetry/mobile` also lacks a `#[utoipa::path]` annotation in the assigned file, so it likewise may not appear in the generated OpenAPI spec.
6. `POST /telemetry/mobile/errors` similarly lacks a `#[utoipa::path]` annotation.
7. The `rollback_history.alert_sent` column is declared in the schema but is not written by the rollback code in the assigned `telemetry.rs` — the webhook is fired via `tokio::spawn` with no feedback path to update this flag. Whether `alert_sent` is updated elsewhere is not determinable from the assigned files.
8. The `rollback_policies.enabled` column uses `INTEGER` (0/1) rather than `BOOLEAN`. Client code interacting with this column directly must coerce accordingly.
9. The `telemetry_mobile_events.created_at` column has no DEFAULT in the DDL but is NOT NULL — the storage layer must supply this value. If the storage insert omits it, the DB insert will fail. The fallback `Utc::now()` on parse failure (`telemetry.rs:90`) is passed to the storage struct; whether it reaches `created_at` depends on the storage implementation, which is out of scope.
10. No HTTP endpoint exists for reading the model pricing table. If the UI needs to display the pricing table (e.g. for a model cost reference screen), it must either hard-code the defaults or receive the table via a future endpoint.
