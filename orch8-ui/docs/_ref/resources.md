## Credentials, Plugins & Resource Pools

Reference section for the Credentials, Plugins, Resource Pools, and Rate Limits subsystems of the Orch8 HTTP API. All routes are registered under both `/api/v1/...` (canonical) and `/...` (legacy root, deprecated — clients must migrate; see `orch8-api/src/lib.rs:143`).

---

### Auth Overview

All endpoints require `X-API-Key` header authentication. Two key classes exist:

| Key class | How obtained | Scope |
|-----------|--------------|-------|
| Root/admin key | Server config | Unscoped — tenant determined by `X-Tenant-Id` header |
| Per-tenant key | Created via `/api/v1/api_keys` | Bound to one tenant at mint time; `X-Tenant-Id` header must match or be omitted |

- **`--insecure` mode**: `X-API-Key` is not required; all requests pass as admin. Server warns at startup.
- Cross-tenant access: `enforce_tenant_access` returns **404** (not 403) to avoid leaking cross-tenant resource existence (`auth.rs:53`).
- Create enforcement: if `X-Tenant-Id` header is present, `tenant_id` in the request body must be empty or match the header, otherwise **403** (`auth.rs:34`).

Error response shape for all endpoints:

```json
{ "error": "<human readable message>" }
```

Internal errors (`500`) redact the underlying message and return `{ "error": "internal server error" }`.

---

## Credentials

> Source: `orch8-api/src/credentials.rs`, `orch8-types/src/credential.rs`

### Secret-Handling Contract

Credential values **never leave the server**. The `CredentialResponse` struct has no `value` or `refresh_token` fields by design — the conversion from `CredentialDef` drops both (`credentials.rs:106`). The `CredentialDef` struct uses `SecretString` for `value` and `refresh_token`, which serializes as `[REDACTED]` in all Debug/Serialize output (`credential.rs:57`).

Step params reference credentials via the URI scheme `credentials://<id>` (e.g., `"access_token": "credentials://stripe-prod"`). The engine resolves these internally at dispatch time via `StorageBackend::get_credential`. This lets operators rotate secrets without modifying any sequence definition.

OAuth2 credentials have a background refresh loop in `orch8-engine` that refreshes the access token a few minutes before `expires_at` (`credential.rs:11`).

### Credential Value Shapes by Kind

The `value` field is a JSON-encoded string. Expected shape per `kind`:

| kind | expected JSON shape |
|------|---------------------|
| `api_key` | `{"token": "..."}` |
| `oauth2` | `{"access_token": "...", "refresh_token": "..."}` |
| `basic` | `{"username": "...", "password": "..."}` |

### CredentialKind Enum

Serialization: `snake_case` (`credential.rs:22`).

| Value | Description |
|-------|-------------|
| `api_key` | Single opaque token (Bearer, API key, PAT). **Default.** |
| `oauth2` | OAuth2 access/refresh token pair with optional expiry |
| `basic` | Basic auth username + password |

### Endpoints

| Method | Canonical path | Legacy path | Handler fn | Auth scope |
|--------|---------------|-------------|------------|------------|
| `GET` | `/api/v1/credentials` | `/credentials` | `list_credentials` | Any valid key |
| `POST` | `/api/v1/credentials` | `/credentials` | `create_credential` | Any valid key |
| `GET` | `/api/v1/credentials/{id}` | `/credentials/{id}` | `get_credential` | Any valid key |
| `PATCH` | `/api/v1/credentials/{id}` | `/credentials/{id}` | `update_credential` | Any valid key |
| `DELETE` | `/api/v1/credentials/{id}` | `/credentials/{id}` | `delete_credential` | Any valid key |

---

#### POST /api/v1/credentials — create_credential

Creates a new credential. Secret material is stored server-side and never returned.

**Request body** (`CreateCredentialRequest`):

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `id` | string | Yes | — | Non-empty; max 255 chars; characters limited to `[a-zA-Z0-9\-_.]` (URL-safe for `credentials://` scheme) |
| `name` | string | Yes | — | Non-empty |
| `kind` | string (enum) | No | `"api_key"` | `"api_key"`, `"oauth2"`, `"basic"` |
| `value` | string | Yes | — | Non-empty; JSON-encoded secret (shape depends on `kind`); write-only |
| `tenant_id` | string | No | `""` | Must match `X-Tenant-Id` header if header is present |
| `expires_at` | string (ISO 8601 UTC) | No | `null` | RFC 3339 datetime with timezone |
| `refresh_url` | string | No | `null` | OAuth2 token endpoint URL |
| `refresh_token` | string | No | `null` | OAuth2 refresh token; write-only |
| `description` | string | No | `null` | — |

