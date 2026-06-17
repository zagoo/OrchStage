## Auth, RBAC, Errors & Global Conventions

This document is the canonical reference for every cross-cutting concern the Vue 3 UI must implement: authentication, tenant scoping, role/permission model, error handling, input validation, pagination, request tracing, and API-key management endpoints. All facts are sourced directly from the Rust source unless marked **[INFERRED]**.

---

### Table of contents

1. [Authentication](#1-authentication)
2. [Tenant scoping](#2-tenant-scoping)
3. [RBAC model](#3-rbac-model)
4. [Error envelope](#4-error-envelope)
5. [input\_schema validation](#5-input_schema-validation)
6. [Pagination, filtering & sorting](#6-pagination-filtering--sorting)
7. [Request-ID & idempotency headers](#7-request-id--idempotency-headers)
8. [API-key management endpoints](#8-api-key-management-endpoints)
9. [Type mapping: Rust → TypeScript](#9-type-mapping-rust--typescript)
10. [Business-rules table](#10-business-rules-table)
11. [Open issues](#11-open-issues)

---

### 1. Authentication

#### 1.1 Header

All authenticated requests must carry:

```
X-API-Key: <secret>
```

Header name is case-insensitive in HTTP/1.1 but the server reads it as the lowercase literal `x-api-key` (Axum / hyper normalise to lowercase).
Source: `orch8-api/src/auth.rs:113–119`

#### 1.2 Key types

Two mutually distinct key types exist; they behave differently and grant different permissions.

| Property | Root / Admin key | Per-tenant key |
|---|---|---|
| Storage | Config file (`api.api_key`) — never in DB | SHA-256 hash only stored in DB |
| Identity | Unscoped (no built-in tenant) | Bound to exactly one `tenant_id` at mint time |
| Tenant resolution | From `X-Tenant-Id` header (or body) | Always from the key record; header must match or be absent |
| `AdminContext` marker | Yes — set on every request | No |
| May manage other keys | Yes (mint, list, revoke) | **No** — returns `403 Forbidden` |
| Insecure mode bypass | All requests get `AdminContext` without any key | — |

Source: `orch8-api/src/auth.rs:82–156`, `orch8-types/src/api_key.rs:1–15`

#### 1.3 Insecure mode (`--insecure`)

When the server starts without `api.api_key` configured (the config value is empty), `root_key_digest` is `None`. The `api_key_middleware` short-circuits authentication and injects `AdminContext` on every request — every caller is treated as the root/admin user with no tenant restriction.

The server logs a loud warning at startup when insecure mode is active.

Source: `orch8-api/src/auth.rs:105–110`

#### 1.4 Authentication flow

```
Request arrives
    │
    ▼
x-api-key header present?
    │ No ──► 401 Unauthorized (StatusCode::UNAUTHORIZED, no body)
    │ Yes
    ▼
Matches root key digest (SHA-256 constant-time compare)?
    │ Yes ──► inject AdminContext; proceed
    │ No
    ▼
Lookup per-tenant key by SHA-256 hash in DB (cached)
    │ Not found or revoked or expired ──► 401 Unauthorized
    │ Found and active
    ▼
X-Tenant-Id header present and non-empty?
    │ Yes, but does NOT match key's tenant_id ──► 403 Forbidden (StatusCode::FORBIDDEN)
    │ Yes and matches, or absent ──► inject TenantContext from key record; proceed
```

Source: `orch8-api/src/auth.rs:105–157`

#### 1.5 Secret format

- Root key: arbitrary string; compared via SHA-256 pre-digest
- Per-tenant key: generated as `sk_{uuid_v4_simple}{uuid_v4_simple}` — 244 bits of entropy, recognisable by `sk_` prefix
- Key record public ID: `ak_{uuid_v4_simple}` — used for listing and revocation, never a secret

Source: `orch8-types/src/api_key.rs:77–103`

#### 1.6 Key active status

A key is active if **both** conditions hold:
- `revoked == false`
- `expires_at` is `None` OR `expires_at > now`

Source: `orch8-types/src/api_key.rs:54–61`

---

### 2. Tenant scoping

#### 2.1 Header

```
X-Tenant-Id: <tenant_id>
```

#### 2.2 Tenant middleware behaviour

After authentication the `tenant_middleware` runs. It is a no-op when the request was already authenticated with a per-tenant key (the key already injected `TenantContext`). For root-key callers it operates as follows:

| `require_tenant` config | Header present and non-empty | Result |
|---|---|---|
| `true` (default) | Yes | Inject `TenantContext`; proceed |
| `true` (default) | No, or empty | `400 Bad Request` (no body, raw status code) |
| `false` | Yes | Inject `TenantContext`; proceed |
| `false` | No | No `TenantContext` injected; proceed without scoping |

Source: `orch8-api/src/auth.rs:164–198`

#### 2.3 `ORCH8_REQUIRE_TENANT_HEADER` / `api.require_tenant_header`

Configuration key: `api.require_tenant_header` (TOML) or environment variable `ORCH8_REQUIRE_TENANT_HEADER`.

- Default: `true` (secure by default — tenant isolation enforced)
- When `false`: single-tenant deployments may omit the header; cross-tenant reads by root-key callers are **not** blocked at the middleware level

Source: `orch8-types/src/config.rs:508–514`, `543–544`

#### 2.4 Tenant enforcement in handlers

Three helpers are used by every handler:

| Helper | When used | Behaviour on mismatch |
|---|---|---|
| `enforce_tenant_create` | Create (POST) | Body `tenant_id` must equal header tenant; returns `403 Forbidden` |
| `enforce_tenant_access` | Get / Update / Delete | Resource `tenant_id` must equal header tenant; returns **404** (not 403) to avoid leaking existence |
| `scoped_tenant_id` | List (GET with filter) | Header overrides query-param tenant; result scoped to header tenant |

**Security note:** cross-tenant reads return 404, not 403, to prevent an attacker from inferring the existence of resources in other tenants.

Source: `orch8-api/src/auth.rs:34–79`

---

### 3. RBAC model

#### 3.1 What the code actually enforces

The codebase defines **two runtime auth contexts** — there is no named role enum in the Rust source. Roles named below (Platform Admin, Workflow Developer, etc.) are **[INFERRED]** conceptual roles; the enforcement at the HTTP layer is binary:

| Context | How obtained | Capabilities |
|---|---|---|
| `AdminContext` | Root key (or insecure mode) | All endpoints including key management |
| `TenantContext` | Per-tenant key or root key + `X-Tenant-Id` | All resource endpoints scoped to the bound tenant; **cannot** manage API keys |
| No context | No auth header / invalid key | `401 Unauthorized` on any non-public endpoint |

#### 3.2 Capability matrix

| Endpoint class | Root key (no tenant header) | Root key + `X-Tenant-Id` | Per-tenant key |
|---|---|---|---|
| `POST /api-keys` (create key) | Allowed | Allowed | **Forbidden (403)** |
| `GET /api-keys?tenant_id=` (list keys) | Allowed | Allowed | **Forbidden (403)** |
| `DELETE /api-keys/{id}` (revoke key) | Allowed | Allowed | **Forbidden (403)** |
| Sequence CRUD | Allowed (cross-tenant) | Scoped to tenant | Scoped to bound tenant |
| Instance CRUD | Allowed (cross-tenant) | Scoped to tenant | Scoped to bound tenant |
| Worker / queue endpoints | Allowed (cross-tenant) | Scoped to tenant | Scoped to bound tenant |
| Observability / audit | Allowed (cross-tenant) | Scoped to tenant | Scoped to bound tenant |

Source: `orch8-api/src/api_keys.rs:32–42`, `orch8-api/src/auth.rs:34–79`

#### 3.3 Conceptual role mapping **[INFERRED]**

The following table maps logical operator-UI roles to the two enforced auth contexts. The actual role names and fine-grained permissions within a tenant are not implemented in the current Rust source — they would need to be layered above the existing two-context model.

| Conceptual role | Suggested key type | Notes |
|---|---|---|
| Platform Admin | Root key | Full access; manages per-tenant keys |
| Tenant Admin | Per-tenant key or root + tenant header | Full access within one tenant; cannot manage keys |
| Workflow Developer | Per-tenant key | Read/write sequences and instances for their tenant |
| External Worker | Per-tenant key | Claim and complete tasks; no admin ops |
| Human Reviewer | Per-tenant key | Read instances; submit human-task completions |
| Auditor | Per-tenant key | Read-only; no writes |

**Important:** As of the analysed source, scopes within a per-tenant key (read-only vs read-write vs task-claim-only) are **not** enforced by the API layer — any valid per-tenant key has full access to all resource endpoints for its tenant. Finer-grained RBAC would require additional middleware not yet present.

---

### 4. Error envelope

#### 4.1 JSON shape

Every error response is a JSON object with a single `"error"` string field. There is no nested code sub-field, no `details` sub-object, and no `request_id` in the body (the ID is in the response header only).

```json
{
  "error": "<human-readable message>"
}
```

`Content-Type: application/json`

**Special case — Internal Server Error (500):** the message is always the literal string `"internal server error"` regardless of the underlying cause. The real cause is logged server-side only.

Source: `orch8-api/src/error.rs:79–87`

#### 4.2 Error variant → HTTP status mapping

| `ApiError` variant | HTTP status | Notes |
|---|---|---|
| `NotFound(String)` | `404 Not Found` | Message: `"not found: {detail}"` |
| `InvalidArgument(String)` | `400 Bad Request` | Message: `"invalid argument: {detail}"` |
| `AlreadyExists(String)` | `409 Conflict` | Message: `"already exists: {detail}"` — includes duplicate-create AND terminal-state-target |
| `Conflict(String)` | `409 Conflict` | Message: `"conflict: {detail}"` |
| `Unauthorized` | `401 Unauthorized` | Message: `"unauthorized"` |
| `Forbidden(String)` | `403 Forbidden` | Message: `"forbidden: {detail}"` |
| `Internal(String)` | `500 Internal Server Error` | Message always `"internal server error"` (detail redacted) |
| `Unavailable(String)` | `503 Service Unavailable` | Message: `"unavailable: {detail}"` — retryable; connection drops, pool exhaustion, backend failures |
| `PayloadTooLarge(String)` | `413 Payload Too Large` | Message: `"payload too large: {detail}"` — context exceeds `max_context_bytes` |
| `UnprocessableEntity(String)` | `422 Unprocessable Entity` | Message: `"unprocessable entity: {detail}"` — `input_schema` validation failures |
| `BadGateway(String)` | `502 Bad Gateway` | Message: `"bad gateway: {detail}"` |

Source: `orch8-api/src/error.rs:67–87`

#### 4.3 Auth errors (from middleware, not `ApiError`)

Auth failures before handlers run are raw HTTP status codes **with no JSON body**:

| Condition | Status |
|---|---|
| Missing `X-API-Key` header | `401 Unauthorized` (empty body) |
| Key not found, revoked, or expired | `401 Unauthorized` (empty body) |
| Per-tenant key + mismatching `X-Tenant-Id` | `403 Forbidden` (empty body) |
| Missing `X-Tenant-Id` when `require_tenant=true` | `400 Bad Request` (empty body) |
| DB error during key lookup | `500 Internal Server Error` (empty body) |

Source: `orch8-api/src/auth.rs:116–197`

The UI must handle both `{"error": "..."}` bodies (from handlers) and empty bodies (from middleware) when inspecting 400/401/403/500 responses.

#### 4.4 StorageError → ApiError mapping

| `StorageError` variant | Mapped to `ApiError` | HTTP |
|---|---|---|
| `NotFound` | `NotFound` | 404 |
| `Conflict` | `AlreadyExists` | 409 |
| `TerminalTarget` | `AlreadyExists` (message includes "is in a terminal state") | 409 |
| `Connection` | `Unavailable` | 503 |
| `Backend` | `Unavailable` | 503 |
| `PoolExhausted` | `Unavailable("pool exhausted")` | 503 |
| `Query`, `Migration`, `Serialization`, `Unsupported`, other | `Internal` | 500 |

Source: `orch8-api/src/error.rs:46–63`

#### 4.5 `EngineError` → `ApiError` mapping

| `EngineError` variant | Mapped to `ApiError` | HTTP |
|---|---|---|
| `Storage(NotFound)` | `NotFound` | 404 |
| `Storage(Conflict)` | `AlreadyExists` | 409 |
| `Storage(TerminalTarget)` | `AlreadyExists` | 409 |
| `InvalidTransition` | `InvalidArgument` | 400 |
| `HandlerNotFound` | `NotFound("handler: {name}")` | 404 |
| `ShuttingDown` | `Unavailable("shutdown in progress")` | 503 |
| All other `EngineError` variants | `Internal` | 500 |

Source: `orch8-api/src/error.rs:102–118`

#### 4.6 Example error responses

```json
// 404 Not Found
{ "error": "not found: instance abc-123-def" }

// 400 Bad Request (handler)
{ "error": "invalid argument: tenant_id is required" }

// 403 Forbidden (handler)
{ "error": "forbidden: API key management requires the root API key" }

// 409 Conflict — terminal target
{ "error": "already exists: instance xyz is in a terminal state" }

// 413 Payload Too Large
{ "error": "payload too large: context exceeds 262144 bytes (actual: 300000)" }

// 422 Unprocessable Entity (input_schema validation)
{ "error": "unprocessable entity: context.data failed input_schema validation: at /email: \"\" is not of type \"string\"; at /age: -1 is less than the minimum of 0" }

// 503 Service Unavailable
{ "error": "unavailable: pool exhausted" }

// 500 Internal Server Error (always redacted)
{ "error": "internal server error" }
```

---

### 5. `input_schema` validation

`input_schema` is an optional field on a **sequence** definition. When present it is a full JSON Schema object (any standard draft supported by the `jsonschema` Rust crate). It serves two purposes:

1. **Create-time sequence validation:** the schema itself is validated for correctness when the sequence is created (`validate_schema_is_well_formed`). A non-object value or an invalid JSON Schema is rejected with `400 Bad Request`.
2. **Instance create-time data validation:** when creating an instance, `context.data` is validated against the sequence's `input_schema`. Validation failures return `422 Unprocessable Entity` with pointer-path details.

#### 5.1 Rules

| Rule | Detail |
|---|---|
| `input_schema` must be a JSON object | Non-object (array, string, number) → `400 InvalidArgument` |
| Schema must be a valid JSON Schema | Unparseable schema → `400 InvalidArgument` |
| Absent / null `input_schema` on sequence | All `context.data` values pass without validation |
| `context.data` fails schema | `422 UnprocessableEntity`; message lists all violations with JSON Pointer paths |
| Corrupt stored schema (stored but fails compilation) | Validation is **skipped** (fail-open); server logs a `WARN`. This is an authoring bug, not an instance-blocking error. |

Source: `orch8-api/src/input_schema.rs:14–62`

#### 5.2 Error format for validation failures

```
"unprocessable entity: context.data failed input_schema validation: {v1}; {v2}; ..."
```

Each violation `v` is either:
- `"<error message>"` (when the path is the root)
- `"at {json_pointer}: <error message>"` (when the path is non-root)

The UI should parse this string for display; there is no structured violations array.

---

### 6. Pagination, filtering & sorting

#### 6.1 Pagination parameters

Pagination applies to list endpoints (at minimum `GET /api/v1/instances`). Parameters are query-string values deserialised into a `Pagination` struct.

| Parameter | Type | Default | Cap | Description |
|---|---|---|---|---|
| `offset` | `u64` | `0` | none | Zero-based row offset |
| `limit` | `u32` | `100` | `1000` | Max rows per page |
| `sort_ascending` | `bool` | `false` | — | `true` = oldest-first (by `updated_at`); `false` = newest-first |

If `limit` exceeds `1000`, it is clamped to `1000` by `.capped()` before the query executes.

Source: `orch8-types/src/filter.rs:17–43`

#### 6.2 Instance filter parameters

For `GET /api/v1/instances` (and equivalent legacy path), the following query parameters map to `InstanceFilter`:

| Parameter | Type | Description |
|---|---|---|
| `tenant_id` | `string` | Tenant scope. **Overridden** by `X-Tenant-Id` header if present. |
| `namespace` | `string` | Filter by namespace. |
| `sequence_id` | `string` (UUID) | Filter to instances of a specific sequence. |
| `states` | `string[]` | Filter by instance state(s). Multiple values accepted. |
| `metadata_filter` | `object` (JSON) | JSONB containment filter on the `metadata` field. |
| `priority` | `string` | Filter by priority level. |

Source: `orch8-types/src/filter.rs:6–15`

#### 6.3 Tenant override for list endpoints

When a `TenantContext` is present (from header or per-tenant key), the list endpoint ignores the `tenant_id` query parameter and uses the authenticated tenant instead. The UI must not rely on query-param tenant for scoping when a header is present.

Source: `orch8-api/src/auth.rs:68–79`

---

### 7. Request-ID & idempotency headers

#### 7.1 `x-request-id`

Every request and response carries an `x-request-id` header.

**Request (optional):** the client may send `x-request-id: <id>` to correlate responses with its own tracing. The server preserves it.

**Response (always):** the server echoes the ID back in `x-request-id`. If the client did not send one, a new UUID v4 is generated server-side.

#### 7.2 Sanitisation

Client-supplied IDs are sanitised: only ASCII alphanumeric, `-`, and `_` characters are preserved. All other characters are stripped silently. If the sanitised result is empty, a new UUID v4 is generated instead.

Source: `orch8-api/src/request_id.rs:8–53`

#### 7.3 UI implementation guidance

- On every request, generate a UUID v4 and send it as `x-request-id`.
- Log the echoed `x-request-id` from the response alongside any error for support tracing.
- For error display, surface the `x-request-id` value to the user ("Error ID: abc-123") so operators can cross-reference server logs.

#### 7.4 Idempotency

There is **no** `Idempotency-Key` header or idempotency mechanism documented in the analysed source files. Duplicate-create detection relies on storage-level unique-constraint violations, which surface as `409 Conflict` / `AlreadyExists`.

---

### 8. API-key management endpoints

These endpoints have **no `#[utoipa::path]` macro** and do not appear in the OpenAPI spec. They are real, live routes.

**Authentication required:** root/admin key (`AdminContext`). Any per-tenant key receives `403 Forbidden`.

**Base path:** mounted at both `/api-keys` and (legacy) `/api-keys` — the route is registered on the shared router without an `/api/v1` prefix check in the file. **[INFERRED]** The router nesting in `main.rs` / `lib.rs` determines the actual prefix; assume both `/api/v1/api-keys` and `/api-keys` are valid.

Source: `orch8-api/src/api_keys.rs:26–30`

#### 8.1 Create API key

| Field | Value |
|---|---|
| Method | `POST` |
| Path | `/api-keys` |
| Auth | Root key required |
| Content-Type | `application/json` |

**Request body:**

```typescript
interface CreateApiKeyRequest {
  tenant_id: string;   // Required; must be non-empty
  name?: string;       // Optional human label; defaults to ""
  expires_at?: string; // Optional ISO 8601 UTC datetime; omit for non-expiring key
}
```

**Validation:** `tenant_id` must be non-empty (trimmed). Empty value → `400 InvalidArgument("tenant_id is required")`.

**Response: `201 Created`**

```typescript
interface CreatedApiKey {
  id: string;                   // "ak_..." — public identifier
  tenant_id: string;
  name: string;
  secret: string;               // "sk_..." — plaintext. ONE-TIME ONLY. Never returned again.
  created_at: string;           // ISO 8601 UTC
  expires_at: string | null;    // ISO 8601 UTC, or null
}
```

**Critical:** the `secret` field is the only time the plaintext is ever visible. The server stores only the SHA-256 hash. The UI must prompt the operator to save it immediately and display it in a copy-once dialog.

Source: `orch8-api/src/api_keys.rs:44–128`

#### 8.2 List API keys

| Field | Value |
|---|---|
| Method | `GET` |
| Path | `/api-keys?tenant_id={tenant_id}` |
| Auth | Root key required |

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tenant_id` | `string` | Yes | Tenant whose keys to list |

**Validation:** `tenant_id` must be non-empty (trimmed). Empty → `400 InvalidArgument("tenant_id query parameter is required")`.

**Response: `200 OK`**

```typescript
type ListApiKeysResponse = ApiKeyInfo[];

interface ApiKeyInfo {
  id: string;                     // "ak_..." — use for revocation
  tenant_id: string;
  name: string;
  created_at: string;             // ISO 8601 UTC
  last_used_at: string | null;    // ISO 8601 UTC; null if never used
  expires_at: string | null;      // ISO 8601 UTC; null = non-expiring
  revoked: boolean;
}
```

**Note:** `secret` and `key_hash` are **never** included in list responses.

Source: `orch8-api/src/api_keys.rs:69–147`

#### 8.3 Revoke API key

| Field | Value |
|---|---|
| Method | `DELETE` |
| Path | `/api-keys/{id}` |
| Auth | Root key required |

**Path parameter:** `id` — the `ak_...` identifier returned by create or list.

**Response: `204 No Content`** on success.

**Error: `404 Not Found`** if no key with that ID exists (or if it was already hard-deleted).

Source: `orch8-api/src/api_keys.rs:150–166`

#### 8.4 Endpoint summary table

| Method | Path | Auth | Request | Success response |
|---|---|---|---|---|
| `POST` | `/api-keys` | Root key | JSON body: `CreateApiKeyRequest` | `201 Created` + `CreatedApiKey` |
| `GET` | `/api-keys` | Root key | Query: `?tenant_id=` | `200 OK` + `ApiKeyInfo[]` |
| `DELETE` | `/api-keys/{id}` | Root key | Path param `id` | `204 No Content` |

---

### 9. Type mapping: Rust → TypeScript

| Rust type | TypeScript type | Notes |
|---|---|---|
| `Uuid` (`InstanceId`, `SequenceId`, `ExecutionNodeId`) | `string` | UUIDv7 format for instance/sequence/node IDs; UUIDv4 for key IDs. Serialised as hyphenated lowercase string. |
| `BlockId` | `string` | Arbitrary string; not a UUID |
| `TenantId` | `string` | Non-empty string; no format constraint enforced at API layer |
| `Namespace` | `string` | Arbitrary string |
| `ResourceKey` | `string` | Arbitrary string, e.g. `"mailbox:user@example.com"` |
| `DateTime<Utc>` | `string` | ISO 8601 with timezone offset, e.g. `"2026-06-17T12:00:00Z"` |
| `Option<T>` | `T \| null` or `T \| undefined` (omitted in body) | Serde `default` fields serialise absent as `null`; `skip_serializing_if` fields are omitted |
| `i64` / `u64` | `number` | Risk of precision loss for values > `Number.MAX_SAFE_INTEGER`; use `BigInt` for IDs if needed **[INFERRED]** |
| `u32` | `number` | Safe range |
| `bool` | `boolean` | |
| `Vec<T>` | `T[]` | |
| `serde_json::Value` | `unknown` / typed as appropriate | Used for `context.data`, `metadata`, `metadata_filter`, `input_schema` |

---

### 10. Business-rules table

| Rule | Value / Constraint | Source |
|---|---|---|
| Max `ExecutionContext` serialised size | `262144` bytes (256 KiB) | `orch8-types/src/context.rs:28` — `DEFAULT_MAX_CONTEXT_BYTES = 256 * 1024` |
| Externalization threshold (default) | `65536` bytes (64 KiB) per top-level `context.data` key or block output | `orch8-types/src/config.rs:275` |
| Pagination default limit | `100` rows | `orch8-types/src/filter.rs:30` |
| Pagination max limit | `1000` rows (hard cap, clamped silently) | `orch8-types/src/filter.rs:38–42` |
| Pagination default sort | Newest-first (`sort_ascending = false`, by `updated_at`) | `orch8-types/src/filter.rs:27` |
| `tenant_id` minimum length | 1 non-whitespace character | `orch8-types/src/ids.rs:204–210` |
| API key ID prefix | `ak_` | `orch8-types/src/api_key.rs:82` |
| API key secret prefix | `sk_` | `orch8-types/src/api_key.rs:83–86` |
| API key secret entropy | 244 bits (two UUIDv4 concatenated) | `orch8-types/src/api_key.rs:83–86` |
| Root key comparison | SHA-256 constant-time, pre-computed digest | `orch8-api/src/auth.rs:124–127` |
| Per-tenant key hash algorithm | SHA-256, hex-encoded (64 chars) | `orch8-types/src/api_key.rs:26–35` |
| `x-request-id` allowed characters | ASCII alphanumeric, `-`, `_` | `orch8-api/src/request_id.rs:29–36` |
| Encryption key (if configured) | Exactly 64 hex characters (AES-256-GCM) | `orch8-types/src/config.rs:646–649` |
| DB connection pool default | `64` connections | `orch8-types/src/config.rs:248` |
| Scheduler tick interval default | `100` ms | `orch8-types/src/config.rs:474` |
| Stale instance threshold default | `300` seconds (5 min) | `orch8-types/src/config.rs:490` |
| Worker reaper stale threshold | `60` seconds | `orch8-types/src/config.rs:415` |
| Node reaper stale threshold | `120` seconds | `orch8-types/src/config.rs:423` |
| Webhook delivery timeout | `10` seconds | `orch8-types/src/config.rs:466` |
| Webhook max retries | `3` | `orch8-types/src/config.rs:470` |
| `input_schema` must be | JSON object (not array/string/number) | `orch8-api/src/input_schema.rs:15–19` |
| `input_schema` invalid stored schema | Validation skipped (fail-open), `WARN` logged | `orch8-api/src/input_schema.rs:39–43` |

---

### 11. Open issues

1. **Exact mount prefix for `/api-keys`:** The `routes()` function in `api_keys.rs` registers `/api-keys` and `/api-keys/{id}` but does not show the parent router nesting. It is unknown whether these resolve to `/api-keys`, `/api/v1/api-keys`, or both. Confirm by inspecting the main router setup file (likely `src/main.rs` or `src/lib.rs`).

2. **Intra-tenant RBAC (scopes within a per-tenant key):** The current source has no scope field on `ApiKeyRecord` and no per-action permission check beyond root vs. tenant-key. The conceptual roles (Workflow Developer, External Worker, Human Reviewer, Auditor) are not enforced; any valid per-tenant key has the same access. If fine-grained RBAC is planned, it must be added to both the key record and the handler middleware.

3. **`tenant_id` format constraints beyond non-empty:** `TenantId::new` only rejects empty/whitespace strings. There is no regex or length cap documented in the analysed source. Confirm whether a pattern (e.g. slug: `[a-z0-9-]+`) is enforced at the storage layer or by convention.

4. **`name` field on `CreateApiKeyRequest` max length:** No max length constraint is visible in the source for the key's `name` field. Confirm whether the DB schema enforces a `VARCHAR(N)` limit.

5. **`input_schema` validation — structured violations:** The `422` body contains a semicolon-joined string, not a structured array. If the UI needs to highlight individual fields, it must parse this string. A structured violations format may be desirable but is not currently implemented.

6. **Concurrency / rate-limit headers:** `ApiConfig.max_concurrent_requests` caps in-flight requests via Tower `ConcurrencyLimitLayer`. When the cap is hit, the response status is not documented in the analysed files (likely `503` from Tower's default). Confirm the status code and whether a `Retry-After` or `X-RateLimit-*` header is emitted.

7. **CORS configuration:** `api.cors_origins` is a comma-separated string (empty by default = CORS disabled). The exact CORS middleware behaviour (allowed methods, headers, credentials) is not documented in the analysed files. Confirm that `X-API-Key`, `X-Tenant-Id`, `X-Request-Id`, and `Content-Type` are included in `Access-Control-Allow-Headers`.

8. **`last_used_at` update timing:** `ApiKeyInfo.last_used_at` is included in the list response, but when exactly the DB record is updated (on every authentication, on a cadence, via cache) is not visible in the analysed source. This affects how stale the "last used" display may be.

9. **Webhook outbound signature header:** `X-Orch8-Signature` and `X-Orch8-Timestamp` are mentioned in `WebhookConfig` comments but are not part of the inbound API surface. No inbound signature verification endpoint is documented here. Clarify if the UI needs to help operators configure or verify outbound webhook secrets.