**Business rule**: If `kind` is `oauth2` AND `refresh_url` is set AND `refresh_token` is NOT set → `400 Bad Request` (`credentials.rs:161`).

**Behavior**: `enabled` is always set to `true` on creation (`credentials.rs:186`).

**Success response**: `201 Created`, body: `CredentialResponse` (see schema below).

```json
{
  "id": "stripe-prod",
  "tenant_id": "acme",
  "name": "Stripe Production API Key",
  "kind": "api_key",
  "enabled": true,
  "expires_at": null,
  "refresh_url": null,
  "has_refresh_token": false,
  "description": "Stripe live mode secret key",
  "created_at": "2026-06-17T10:00:00Z",
  "updated_at": "2026-06-17T10:00:00Z"
}
```

**Error responses**:

| Status | Condition |
|--------|-----------|
| `400` | `id`/`name`/`value` empty; `id` exceeds 255 chars; `id` contains invalid characters; oauth2 `refresh_url` without `refresh_token` |
| `401` | Missing or invalid `X-API-Key` |
| `403` | `tenant_id` body field does not match `X-Tenant-Id` header |
| `409` | Credential with this `id` already exists |

---

#### GET /api/v1/credentials — list_credentials

Lists credentials for a tenant. Returns metadata only — no secret material.

**Query parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `tenant_id` | string | No | `null` | Filter by tenant. Ignored if `X-Tenant-Id` header is present (header takes priority) |
| `limit` | integer (u32) | No | `100` | Maximum number of results to return |

**Success response**: `200 OK`, body: `CredentialResponse[]`.

**Notes**: When a per-tenant API key is used, `tenant_id` query param is overridden by the key's bound tenant (`auth.rs:69`). When no tenant context is set and no `tenant_id` filter is provided, all credentials may be returned [INFERRED from storage contract].

---

#### GET /api/v1/credentials/{id} — get_credential

Fetches a single credential by its `id`. Returns metadata only — no secret material.

**Path parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Credential id |

**Success response**: `200 OK`, body: `CredentialResponse`.

**Error responses**:

| Status | Condition |
|--------|-----------|
| `401` | Missing or invalid `X-API-Key` |
| `404` | Credential not found, OR credential belongs to a different tenant (existence leak prevention) |

---

#### PATCH /api/v1/credentials/{id} — update_credential

Partial update of a credential. All fields are optional — only provided fields are updated.

**Path parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Credential id |

**Request body** (`UpdateCredentialRequest` — all fields optional):

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Replaces display name |
| `kind` | string (enum) | `"api_key"`, `"oauth2"`, `"basic"` |
| `value` | string | Replaces stored secret. Write-only — never returned |
| `expires_at` | string (ISO 8601 UTC) | Replaces expiry timestamp |
| `refresh_url` | string | Replaces OAuth2 token endpoint |
| `refresh_token` | string | Replaces OAuth2 refresh token. Write-only — never returned |
| `enabled` | boolean | Enable or disable the credential |
| `description` | string | Replaces description |

**Note**: `expires_at` and `refresh_url` and `refresh_token` can only be set (not cleared) via this endpoint. Passing `null` for these fields has no effect because of the `Option<T>` pattern — only a present value triggers an update (`credentials.rs:262`). [INFERRED — clearing requires the field to be absent from the JSON body.]

**Success response**: `200 OK`, body: `CredentialResponse`.

**Error responses**:

| Status | Condition |
|--------|-----------|
| `401` | Missing or invalid `X-API-Key` |
| `404` | Credential not found or cross-tenant access |

---

#### DELETE /api/v1/credentials/{id} — delete_credential

Deletes a credential permanently. **Warning**: any sequence step referencing `credentials://<id>` will fail-fast at dispatch time after deletion.

**Path parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Credential id |

**Success response**: `204 No Content` (no body).

**Error responses**:

| Status | Condition |
|--------|-----------|
| `401` | Missing or invalid `X-API-Key` |
| `404` | Credential not found or cross-tenant access |

---

### CredentialResponse Schema

Returned by all credential endpoints. **Secret fields `value` and `refresh_token` are never present.**

| Field | TS type | Nullable/Optional | Notes |
|-------|---------|------------------|-------|
| `id` | `string` | required | Credential id; URL-safe |
| `tenant_id` | `string` | required | Empty string = global |
| `name` | `string` | required | Display name |
| `kind` | `"api_key" \| "oauth2" \| "basic"` | required | Default `"api_key"` |
| `enabled` | `boolean` | required | Whether step handlers can resolve this credential |
| `expires_at` | `string` (ISO 8601) | optional | Omitted if not set |
| `refresh_url` | `string` | optional | Omitted if not set |
| `has_refresh_token` | `boolean` | required | `true` if a refresh token is stored; never the value itself |
| `description` | `string` | optional | Omitted if not set |
| `created_at` | `string` (ISO 8601) | required | UTC datetime |
| `updated_at` | `string` (ISO 8601) | required | UTC datetime |

---

## Plugins

> Source: `orch8-api/src/plugins.rs`, `orch8-types/src/plugin.rs`

### Overview

Plugins map handler names to external implementations. A workflow step with `handler: "wasm://my-plugin"` resolves via the plugin registry to find the `.wasm` module path. Similarly, `grpc://` plugins resolve to a `host:port/Service.Method` endpoint.

Unlike credentials, plugin definitions contain no secret material and are returned in full on all read operations.

### PluginType Enum

Serialization: `snake_case` (`plugin.rs:10`). Marked `#[non_exhaustive]` — future types may be added without a breaking change.

| Value | Description |
|-------|-------------|
| `wasm` | WebAssembly module; `source` is a file path to a `.wasm` file |
| `grpc` | gRPC endpoint; `source` is `host:port/Service.Method` |

**No default** — `plugin_type` is always required on create.

### Endpoints

| Method | Canonical path | Legacy path | Handler fn | Auth scope |
|--------|---------------|-------------|------------|------------|
| `GET` | `/api/v1/plugins` | `/plugins` | `list_plugins` | Any valid key |
| `POST` | `/api/v1/plugins` | `/plugins` | `create_plugin` | Any valid key |
| `GET` | `/api/v1/plugins/{name}` | `/plugins/{name}` | `get_plugin` | Any valid key |
| `PATCH` | `/api/v1/plugins/{name}` | `/plugins/{name}` | `update_plugin` | Any valid key |
| `DELETE` | `/api/v1/plugins/{name}` | `/plugins/{name}` | `delete_plugin` | Any valid key |

---

#### POST /api/v1/plugins — create_plugin

Registers a new plugin.

**Request body** (`CreatePluginRequest`):

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | — | Non-empty; max 255 chars; used as the handler name prefix (e.g., `wasm://name`) |
| `plugin_type` | string (enum) | Yes | — | `"wasm"` or `"grpc"` |
| `source` | string | Yes | — | Non-empty; max 2048 chars. For WASM: file path to `.wasm` module. For gRPC: `host:port/Service.Method` |
| `tenant_id` | string | No | `""` | Must match `X-Tenant-Id` header if header present |
| `config` | object (JSON) | No | `null` | Plugin-specific configuration (freeform JSON) |
| `description` | string | No | `null` | — |

**Behavior**: `enabled` is always set to `true` on creation (`plugins.rs:91`).

**Success response**: `201 Created`, body: `PluginDef` (full definition, see schema below).

```json
{
  "name": "my-wasm-plugin",
  "plugin_type": "wasm",
  "source": "/opt/plugins/my-wasm-plugin.wasm",
  "tenant_id": "acme",
  "enabled": true,
  "config": {"timeout_ms": 5000},
  "description": "Custom data transform plugin",
  "created_at": "2026-06-17T10:00:00Z",
  "updated_at": "2026-06-17T10:00:00Z"
}
```

**Error responses**:

| Status | Condition |
|--------|-----------|
| `400` | `name` or `source` empty; `name` exceeds 255 chars; `source` exceeds 2048 chars |
| `401` | Missing or invalid `X-API-Key` |
| `403` | `tenant_id` body field does not match `X-Tenant-Id` header |
| `409` | Plugin with this `name` already exists |

---

#### GET /api/v1/plugins — list_plugins

Lists all plugins for a tenant.

**Query parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `tenant_id` | string | No | `null` | Filter by tenant. Ignored if `X-Tenant-Id` header is present |

**Note**: Unlike credentials, there is no `limit` query parameter — all matching plugins are returned. [INFERRED — `PluginQuery` has only `tenant_id`.]

**Success response**: `200 OK`, body: `PluginDef[]`.

---

#### GET /api/v1/plugins/{name} — get_plugin

Fetches a single plugin definition by name.

**Path parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Plugin name |

**Success response**: `200 OK`, body: `PluginDef`.

**Error responses**:

| Status | Condition |
|--------|-----------|
| `401` | Missing or invalid `X-API-Key` |
| `404` | Plugin not found or cross-tenant access |

---

#### PATCH /api/v1/plugins/{name} — update_plugin

Partial update of a plugin. `name` and `plugin_type` cannot be changed via PATCH — to rename a plugin, delete and recreate it.

**Path parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Plugin name |

**Request body** (`UpdatePluginRequest` — all fields optional):

| Field | Type | Notes |
|-------|------|-------|
| `source` | string | Replaces the plugin source path/endpoint |
| `enabled` | boolean | Enable or disable the plugin |
| `config` | object (JSON) | Replaces the plugin config (full replacement, not merge) |
| `description` | string | Replaces description |

**Success response**: `200 OK`, body: `PluginDef`.

**Error responses**:

| Status | Condition |
|--------|-----------|
| `401` | Missing or invalid `X-API-Key` |
| `404` | Plugin not found or cross-tenant access |

---

#### DELETE /api/v1/plugins/{name} — delete_plugin

Deletes a plugin. Steps referencing `wasm://<name>` or `grpc://<name>` will fail at dispatch time after deletion.

**Path parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Plugin name |

**Success response**: `204 No Content` (no body).

**Error responses**:

| Status | Condition |
|--------|-----------|
| `401` | Missing or invalid `X-API-Key` |
| `404` | Plugin not found or cross-tenant access |

---

### PluginDef Schema

Returned in full on all plugin read/write operations. No fields are redacted.

| Field | TS type | Nullable/Optional | Notes |
|-------|---------|------------------|-------|
| `name` | `string` | required | Unique plugin name and handler prefix |
| `plugin_type` | `"wasm" \| "grpc"` | required | — |
| `source` | `string` | required | File path (WASM) or `host:port/Service.Method` (gRPC) |
| `tenant_id` | `string` | required | Empty string = global |
| `enabled` | `boolean` | required | Default `true` on create |
| `config` | `unknown` (JSON) | required | Defaults to `null`; freeform JSON object |
| `description` | `string` | optional | Omitted if not set |
| `created_at` | `string` (ISO 8601) | required | UTC datetime |
| `updated_at` | `string` (ISO 8601) | required | UTC datetime |

---

## Resource Pools

> Source: `orch8-api/src/pools.rs`, `orch8-types/src/pool.rs`

### Overview

Resource pools group a set of named resources (e.g., email sender accounts, proxy IPs) and provide rotation semantics for assigning them to workflow instances. The pool tracks per-resource daily usage with optional warmup ramp-up to avoid sudden load spikes on new resources.

A pool assignment yields a `ResourceKey` (opaque string identifier for a resource). The engine uses `PoolAssignment` variants to convey outcomes: `Assigned(ResourceKey)`, `Exhausted` (all resources hit their daily cap), or `Empty` (no enabled resources) (`pool.rs:138`).

### RotationStrategy Enum

Serialization: `snake_case`.

| Value | Description |
|-------|-------------|
| `round_robin` | Assign resources in order, cycling through the list. **Default** (`pools.rs:37`) |
| `weighted` | Assign resources proportional to their `weight` field |
| `random` | Assign resources randomly |

### Warmup Ramp Semantics

A resource can have a warmup period to gradually ramp up its daily cap from `warmup_start_cap` to `daily_cap` over `warmup_days` days, starting from `warmup_start` date. The formula is linear interpolation (`pool.rs:114`):

```
effective_cap = warmup_start_cap + ((daily_cap - warmup_start_cap) * days_active / warmup_days)
```

Once `days_active >= warmup_days`, the resource uses `daily_cap` directly. If `warmup_days` is `0` or `warmup_start` is `null`, no warmup applies and `daily_cap` is used immediately.

Special case: `daily_cap == 0` means **unlimited** — the resource always has capacity.

Daily usage counters auto-reset when `daily_usage_date` differs from today (`pool.rs:127`).

### Endpoints

| Method | Canonical path | Legacy path | Handler fn | Auth scope |
|--------|---------------|-------------|------------|------------|
| `GET` | `/api/v1/pools` | `/pools` | `list_pools` | Any valid key |
| `POST` | `/api/v1/pools` | `/pools` | `create_pool` | Any valid key |
| `GET` | `/api/v1/pools/{id}` | `/pools/{id}` | `get_pool` | Any valid key |
| `DELETE` | `/api/v1/pools/{id}` | `/pools/{id}` | `delete_pool` | Any valid key |
| `GET` | `/api/v1/pools/{pool_id}/resources` | `/pools/{pool_id}/resources` | `list_resources` | Any valid key |
| `POST` | `/api/v1/pools/{pool_id}/resources` | `/pools/{pool_id}/resources` | `add_resource` | Any valid key |
| `PUT` | `/api/v1/pools/{pool_id}/resources/{resource_id}` | `/pools/{pool_id}/resources/{resource_id}` | `update_resource` | Any valid key |
| `DELETE` | `/api/v1/pools/{pool_id}/resources/{resource_id}` | `/pools/{pool_id}/resources/{resource_id}` | `delete_resource` | Any valid key |

**Note**: Pool `id` and `resource_id` path parameters are UUIDs (v7 format).

---

#### POST /api/v1/pools — create_pool

Creates a new resource pool.

**Request body** (`CreatePoolRequest`):

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `tenant_id` | string | Yes | — | Must match `X-Tenant-Id` header if present |
| `name` | string | Yes | — | Display name for the pool |
| `strategy` | string (enum) | No | `"round_robin"` | `"round_robin"`, `"weighted"`, `"random"` |

**Behavior**: `round_robin_index` is initialized to `0`. `id` is auto-generated as UUID v7.

**Success response**: `201 Created`, body: `ResourcePool`.

```json
{
  "id": "01932f4c-6b2a-7c3d-8e4f-5a6b7c8d9e0f",
  "tenant_id": "acme",
  "name": "Email Sender Pool",
  "strategy": "weighted",
  "round_robin_index": 0,
  "created_at": "2026-06-17T10:00:00Z",
  "updated_at": "2026-06-17T10:00:00Z"
}
```

**Error responses**:

| Status | Condition |
|--------|-----------|
| `401` | Missing or invalid `X-API-Key` |
| `403` | `tenant_id` body field does not match `X-Tenant-Id` header |

---

#### GET /api/v1/pools — list_pools

Lists all pools for a tenant.

**Query parameters**:

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `tenant_id` | string | No | `""` | Filter by tenant. Ignored if `X-Tenant-Id` header is present. Falls back to empty string (no filter) if absent |

**Success response**: `200 OK`, body: `ResourcePool[]`.

---

#### GET /api/v1/pools/{id} — get_pool

Fetches a single pool by UUID.

**Path parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string (UUID) | Yes | Pool UUID |

**Success response**: `200 OK`, body: `ResourcePool`.

**Error responses**:

| Status | Condition |
|--------|-----------|
| `401` | Missing or invalid `X-API-Key` |
| `404` | Pool not found or cross-tenant access |

---

#### DELETE /api/v1/pools/{id} — delete_pool

Deletes a pool and (by cascade [INFERRED]) all its resources.

**Path parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string (UUID) | Yes | Pool UUID |

**Success response**: `204 No Content`.

**Error responses**:

| Status | Condition |
|--------|-----------|
| `401` | Missing or invalid `X-API-Key` |
| `404` | Pool not found or cross-tenant access |

---

#### GET /api/v1/pools/{pool_id}/resources — list_resources

Lists all resources in a pool.

**Path parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `pool_id` | string (UUID) | Yes | Pool UUID |

**Success response**: `200 OK`, body: `PoolResource[]`.

**Error responses**:

| Status | Condition |
|--------|-----------|
| `401` | Missing or invalid `X-API-Key` |
| `404` | Pool not found or cross-tenant access |

---

#### POST /api/v1/pools/{pool_id}/resources — add_resource

Adds a resource to a pool.

**Path parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `pool_id` | string (UUID) | Yes | Pool UUID |

**Request body** (`AddResourceRequest`):

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `resource_key` | string | Yes | — | 1–255 characters; opaque identifier for the resource (e.g., a sender email address, proxy IP) |
| `name` | string | Yes | — | 1–255 characters; display name |
| `weight` | integer (u32) | No | `1` | Must be >= 1; used for weighted rotation |
| `daily_cap` | integer (u32) | No | `0` | Max assignments per day; `0` = unlimited |
| `warmup_start` | string (date) | No | `null` | Date in `YYYY-MM-DD` format; start of warmup ramp |
| `warmup_days` | integer (u32) | No | `0` | Duration of warmup in days; `0` = no warmup |
| `warmup_start_cap` | integer (u32) | No | `0` | Starting daily cap during warmup |

**Behavior**: `id` is auto-generated UUID v7. `enabled` is always `true` on creation. `daily_usage` is initialized to `0`. `daily_usage_date` is initialized to `null`.

**Success response**: `201 Created`, body: `PoolResource`.

```json
{
  "id": "01932f4c-7c3d-8e4f-9b0a-1b2c3d4e5f6a",
  "pool_id": "01932f4c-6b2a-7c3d-8e4f-5a6b7c8d9e0f",
  "resource_key": "sender@company.com",
  "name": "Primary Sender",
  "weight": 2,
  "enabled": true,
  "daily_cap": 500,
  "daily_usage": 0,
  "daily_usage_date": null,
  "warmup_start": "2026-06-17",
  "warmup_days": 14,
  "warmup_start_cap": 50,
  "created_at": "2026-06-17T10:00:00Z"
}
```

**Error responses**:

| Status | Condition |
|--------|-----------|
| `400` | `resource_key` empty or exceeds 255 chars; `name` empty or exceeds 255 chars; `weight` is 0; `warmup_start` is not a valid `YYYY-MM-DD` date |
| `401` | Missing or invalid `X-API-Key` |
| `404` | Pool not found or cross-tenant access |

---

#### PUT /api/v1/pools/{pool_id}/resources/{resource_id} — update_resource

Full or partial update of a pool resource. All fields are optional — only provided (non-null) fields are applied.

**Path parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `pool_id` | string (UUID) | Yes | Pool UUID |
| `resource_id` | string (UUID) | Yes | Resource UUID |

**Request body** (`UpdateResourceRequest` — all fields optional):

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Replaces display name |
| `weight` | integer (u32) | Replaces weight |
| `enabled` | boolean | Enable or disable this resource |
| `daily_cap` | integer (u32) | Replaces daily cap; `0` = unlimited |
| `warmup_start` | string (date) | Replaces warmup start date (`YYYY-MM-DD`) |
| `warmup_days` | integer (u32) | Replaces warmup duration |
| `warmup_start_cap` | integer (u32) | Replaces starting warmup cap |

**Note**: `resource_key` cannot be changed via update. `daily_usage` and `daily_usage_date` are read-only (managed by the engine). `created_at` is immutable.

**Success response**: `200 OK`, body: `PoolResource`.

**Error responses**:

| Status | Condition |
|--------|-----------|
| `400` | `warmup_start` is not a valid `YYYY-MM-DD` date |
| `401` | Missing or invalid `X-API-Key` |
| `404` | Pool not found, resource not found, or cross-tenant access |

---

#### DELETE /api/v1/pools/{pool_id}/resources/{resource_id} — delete_resource

Removes a resource from a pool permanently.

**Path parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `pool_id` | string (UUID) | Yes | Pool UUID |
| `resource_id` | string (UUID) | Yes | Resource UUID |

**Note**: Pool-level tenant access is enforced before the delete. The resource lookup does not re-check tenant (the pool check is sufficient) [INFERRED from `pools.rs:303`].

**Success response**: `204 No Content`.

**Error responses**:

| Status | Condition |
|--------|-----------|
| `401` | Missing or invalid `X-API-Key` |
| `404` | Pool not found or cross-tenant access |

---

### ResourcePool Schema

| Field | TS type | Nullable/Optional | Notes |
|-------|---------|------------------|-------|
| `id` | `string` (UUID v7) | required | Auto-generated on create |
| `tenant_id` | `string` | required | TenantId; empty = global |
| `name` | `string` | required | Display name |
| `strategy` | `"round_robin" \| "weighted" \| "random"` | required | Default `"round_robin"` |
| `round_robin_index` | `number` (u32) | required | Internal counter for round-robin; default `0` |
| `created_at` | `string` (ISO 8601) | required | UTC datetime |
| `updated_at` | `string` (ISO 8601) | required | UTC datetime |

### PoolResource Schema

| Field | TS type | Nullable/Optional | Notes |
|-------|---------|------------------|-------|
| `id` | `string` (UUID v7) | required | Auto-generated on add |
| `pool_id` | `string` (UUID) | required | Parent pool |
| `resource_key` | `string` | required | Opaque resource identifier (e.g., email address, IP) |
| `name` | `string` | required | Display name |
| `weight` | `number` (u32) | required | Default `1`; used for weighted rotation |
| `enabled` | `boolean` | required | Default `true`; disabled resources are skipped during assignment |
| `daily_cap` | `number` (u32) | required | Default `0` (unlimited) |
| `daily_usage` | `number` (u32) | required | Current day's usage counter (read-only) |
| `daily_usage_date` | `string` (YYYY-MM-DD) \| null | optional | Date of current counter (null if never used) |
| `warmup_start` | `string` (YYYY-MM-DD) \| null | optional | Warmup start date |
| `warmup_days` | `number` (u32) | required | Default `0` (no warmup) |
| `warmup_start_cap` | `number` (u32) | required | Default `0`; starting cap during warmup |
| `created_at` | `string` (ISO 8601) | required | UTC datetime |

---

## Rate Limits

> Source: `orch8-types/src/rate_limit.rs`

### Overview

Rate limits are a server-side enforcement mechanism applied per `resource_key` and tenant. There are **no HTTP endpoints** for managing rate limits exposed in the files reviewed — `RateLimit` is an internal type used by the engine and storage layer to track and enforce sliding-window call budgets.

The check result is a two-variant enum:
- `Allowed` — the request is within the limit
- `Exceeded { retry_after: DateTime<Utc> }` — the limit has been hit; `retry_after` indicates when the window resets

### RateLimit Data Type

| Field | Rust type | TS equivalent | Notes |
|-------|-----------|---------------|-------|
| `id` | `Uuid` | `string` (UUID) | Auto-generated |
| `tenant_id` | `TenantId` | `string` | Owning tenant |
| `resource_key` | `ResourceKey` | `string` | Identifies what is rate-limited (e.g., `"api:create"`) |
| `max_count` | `i32` | `number` | Maximum requests allowed in the window |
| `window_seconds` | `i32` | `number` | Window duration in seconds |
| `current_count` | `i32` | `number` | Requests in current window |
| `window_start` | `DateTime<Utc>` | `string` (ISO 8601) | When the current window started |

### RateLimitCheck Enum (internal)

| Variant | Fields | Meaning |
|---------|--------|---------|
| `Allowed` | — | Request is within limit |
| `Exceeded` | `retry_after: DateTime<Utc>` | Limit exceeded; when to retry |

**Note for UI team**: Rate limit state is not directly accessible via API from the files reviewed. It is used internally by the engine. If the API returns `429 Too Many Requests` in future, expect a `retry_after` field in the error body [INFERRED — no HTTP exposure confirmed in reviewed files].

---

## Entity Summary

| Entity | Key type | Tenant-scoped | Primary key | Notes |
|--------|----------|--------------|-------------|-------|
| `CredentialDef` | `id: String` | Yes | `id` (user-supplied, URL-safe) | Secret fields redacted via `SecretString` |
| `PluginDef` | `name: String` | Yes | `name` (user-supplied) | No secret fields |
| `ResourcePool` | `id: Uuid` | Yes | `id` (UUID v7, server-generated) | Contains `round_robin_index` counter |
| `PoolResource` | `id: Uuid` | Via `pool_id` | `id` (UUID v7, server-generated) | Tracks `daily_usage` + `daily_usage_date` |
| `RateLimit` | `id: Uuid` | Yes | `id` (UUID v7) | Internal only; no HTTP CRUD |

---

## Cross-Cutting Business Rules

1. **Secret redaction**: `CredentialDef.value` and `CredentialDef.refresh_token` use `SecretString` and are serialized as `[REDACTED]`. The API response type `CredentialResponse` has no `value` field whatsoever — compile-time guarantee, not just runtime stripping (`credentials.rs:83`, `credential.rs:56`).

2. **Credential ID character set**: Credential `id` values are restricted to `[a-zA-Z0-9\-_.]` and max 255 chars to be safe in the `credentials://<id>` URI scheme without percent-encoding (`credentials.rs:152`).

3. **OAuth2 refresh constraint**: An OAuth2 credential with `refresh_url` set MUST also have `refresh_token` provided at create time (`credentials.rs:161`).

4. **Enabled-on-create**: Both credentials and plugins always start with `enabled: true` on creation. The `enabled` field can only be changed via PATCH/PUT after creation.

5. **Disabled credential fail-fast**: Step handlers that encounter a `credentials://<id>` reference where the credential is `enabled: false` fail immediately with a permanent error (`credential.rs:93`).

6. **Tenant isolation with 404 masking**: Cross-tenant resource access returns `404 Not Found` (not `403 Forbidden`) to prevent existence leakage (`auth.rs:53`).

7. **Header-body tenant consistency**: On create operations, if `X-Tenant-Id` header is present, the body's `tenant_id` field must be empty or identical — mismatch is `403 Forbidden` (`auth.rs:34`).

8. **Header overrides query param**: For list operations with a `tenant_id` query param, the `X-Tenant-Id` header (or the per-tenant API key's bound tenant) always takes precedence (`auth.rs:69`).

9. **Pool resource weight constraint**: `weight` must be >= 1 — zero weight is rejected with `400` (`pools.rs:202`).

10. **Pool resource key/name length**: `resource_key` and `name` must be 1–255 characters (`pools.rs:192`).

11. **Warmup date format**: `warmup_start` must be a valid `YYYY-MM-DD` date string — invalid format returns `400` (`pools.rs:215`).

12. **Daily cap = 0 means unlimited**: When `daily_cap` is `0`, `effective_daily_cap()` returns `0` which `has_capacity()` interprets as always having capacity (`pool.rs:97`).

13. **Daily usage auto-reset**: The `daily_usage` counter is logically reset when `daily_usage_date` differs from the current date — the server reads and compares `daily_usage_date` before consuming capacity (`pool.rs:127`).

14. **Pool assignment outcomes**: The engine surfaces three outcomes — `Assigned`, `Exhausted` (cap reached), `Empty` (no enabled resources). UI should handle all three for pool-driven sequences.

15. **Plugin source size limit**: Plugin `source` is capped at 2048 characters, intended to accommodate long gRPC endpoint paths (`plugins.rs:79`).

16. **Plugin type is not updatable**: `plugin_type` and `name` cannot be changed via PATCH. Rename/retype requires delete + recreate.

17. **Resource key is not updatable**: `resource_key` in a `PoolResource` cannot be changed via PUT. Delete + re-add is required.

18. **Internal error message redaction**: `500 Internal Server Error` responses never include the underlying error detail. The message is logged server-side and the response body contains only `{"error": "internal server error"}` (`error.rs:80`).

---

## Open Issues

- The storage-layer schema (Postgres/SQLite migrations) was not in the reviewed files. Column SQL types, FK constraints, ON DELETE behavior (e.g., does deleting a pool cascade-delete its resources at DB level?), and unique index definitions are not confirmed from source code alone.
- No HTTP endpoint for `RateLimit` CRUD is present in the reviewed files. It is unknown whether rate limits are configurable via API at all, or solely managed through configuration files or the storage layer directly.
- The `list_credentials` endpoint uses a `limit` query parameter (default 100) but returns a plain `Vec<CredentialResponse>` — there is no `has_more` / pagination cursor in the response shape. The `PaginatedResponse<T>` wrapper defined in `lib.rs:53` is not used here. Clients cannot determine whether results were truncated beyond checking `len == limit`.
- The `list_plugins` endpoint has no `limit` parameter at all. The maximum number of plugins returnable is undetermined without reviewing the storage implementation.
- It is not confirmed from source whether deleting a pool that is currently referenced by a running workflow instance produces an error or silently succeeds.
- It is not confirmed whether `PoolResource.daily_usage` and `daily_usage_date` are updated atomically in the DB on assignment (race-condition safety under concurrent engine nodes).
- The `config` field on `PluginDef` is freeform JSON (`serde_json::Value`). Per-plugin schema documentation (what keys each plugin type recognizes) does not exist in the reviewed type files.
- There is no PATCH endpoint for `ResourcePool` itself — once created, the `name` and `strategy` of a pool cannot be changed without deleting and recreating it. This should be confirmed with the team.
- The `round_robin_index` field is returned in `ResourcePool` responses but there is no documented way for the UI to reset or set it. Whether it should be displayed or hidden in the UI is unclear.
