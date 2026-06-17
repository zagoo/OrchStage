## Entity-Relationship Map (Physical Data Model)

**Source:** migrations 001–052 plus `down/` directory under `engine/migrations/`.
**Database:** PostgreSQL (primary backend). All timestamps are `TIMESTAMPTZ` (ISO 8601 UTC); UUIDs map to TypeScript `string`; `JSONB`/`JSON` fields map to TypeScript `unknown`; `BIGINT`/`INTEGER`/`SMALLINT` map to TypeScript `number`.
**RLS:** Migration `039_enable_rls.sql.deferred` is a **deferred** migration — Row-Level Security is not enabled by default. See [Deferred Migrations](#deferred-migrations) section.

---

### Table of Contents

1. [Core Workflow Tables](#1-core-workflow-tables)
   - [sequences](#sequences)
   - [task_instances](#task_instances)
   - [execution_tree](#execution_tree)
   - [block_outputs](#block_outputs)
2. [Signal & Externalized State](#2-signal--externalized-state)
   - [signal_inbox](#signal_inbox)
   - [externalized_state](#externalized_state)
   - [instance_kv_state](#instance_kv_state)
3. [Scheduling](#3-scheduling)
   - [cron_schedules](#cron_schedules)
   - [sessions](#sessions)
4. [Worker Infrastructure](#4-worker-infrastructure)
   - [worker_tasks](#worker_tasks)
   - [worker_registrations](#worker_registrations)
   - [worker_commands](#worker_commands)
   - [worker_version_pins](#worker_version_pins)
5. [Rate Limiting & Resource Pools](#5-rate-limiting--resource-pools)
   - [rate_limits](#rate_limits)
   - [resource_pools](#resource_pools)
   - [pool_resources](#pool_resources)
6. [Triggers & Plugins](#6-triggers--plugins)
   - [triggers](#triggers)
   - [trigger_poll_state](#trigger_poll_state)
   - [plugins](#plugins)
7. [Credentials & API Keys](#7-credentials--api-keys)
   - [credentials](#credentials)
   - [api_keys](#api_keys)
8. [Audit, Checkpoints & Telemetry](#8-audit-checkpoints--telemetry)
   - [audit_log](#audit_log)
   - [checkpoints](#checkpoints)
   - [telemetry_mobile_events](#telemetry_mobile_events)
   - [telemetry_mobile_errors](#telemetry_mobile_errors)
9. [Cluster & Circuit Breakers](#9-cluster--circuit-breakers)
   - [cluster_nodes](#cluster_nodes)
   - [circuit_breakers](#circuit_breakers)
10. [Event Deduplication](#10-event-deduplication)
    - [emit_event_dedupe](#emit_event_dedupe)
11. [Rollback Policies](#11-rollback-policies)
    - [rollback_policies](#rollback_policies)
    - [rollback_history](#rollback_history)
12. [Mobile Sync](#12-mobile-sync)
    - [mobile_devices](#mobile_devices)
    - [mobile_instance_status](#mobile_instance_status)
    - [mobile_approval_requests](#mobile_approval_requests)
    - [mobile_commands](#mobile_commands)
13. [Usage & Billing](#13-usage--billing)
    - [usage_events](#usage_events)
14. [Queue Routing & Dispatch](#14-queue-routing--dispatch)
    - [queue_routing_rules](#queue_routing_rules)
    - [queue_dispatch](#queue_dispatch)
15. [Webhook Outbox](#15-webhook-outbox)
    - [webhook_outbox](#webhook_outbox)
16. [Step Logs](#16-step-logs)
    - [step_logs](#step_logs)
17. [Mermaid ER Diagram (Core)](#17-mermaid-er-diagram-core)
18. [State Machine: task_instances.state](#18-state-machine-task_instancesstate)
19. [State Machine: worker_tasks.state](#19-state-machine-worker_tasksstate)
20. [Cross-Tenant Isolation Rules](#20-cross-tenant-isolation-rules)
21. [Idempotency & Deduplication Rules](#21-idempotency--deduplication-rules)
22. [Cascade Deletion Map](#22-cascade-deletion-map)
23. [Deferred Migrations](#23-deferred-migrations)
24. [Down (Rollback) Migrations](#24-down-rollback-migrations)

---

### 1. Core Workflow Tables

#### `sequences`

Workflow definition registry. Each row is one version of a named workflow within a tenant+namespace. Running instances hold a FK to the specific version they were started on.

**Migration:** `001_create_sequences.sql`, `014_sequence_versioning.sql`, `036_sequence_status.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `tenant_id` | TEXT | NOT NULL | — | Multi-tenant discriminator |
| `namespace` | TEXT | NOT NULL | — | Logical grouping within a tenant |
| `name` | TEXT | NOT NULL | — | Workflow name |
| `definition` | JSONB | NOT NULL | — | Full workflow DAG definition |
| `version` | INTEGER | NOT NULL | `1` | Monotonically increasing within (tenant, namespace, name) |
| `deprecated` | BOOLEAN | NOT NULL | `FALSE` | Added in M14; new instances should avoid deprecated versions |
| `status` | TEXT | NOT NULL | `'production'` | Added in M36; lifecycle status (see values below) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Unique Index:** `idx_sequences_unique` on `(tenant_id, namespace, name, version)` — prevents duplicate versions per workflow per tenant.

**`status` value set (M36):** `'production'` (default; implied values: `'draft'`, `'archived'` are [INFERRED] as no CHECK constraint is defined, but the `DEFAULT 'production'` establishes the base value set).

**Indexes:**
- `idx_sequences_unique` UNIQUE on `(tenant_id, namespace, name, version)`
- `idx_sequences_status` on `(status)`

---

#### `task_instances`

The central workflow instance table. One row = one running (or completed) execution of a sequence.

**Migrations:** `002_create_task_instances.sql`, `009_create_indexes.sql`, `010_add_concurrency_and_idempotency.sql`, `017_sessions.sql`, `028_throughput_indexes.sql`, `030_fix_idempotency_key_per_tenant.sql`, `032_waiting_updated_at_index.sql`, `034_task_instance_fk_cascade.sql`, `043_instance_budget.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `sequence_id` | UUID | NOT NULL | — | FK → `sequences(id)` (RESTRICT on delete) |
| `tenant_id` | TEXT | NOT NULL | — | Multi-tenant discriminator |
| `namespace` | TEXT | NOT NULL | — | Inherited from sequence |
| `state` | TEXT | NOT NULL | `'scheduled'` | See state machine §18 |
| `next_fire_at` | TIMESTAMPTZ | NULL | — | When the scheduler should next advance this instance |
| `priority` | SMALLINT | NOT NULL | `1` | Higher = higher claim priority |
| `timezone` | TEXT | NOT NULL | `'UTC'` | Instance-level timezone for time-based steps |
| `metadata` | JSONB | NOT NULL | `'{}'` | Searchable key-value annotations (GIN indexed) |
| `context` | JSONB | NOT NULL | `'{}'` | Execution context / workflow variables |
| `concurrency_key` | TEXT | NULL | — | Added M10; groups instances for max_concurrency enforcement |
| `max_concurrency` | INTEGER | NULL | — | Added M10; max simultaneous running instances sharing concurrency_key |
| `idempotency_key` | TEXT | NULL | — | Added M10, corrected M30; prevents duplicate launches |
| `session_id` | UUID | NULL | — | Added M17; FK → `sessions(id)` (no cascade) |
| `parent_instance_id` | UUID | NULL | — | Added M17; self-reference FK → `task_instances(id)` ON DELETE SET NULL (M34) |
| `budget` | JSONB | NULL | — | Added M43; token/step caps `{max_input_tokens, max_output_tokens, max_total_tokens, max_steps}` |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Foreign Keys:**
- `sequence_id` → `sequences(id)` — no explicit ON DELETE (RESTRICT by PG default)
- `session_id` → `sessions(id)` — no explicit ON DELETE
- `parent_instance_id` → `task_instances(id)` ON DELETE SET NULL (M34)

**Unique Indexes:**
- `idx_instances_idempotency` / `uq_task_instances_tenant_idempotency` PARTIAL UNIQUE on `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`

**Indexes:**
| Index | Columns | Condition | Purpose |
|---|---|---|---|
| `idx_instances_fire` | `(next_fire_at)` | `state = 'scheduled'` | Scheduler hot path |
| `idx_instances_tenant` | `(tenant_id, state)` | — | Tenant-scoped listing |
| `idx_instances_sequence` | `(sequence_id, state)` | — | Per-sequence listing |
| `idx_instances_namespace` | `(namespace, state)` | — | Namespace-scoped listing |
| `idx_instances_metadata` | `GIN(metadata jsonb_path_ops)` | — | Metadata search queries |
| `idx_instances_concurrency` | `(concurrency_key)` | `concurrency_key IS NOT NULL AND state = 'running'` | Concurrency count |
| `idx_instances_claim_priority` | `(state, priority DESC, next_fire_at ASC)` | `state = 'scheduled'` | Batched claim priority order |
| `idx_instances_session` | `(session_id)` | `session_id IS NOT NULL` | Session lookup |
| `idx_instances_parent` | `(parent_instance_id)` | `parent_instance_id IS NOT NULL` | Child listing |
| `idx_task_instances_waiting_updated` | `(updated_at)` | `state = 'waiting'` | Stale waiting instance sweep |

---

#### `execution_tree`

DAG execution nodes. Each node represents one block (step) within an instance's execution. Forms a parent-child tree rooted at the sequence's entry block.

**Migrations:** `003_create_execution_tree.sql`, `009_create_indexes.sql`, `034_task_instance_fk_cascade.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `instance_id` | UUID | NOT NULL | — | FK → `task_instances(id)` ON DELETE CASCADE (M34) |
| `block_id` | TEXT | NOT NULL | — | Unique step identifier within the sequence definition |
| `parent_id` | UUID | NULL | — | Self-FK → `execution_tree(id)`; NULL = root node |
| `block_type` | TEXT | NOT NULL | — | Block kind (e.g. `step`, `branch`, `loop`, `fork`) |
| `branch_index` | SMALLINT | NULL | — | Which branch (for conditional blocks) |
| `state` | TEXT | NOT NULL | `'pending'` | Block execution state |
| `started_at` | TIMESTAMPTZ | NULL | — | When this block began execution |
| `completed_at` | TIMESTAMPTZ | NULL | — | When this block finished |

**Foreign Keys:**
- `instance_id` → `task_instances(id)` ON DELETE CASCADE
- `parent_id` → `execution_tree(id)` (no cascade — self-reference)

**Indexes:**
| Index | Columns | Condition |
|---|---|---|
| `idx_exec_tree_instance` | `(instance_id, state)` | — |
| `idx_exec_tree_parent` | `(parent_id)` | `parent_id IS NOT NULL` |

---

#### `block_outputs`

Per-block output records. After M27, **no uniqueness constraint** — multiple rows may exist per `(instance_id, block_id)` for loop/for_each iterations. Callers must use `ORDER BY created_at DESC LIMIT 1` to get the latest output.

**Migrations:** `004_create_block_outputs.sql`, `009_create_indexes.sql`, `027_block_outputs_multirow.sql`, `034_task_instance_fk_cascade.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `instance_id` | UUID | NOT NULL | — | FK → `task_instances(id)` ON DELETE CASCADE (M34) |
| `block_id` | TEXT | NOT NULL | — | Block step identifier |
| `output` | JSONB | NULL | — | Inline output payload (small outputs) |
| `output_ref` | TEXT | NULL | — | Reference key for externalized large outputs |
| `output_size` | INTEGER | NOT NULL | `0` | Byte size of output |
| `attempt` | SMALLINT | NOT NULL | `0` | Retry attempt number |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**IMPORTANT — M27 change:** The original `UNIQUE (instance_id, block_id)` constraint was dropped. The composite index `idx_block_outputs_instance_block_created` on `(instance_id, block_id, created_at DESC)` replaces it for efficient "latest output" lookups.

**Foreign Keys:**
- `instance_id` → `task_instances(id)` ON DELETE CASCADE (M34)

**Indexes:**
| Index | Columns | Notes |
|---|---|---|
| `idx_block_outputs_instance` | `(instance_id, block_id)` | Original index from M9 |
| `idx_block_outputs_instance_block_created` | `(instance_id, block_id, created_at DESC)` | Replaces UNIQUE from M27 |

---

### 2. Signal & Externalized State

#### `signal_inbox`

Inbound signals queued for delivery to a waiting instance. Used by wait-for-signal blocks.

**Migrations:** `007_create_signal_inbox.sql`, `009_create_indexes.sql`, `034_task_instance_fk_cascade.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `instance_id` | UUID | NOT NULL | — | FK → `task_instances(id)` ON DELETE CASCADE (M34) |
| `signal_type` | TEXT | NOT NULL | — | Signal name/type discriminator |
| `payload` | JSONB | NOT NULL | `'{}'` | Signal data |
| `delivered` | BOOLEAN | NOT NULL | `FALSE` | Whether consumed by the instance |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `delivered_at` | TIMESTAMPTZ | NULL | — | Timestamp of delivery |

**Foreign Keys:**
- `instance_id` → `task_instances(id)` ON DELETE CASCADE (M34)

**Indexes:**
- `idx_signal_inbox_pending` PARTIAL on `(instance_id)` WHERE `delivered = FALSE`

---

#### `externalized_state`

Large payload storage for workflow state that exceeds inline JSONB limits. Referenced by `output_ref` in `block_outputs`.

**Migrations:** `008_create_externalized_state.sql`, `009_create_indexes.sql`, `023_externalized_compression.sql`, `024_externalized_state_cascade.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `instance_id` | UUID | NOT NULL | — | FK → `task_instances(id)` ON DELETE CASCADE (M24) |
| `ref_key` | TEXT | NOT NULL | — | UNIQUE lookup key (referenced by `block_outputs.output_ref`) |
| `payload` | JSONB | NULL | — | Inline JSON payload; NULL when `compression IS NOT NULL` (M23) |
| `compression` | TEXT | NULL | — | Added M23; `NULL` = uncompressed, `'zstd'` = compressed |
| `size_bytes` | BIGINT | NOT NULL | `0` | Added M23 |
| `payload_bytes` | BYTEA | NULL | — | Added M23; compressed payload when `compression = 'zstd'` |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `expires_at` | TIMESTAMPTZ | NULL | — | TTL for GC sweeper (default 30d TTL enforced in app) |

**Foreign Keys:**
- `instance_id` → `task_instances(id)` ON DELETE CASCADE (M24)

**Constraint:** `ref_key` is UNIQUE globally.

**Indexes:**
- `idx_externalized_expires` PARTIAL on `(expires_at)` WHERE `expires_at IS NOT NULL`
- `idx_externalized_state_instance` on `(instance_id)` (added M23)

---

#### `instance_kv_state`

Per-instance key-value store for arbitrary workflow state. Used by `set_state`/`get_state`/`delete_state` built-in handlers.

**Migration:** `033_instance_kv_state.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `instance_id` | UUID | NOT NULL | — | PK (composite), FK → `task_instances(id)` ON DELETE CASCADE |
| `key` | TEXT | NOT NULL | — | PK (composite) |
| `value` | JSONB | NOT NULL | — | Stored state value |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Primary Key:** `(instance_id, key)`

**Foreign Keys:**
- `instance_id` → `task_instances(id)` ON DELETE CASCADE

---

### 3. Scheduling

#### `cron_schedules`

Cron-triggered workflow schedules. One row = one schedule that fires a sequence on a cron expression.

**Migrations:** `011_create_cron_schedules.sql`, `046_cron_overlap_policy.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `tenant_id` | TEXT | NOT NULL | — | Multi-tenant discriminator |
| `namespace` | TEXT | NOT NULL | — | Logical grouping |
| `sequence_id` | UUID | NOT NULL | — | FK → `sequences(id)` |
| `cron_expr` | TEXT | NOT NULL | — | Cron expression string |
| `timezone` | TEXT | NOT NULL | `'UTC'` | IANA timezone name |
| `enabled` | BOOLEAN | NOT NULL | `TRUE` | Whether this schedule is active |
| `metadata` | JSONB | NOT NULL | `'{}'` | Instance metadata to stamp on spawned instances |
| `last_triggered_at` | TIMESTAMPTZ | NULL | — | When this schedule last fired |
| `next_fire_at` | TIMESTAMPTZ | NULL | — | Pre-computed next fire time |
| `overlap_policy` | TEXT | NOT NULL | `'allow'` | Added M46; see values below |
| `skipped_fires` | BIGINT | NOT NULL | `0` | Added M46; monotonic skip counter |
| `last_skipped_at` | TIMESTAMPTZ | NULL | — | Added M46 |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Foreign Keys:**
- `sequence_id` → `sequences(id)` (no explicit ON DELETE)

**`overlap_policy` value set (M46):** `'allow'` (default), `'skip'`, `'buffer_one'`, `'cancel_previous'`

**Indexes:**
- `idx_cron_next_fire` PARTIAL on `(next_fire_at)` WHERE `enabled = TRUE`

---

#### `sessions`

Cross-instance shared state. Multiple task_instances can share a session for coordinated workflows.

**Migration:** `017_sessions.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `tenant_id` | TEXT | NOT NULL | — | Multi-tenant discriminator |
| `session_key` | TEXT | NOT NULL | — | User-defined session identifier |
| `data` | JSONB | NOT NULL | `'{}'` | Shared session data |
| `state` | TEXT | NOT NULL | `'active'` | Session state |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `expires_at` | TIMESTAMPTZ | NULL | — | Session TTL |

**Unique Index:** `idx_sessions_tenant_key` UNIQUE on `(tenant_id, session_key)`

---

### 4. Worker Infrastructure

#### `worker_tasks`

External worker task queue. One row = one block dispatch to an external worker process (polyglot handlers via gRPC/HTTP polling).

**Migrations:** `012_create_worker_tasks.sql`, `018_task_queue_routing.sql`, `034_task_instance_fk_cascade.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `instance_id` | UUID | NOT NULL | — | FK → `task_instances(id)` ON DELETE CASCADE (M34) |
| `block_id` | TEXT | NOT NULL | — | Block identifier within the instance |
| `handler_name` | TEXT | NOT NULL | — | Handler to invoke |
| `params` | JSONB | NOT NULL | `'{}'` | Step parameters |
| `context` | JSONB | NOT NULL | `'{}'` | Execution context |
| `attempt` | SMALLINT | NOT NULL | `0` | Retry attempt count |
| `timeout_ms` | BIGINT | NULL | — | Per-task timeout |
| `state` | TEXT | NOT NULL | `'pending'` | See state machine §19 |
| `queue_name` | TEXT | NULL | — | Added M18; named queue for routing |
| `worker_id` | TEXT | NULL | — | Worker that claimed this task |
| `claimed_at` | TIMESTAMPTZ | NULL | — | When claimed |
| `heartbeat_at` | TIMESTAMPTZ | NULL | — | Last heartbeat from worker |
| `completed_at` | TIMESTAMPTZ | NULL | — | When task finished |
| `output` | JSONB | NULL | — | Task result payload |
| `error_message` | TEXT | NULL | — | Error description on failure |
| `error_retryable` | BOOLEAN | NULL | — | Whether error permits retry |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Unique:** `(instance_id, block_id)` — one active task per block per instance.

**Foreign Keys:**
- `instance_id` → `task_instances(id)` ON DELETE CASCADE (M34)

**Indexes:**
| Index | Columns | Condition | Purpose |
|---|---|---|---|
| `idx_worker_tasks_poll` | `(handler_name, created_at)` | `state = 'pending'` | Worker poll hot path |
| `idx_worker_tasks_heartbeat` | `(heartbeat_at)` | `state = 'claimed'` | Stale task reaper |
| `idx_worker_tasks_queue` | `(queue_name, state)` | `queue_name IS NOT NULL` | Queue-based routing |

---

#### `worker_registrations`

Worker fleet registry. One row per `(worker_id, handler_name)` pair, upserted on every poll cycle.

**Migration:** `045_worker_registrations.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `worker_id` | TEXT | NOT NULL | — | PK (composite) |
| `handler_name` | TEXT | NOT NULL | — | PK (composite) |
| `queue_name` | TEXT | NULL | — | Queue this worker instance serves |
| `version` | TEXT | NULL | — | Worker build/deploy version |
| `tenant_id` | TEXT | NULL | — | Optional tenant scope |
| `last_seen_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Liveness indicator |

**Primary Key:** `(worker_id, handler_name)`

**Indexes:**
- `idx_worker_registrations_last_seen` on `(last_seen_at)` — fleet liveness scan

---

#### `worker_commands`

Control channel for worker processes. Queued commands (drain/reload/ping) polled by workers.

**Migration:** `049_worker_commands.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `worker_id` | TEXT | NOT NULL | — | Target worker identifier |
| `command` | TEXT | NOT NULL | — | Command type (`drain`, `reload`, `ping`) |
| `payload` | JSONB | NOT NULL | `'{}'` | Command-specific payload |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Indexes:**
- `idx_worker_commands_worker` on `(worker_id, created_at)`

---

#### `worker_version_pins`

Minimum worker version gates per `(tenant, handler)`. Workers below the pinned version receive no tasks.

**Migration:** `050_worker_version_pins.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `tenant_id` | TEXT | NOT NULL | — | PK (composite) |
| `handler_name` | TEXT | NOT NULL | — | PK (composite) |
| `min_version` | TEXT | NOT NULL | — | Minimum required version string |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Primary Key:** `(tenant_id, handler_name)`

---

### 5. Rate Limiting & Resource Pools

#### `rate_limits`

Sliding-window rate limit counters per `(tenant, resource_key)`.

**Migration:** `005_create_rate_limits.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `tenant_id` | TEXT | NOT NULL | — | Multi-tenant discriminator |
| `resource_key` | TEXT | NOT NULL | — | Resource being rate-limited |
| `max_count` | INTEGER | NOT NULL | — | Maximum allowed count per window |
| `window_seconds` | INTEGER | NOT NULL | — | Window duration in seconds |
| `current_count` | INTEGER | NOT NULL | `0` | Current count in window |
| `window_start` | TIMESTAMPTZ | NOT NULL | `NOW()` | Window start time |

**Unique:** `(tenant_id, resource_key)`

**Indexes:**
- `idx_rate_limits_key` on `(tenant_id, resource_key)`

---

#### `resource_pools`

Named resource pool definitions. Supports round-robin, weighted, and warmup allocation strategies.

**Migrations:** `006_create_resource_pools.sql`, `013_resource_pools_v2.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `tenant_id` | TEXT | NOT NULL | — | Multi-tenant discriminator |
| `name` | TEXT | NOT NULL | — | Pool name |
| `rotation` | TEXT | NOT NULL | `'round_robin'` | **Legacy column** — superseded by `strategy` in M13 |
| `resources` | JSONB | NOT NULL | `'[]'` | **Legacy** inline resource list — superseded by `pool_resources` table |
| `strategy` | TEXT | NOT NULL | `'round_robin'` | Added M13; allocation strategy |
| `round_robin_index` | INTEGER | NOT NULL | `0` | Added M13; cursor for round-robin |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Added M13 |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Added M13 |

**Unique:** `(tenant_id, name)`

---

#### `pool_resources`

Individual resources within a pool. Supports daily cap and warmup scheduling.

**Migration:** `013_resource_pools_v2.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `pool_id` | UUID | NOT NULL | — | FK → `resource_pools(id)` ON DELETE CASCADE |
| `resource_key` | TEXT | NOT NULL | — | Resource identifier (e.g. API key, email address) |
| `name` | TEXT | NOT NULL | — | Display name |
| `weight` | INTEGER | NOT NULL | `1` | Relative selection weight |
| `enabled` | BOOLEAN | NOT NULL | `TRUE` | Whether resource is active |
| `daily_cap` | INTEGER | NOT NULL | `0` | Max daily uses (0 = unlimited) |
| `daily_usage` | INTEGER | NOT NULL | `0` | Current day's usage count |
| `daily_usage_date` | DATE | NULL | — | Date for which `daily_usage` is counted |
| `warmup_start` | DATE | NULL | — | Warmup period start date |
| `warmup_days` | INTEGER | NOT NULL | `0` | Duration of warmup in days |
| `warmup_start_cap` | INTEGER | NOT NULL | `0` | Daily cap at warmup start (ramps to `daily_cap`) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Foreign Keys:**
- `pool_id` → `resource_pools(id)` ON DELETE CASCADE

**Indexes:**
- `idx_pool_resources_pool_id` on `(pool_id)`
- `idx_pool_resources_resource_key` on `(resource_key)`

---

### 6. Triggers & Plugins

#### `triggers`

Persisted event-driven trigger definitions. Supports webhook and polling trigger types.

**Migration:** `020_triggers.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `slug` | TEXT | NOT NULL | — | PK; URL-safe identifier |
| `sequence_name` | TEXT | NOT NULL | — | Target sequence to launch |
| `version` | INTEGER | NULL | — | Target sequence version (NULL = latest) |
| `tenant_id` | TEXT | NOT NULL | — | Multi-tenant discriminator |
| `namespace` | TEXT | NOT NULL | `'default'` | Namespace |
| `enabled` | BOOLEAN | NOT NULL | `TRUE` | Whether trigger is active |
| `secret` | TEXT | NULL | — | HMAC secret for webhook signature verification |
| `trigger_type` | TEXT | NOT NULL | `'webhook'` | `'webhook'` or `'activepieces_poll'` (known values) |
| `config` | TEXT | NOT NULL | `'{}'` | JSON config blob (stored as TEXT) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Indexes:**
- `idx_triggers_tenant` on `(tenant_id)`

---

#### `trigger_poll_state`

Runtime cursor state for polling triggers (`trigger_type = 'activepieces_poll'`). Kept separate from `triggers` to avoid lost-update races on concurrent API edits.

**Migration:** `044_trigger_poll_state.sql`
**Down migration available:** `down/044_trigger_poll_state.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `slug` | TEXT | NOT NULL | — | PK, FK → `triggers(slug)` ON DELETE CASCADE |
| `state` | TEXT | NOT NULL | `'null'` | Opaque cursor blob from last successful poll |
| `last_poll_at` | TIMESTAMPTZ | NULL | — | When last poll completed |
| `last_error` | TEXT | NULL | — | Error from most recent failed poll; NULL after success |
| `consecutive_failures` | INTEGER | NOT NULL | `0` | Failed poll counter; reset to 0 on success |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Foreign Keys:**
- `slug` → `triggers(slug)` ON DELETE CASCADE

---

#### `plugins`

Plugin registry mapping handler names to external WASM or gRPC implementations.

**Migration:** `021_plugins.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `name` | TEXT | NOT NULL | — | PK; handler name |
| `plugin_type` | TEXT | NOT NULL | `'wasm'` | `'wasm'` or `'grpc'` (known values) |
| `source` | TEXT | NOT NULL | — | Path/URL to plugin binary or endpoint |
| `tenant_id` | TEXT | NOT NULL | `''` | Empty string = global plugin |
| `enabled` | BOOLEAN | NOT NULL | `TRUE` | — |
| `config` | TEXT | NOT NULL | `'{}'` | JSON config (stored as TEXT) |
| `description` | TEXT | NULL | — | Human-readable description |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Indexes:**
- `idx_plugins_tenant` on `(tenant_id)`

---

### 7. Credentials & API Keys

#### `credentials`

Shared secrets registry. Raw secrets never stored; referenced from step params via `credentials://<id>` URI scheme.

**Migration:** `022_credentials.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NOT NULL | — | PK; user-defined identifier |
| `tenant_id` | TEXT | NOT NULL | `''` | Empty string = global credential |
| `name` | TEXT | NOT NULL | — | Display name |
| `kind` | TEXT | NOT NULL | `'api_key'` | See value set below |
| `value` | TEXT | NOT NULL | — | Secret value (access controlled) |
| `expires_at` | TIMESTAMPTZ | NULL | — | Expiry for OAuth2 tokens |
| `refresh_url` | TEXT | NULL | — | OAuth2 token refresh endpoint |
| `refresh_token` | TEXT | NULL | — | OAuth2 refresh token |
| `enabled` | BOOLEAN | NOT NULL | `TRUE` | — |
| `description` | TEXT | NULL | — | — |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**`kind` value set:** `'api_key'` (default); `'oauth2'` (triggers refresh loop); additional values [INFERRED] as no CHECK constraint.

**Indexes:**
- `idx_credentials_tenant` on `(tenant_id)`
- `idx_credentials_expires` PARTIAL on `(expires_at)` WHERE `kind = 'oauth2' AND refresh_url IS NOT NULL AND enabled = TRUE` — background refresh loop scan

---

#### `api_keys`

Per-tenant API keys for HTTP authentication. Secret is never stored; only the SHA-256 hash is persisted.

**Migration:** `042_api_keys.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NOT NULL | — | PK; logical key ID |
| `tenant_id` | TEXT | NOT NULL | — | Multi-tenant discriminator |
| `name` | TEXT | NOT NULL | `''` | Human-readable label |
| `key_hash` | TEXT | NOT NULL | — | SHA-256 of the raw secret (UNIQUE) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `last_used_at` | TIMESTAMPTZ | NULL | — | Last authentication timestamp |
| `expires_at` | TIMESTAMPTZ | NULL | — | NULL = never expires |
| `revoked` | BOOLEAN | NOT NULL | `FALSE` | Soft-delete flag |

**Unique:** `key_hash` (prevents hash collision attacks / duplicate keys)

**Indexes:**
- `idx_api_keys_tenant` on `(tenant_id)`

---

### 8. Audit, Checkpoints & Telemetry

#### `audit_log`

Append-only lifecycle event log. Records state transitions and other significant events for each instance.

**Migration:** `016_audit_log.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `instance_id` | UUID | NOT NULL | — | FK → `task_instances(id)` ON DELETE CASCADE |
| `tenant_id` | TEXT | NOT NULL | — | Multi-tenant discriminator |
| `event_type` | TEXT | NOT NULL | — | Event category (e.g. `state_transition`, `signal_received`) |
| `from_state` | TEXT | NULL | — | Previous state (for transitions) |
| `to_state` | TEXT | NULL | — | New state (for transitions) |
| `block_id` | TEXT | NULL | — | Which block triggered the event |
| `details` | JSONB | NOT NULL | `'{}'` | Event-specific details |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Foreign Keys:**
- `instance_id` → `task_instances(id)` ON DELETE CASCADE

**Indexes:**
- `idx_audit_log_instance` on `(instance_id, created_at)`
- `idx_audit_log_tenant` on `(tenant_id, created_at)`

---

#### `checkpoints`

Execution state snapshots for efficient recovery of long-running instances.

**Migration:** `015_checkpoints.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `instance_id` | UUID | NOT NULL | — | FK → `task_instances(id)` ON DELETE CASCADE |
| `checkpoint_data` | JSONB | NOT NULL | — | Full serialized execution state |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Foreign Keys:**
- `instance_id` → `task_instances(id)` ON DELETE CASCADE

**Indexes:**
- `idx_checkpoints_instance_id` on `(instance_id)`

---

#### `telemetry_mobile_events`

Mobile SDK event ingestion table (non-workflow data).

**Migration:** `035_telemetry.sql`
**Down migration available:** `down/035_telemetry.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGSERIAL | NOT NULL | auto | PK (sequential integer) |
| `event_type` | TEXT | NOT NULL | — | Event category |
| `payload` | JSONB | NOT NULL | `'{}'` | Event data |
| `device_id` | TEXT | NULL | — | Device identifier |
| `os_name` | TEXT | NULL | — | `'ios'`, `'android'`, etc. |
| `os_version` | TEXT | NULL | — | — |
| `app_version` | TEXT | NULL | — | — |
| `sdk_version` | TEXT | NULL | — | — |
| `tenant_id` | TEXT | NULL | — | May be NULL for pre-auth events |
| `received_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Server receipt time |
| `created_at` | TIMESTAMPTZ | NOT NULL | — | Client event creation time (no default — required) |

**Indexes:**
- `idx_telemetry_events_type` on `(event_type)`
- `idx_telemetry_events_device` on `(device_id)`
- `idx_telemetry_events_tenant` on `(tenant_id)`
- `idx_telemetry_events_received` on `(received_at)`

---

#### `telemetry_mobile_errors`

Mobile SDK error/crash report ingestion.

**Migration:** `035_telemetry.sql`
**Down migration available:** `down/035_telemetry.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGSERIAL | NOT NULL | auto | PK |
| `error_type` | TEXT | NOT NULL | — | Error category |
| `message` | TEXT | NOT NULL | — | Error message |
| `stack_trace` | TEXT | NULL | — | Full stack trace |
| `device_id` | TEXT | NULL | — | — |
| `os_name` | TEXT | NULL | — | — |
| `os_version` | TEXT | NULL | — | — |
| `app_version` | TEXT | NULL | — | — |
| `sdk_version` | TEXT | NULL | — | — |
| `tenant_id` | TEXT | NULL | — | — |
| `instance_id` | TEXT | NULL | — | NOTE: stored as TEXT, not UUID — no FK |
| `sequence_name` | TEXT | NULL | — | — |
| `received_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Indexes:**
- `idx_telemetry_errors_device` on `(device_id)`
- `idx_telemetry_errors_tenant` on `(tenant_id)`
- `idx_telemetry_errors_received` on `(received_at)`

---

### 9. Cluster & Circuit Breakers

#### `cluster_nodes`

Multi-node coordination registry. Tracks live engine nodes for leader election and drain operations.

**Migration:** `019_cluster_nodes.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `name` | TEXT | NOT NULL | — | Node name |
| `status` | TEXT | NOT NULL | `'active'` | `'active'`, `'draining'`, `'inactive'` [INFERRED] |
| `registered_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `last_heartbeat_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Liveness indicator |
| `drain` | BOOLEAN | NOT NULL | `FALSE` | Whether node is being drained |

**Indexes:**
- `idx_cluster_nodes_status` on `(status)`

---

#### `circuit_breakers`

Persisted open circuit breaker state. Only tripped (open) breakers are stored; closed state is in-memory only. Breakers are per-tenant to prevent noisy tenants from affecting others.

**Migration:** `029_circuit_breakers.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `tenant_id` | TEXT | NOT NULL | — | PK (composite) |
| `handler` | TEXT | NOT NULL | — | PK (composite) |
| `state` | TEXT | NOT NULL | — | `'open'`, `'half_open'`, `'closed'` |
| `failure_count` | INTEGER | NOT NULL | — | Current failure count |
| `failure_threshold` | INTEGER | NOT NULL | — | Threshold that trips the breaker |
| `cooldown_secs` | BIGINT | NOT NULL | — | Seconds before transitioning to half_open |
| `opened_at` | TIMESTAMPTZ | NULL | — | When the breaker opened |

**Primary Key:** `(tenant_id, handler)`

**Indexes:**
- `idx_circuit_breakers_open` PARTIAL on `(state)` WHERE `state = 'open'`

---

### 10. Event Deduplication

#### `emit_event_dedupe`

Deduplication guard for the `emit_event` built-in handler. Prevents duplicate child instance launches when retrying. Rows are GC'd by the externalized-state TTL sweeper (default 30d).

**Migrations:** `025_emit_event_dedupe.sql` (initial v1, PK was `(parent_instance_id, dedupe_key)`), `026_emit_event_dedupe_scope.sql` (replaced v1 with v2), `031_emit_dedupe_child_fk.sql`
**Down migration available:** `down/026_emit_event_dedupe_scope.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `scope_kind` | TEXT | NOT NULL | — | PK (composite); `'parent'` or `'tenant'` |
| `scope_value` | TEXT | NOT NULL | — | PK (composite); parent UUID as TEXT (for `'parent'`) or tenant_id (for `'tenant'`) |
| `dedupe_key` | TEXT | NOT NULL | — | PK (composite) |
| `child_instance_id` | UUID | NOT NULL | — | FK → `task_instances(id)` ON DELETE CASCADE (M31) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Primary Key:** `(scope_kind, scope_value, dedupe_key)`

**Foreign Keys:**
- `child_instance_id` → `task_instances(id)` ON DELETE CASCADE (added M31) — deleting a child instance removes its dedupe guard, allowing re-emission

**Indexes:**
- `emit_event_dedupe_created_at_idx` on `(created_at)` — TTL sweeper

---

### 11. Rollback Policies

#### `rollback_policies`

Error budget / auto-rollback policy definitions. When error rate exceeds threshold within a time window, the policy triggers a rollback.

**Migrations:** `037_rollback_policies.sql`, `040_rollback_policy_columns.sql`
**Down migration available:** `down/037_rollback_policies.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGSERIAL | NOT NULL | auto | PK |
| `tenant_id` | TEXT | NOT NULL | — | Multi-tenant discriminator |
| `sequence_name` | TEXT | NOT NULL | — | Target sequence name |
| `error_rate_threshold` | REAL | NOT NULL | `0.05` | Error rate (0.0–1.0) that triggers rollback |
| `time_window_secs` | INTEGER | NOT NULL | `300` | Window over which error rate is measured |
| `enabled` | INTEGER | NOT NULL | `1` | `1` = enabled, `0` = disabled (integer, not BOOLEAN) |
| `cooldown_secs` | INTEGER | NOT NULL | `3600` | Added M40; min seconds between rollback triggers |
| `confirmation_window_secs` | INTEGER | NOT NULL | `60` | Added M40; time to confirm threshold breach before acting |
| `webhook_url` | TEXT | NULL | — | Added M40; notification URL on rollback |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Unique:** `(tenant_id, sequence_name)`

**Indexes:**
- `idx_rollback_policies_tenant` on `(tenant_id)`
- `idx_rollback_policies_enabled` on `(enabled)`

---

#### `rollback_history`

Rollback event log.

**Migration:** `037_rollback_policies.sql`
**Down migration available:** `down/037_rollback_policies.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGSERIAL | NOT NULL | auto | PK |
| `tenant_id` | TEXT | NOT NULL | — | — |
| `sequence_name` | TEXT | NOT NULL | — | — |
| `triggered_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `error_rate` | REAL | NOT NULL | — | Measured error rate at trigger |
| `threshold` | REAL | NOT NULL | — | Policy threshold at trigger |
| `previous_manifest_version` | TEXT | NULL | — | Version rolled back from |
| `reason` | TEXT | NOT NULL | `'threshold_breach'` | Rollback trigger reason |
| `alert_sent` | INTEGER | NOT NULL | `0` | `0` or `1` (integer flag) |

**Indexes:**
- `idx_rollback_history_tenant` on `(tenant_id, sequence_name)`
- `idx_rollback_history_triggered` on `(triggered_at)`

---

### 12. Mobile Sync

#### `mobile_devices`

Device registration for mobile SDK push notifications and sync.

**Migration:** `038_mobile_sync.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `device_id` | TEXT | NOT NULL | — | PK |
| `tenant_id` | TEXT | NOT NULL | `''` | Empty = global |
| `push_token` | TEXT | NULL | — | APNs/FCM push token |
| `platform` | TEXT | NOT NULL | `'ios'` | `'ios'` or `'android'` |
| `app_version` | TEXT | NULL | — | — |
| `active` | BOOLEAN | NOT NULL | `TRUE` | — |
| `last_sync_at` | TIMESTAMPTZ | NULL | — | Last sync time |
| `registered_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

---

#### `mobile_instance_status`

Denormalized instance status view cached for mobile device sync.

**Migration:** `038_mobile_sync.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `device_id` | TEXT | NOT NULL | — | PK (composite) |
| `instance_id` | TEXT | NOT NULL | — | PK (composite); TEXT, not UUID — no FK |
| `sequence_name` | TEXT | NULL | — | — |
| `state` | TEXT | NOT NULL | — | Instance state |
| `current_step` | TEXT | NULL | — | — |
| `handler` | TEXT | NULL | — | — |
| `context_summary` | TEXT | NULL | — | — |
| `steps` | TEXT | NULL | — | Serialized step list |
| `updated_at` | TIMESTAMPTZ | NOT NULL | — | No default — required |

**Primary Key:** `(device_id, instance_id)`

---

#### `mobile_approval_requests`

Human-in-the-loop approval requests routed to a mobile device.

**Migration:** `038_mobile_sync.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NOT NULL | — | PK |
| `device_id` | TEXT | NOT NULL | — | Target device |
| `tenant_id` | TEXT | NOT NULL | `''` | — |
| `instance_id` | TEXT | NOT NULL | — | TEXT, not UUID — no FK |
| `block_id` | TEXT | NOT NULL | — | — |
| `sequence_name` | TEXT | NULL | — | — |
| `prompt` | TEXT | NULL | — | Human-readable question |
| `choices` | TEXT | NULL | — | Serialized choices JSON |
| `store_as` | TEXT | NULL | — | Variable name to store resolution |
| `timeout_secs` | INTEGER | NULL | — | Auto-reject timeout |
| `metadata` | TEXT | NULL | — | JSON metadata (stored as TEXT) |
| `state` | TEXT | NOT NULL | `'pending'` | `'pending'`, `'approved'`, `'rejected'`, `'timed_out'` [INFERRED] |
| `resolution` | TEXT | NULL | — | User's choice |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `resolved_at` | TIMESTAMPTZ | NULL | — | — |

**Unique:** `(device_id, instance_id, block_id)`

**Indexes:**
- `idx_mobile_approvals_state` on `(state)`
- `idx_mobile_approvals_device` on `(device_id)`

---

#### `mobile_commands`

Command inbox for mobile devices (e.g., push config updates).

**Migration:** `038_mobile_sync.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | TEXT | NOT NULL | — | PK |
| `device_id` | TEXT | NOT NULL | — | Target device |
| `command_type` | TEXT | NOT NULL | — | Command category |
| `payload` | TEXT | NOT NULL | `'{}'` | JSON payload (stored as TEXT) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `acked_at` | TIMESTAMPTZ | NULL | — | NULL = pending |

**Indexes:**
- `idx_mobile_commands_device_pending` PARTIAL on `(device_id)` WHERE `acked_at IS NULL`

---

### 13. Usage & Billing

#### `usage_events`

Structured usage/billing events (e.g. LLM token consumption). Emitted by `llm_call`/`agent` handlers for control plane cost aggregation.

**Migration:** `041_usage_events.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | BIGSERIAL | NOT NULL | auto | PK |
| `tenant_id` | TEXT | NOT NULL | — | Multi-tenant discriminator |
| `instance_id` | UUID | NULL | — | Optional FK (no constraint defined) |
| `block_id` | TEXT | NULL | — | Block that emitted this event |
| `kind` | TEXT | NOT NULL | — | Event kind (e.g. `'llm_tokens'`) |
| `model` | TEXT | NOT NULL | `''` | Model name |
| `input_tokens` | BIGINT | NOT NULL | `0` | — |
| `output_tokens` | BIGINT | NOT NULL | `0` | — |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Indexes:**
- `idx_usage_tenant_created` on `(tenant_id, created_at)`
- `idx_usage_kind_model` on `(kind, model)`

---

### 14. Queue Routing & Dispatch

#### `queue_routing_rules`

Dynamic task-queue routing override rules evaluated at enqueue time. Highest-priority matching rule wins.

**Migration:** `048_queue_routing_rules.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `tenant_id` | TEXT | NOT NULL | — | Multi-tenant discriminator |
| `handler_name` | TEXT | NOT NULL | — | Handler name to match |
| `match_queue` | TEXT | NULL | — | Optional declared queue to match (NULL = match any) |
| `queue_override` | TEXT | NOT NULL | — | Queue to route to |
| `priority` | INTEGER | NOT NULL | `0` | Higher = higher priority |
| `enabled` | BOOLEAN | NOT NULL | `TRUE` | — |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Indexes:**
- `idx_queue_routing_tenant_handler` on `(tenant_id, handler_name, priority DESC)`

---

#### `queue_dispatch`

Per-queue dispatch mode configuration: `poll` (workers pull) or `push` (engine POSTs to `push_url`).

**Migration:** `051_queue_dispatch.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `tenant_id` | TEXT | NOT NULL | — | PK (composite) |
| `queue_name` | TEXT | NOT NULL | — | PK (composite) |
| `mode` | TEXT | NOT NULL | `'poll'` | `'poll'` or `'push'` |
| `push_url` | TEXT | NULL | — | Delivery URL for push mode |
| `secret` | TEXT | NULL | — | HMAC signing secret for push mode |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Primary Key:** `(tenant_id, queue_name)`

---

### 15. Webhook Outbox

#### `webhook_outbox`

Dead-letter queue for failed webhook deliveries. Deliveries that exhaust retries are parked here for operator inspection and manual redelivery.

**Migration:** `047_webhook_outbox.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `url` | TEXT | NOT NULL | — | Target URL |
| `event_type` | TEXT | NOT NULL | — | Event type |
| `instance_id` | UUID | NULL | — | Associated instance (no FK constraint) |
| `payload` | JSONB | NOT NULL | — | Full serialized `WebhookEvent` for replay |
| `attempts` | INTEGER | NOT NULL | `0` | Delivery attempts before parking |
| `last_error` | TEXT | NULL | — | Last HTTP error or transport error |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | — |

**Indexes:**
- `idx_webhook_outbox_created` on `(created_at DESC)`

---

### 16. Step Logs

#### `step_logs`

Per-step log lines attached by workers or the engine's in-process capture layer.

**Migration:** `052_step_logs.sql`

| Column | SQL Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | — | PK |
| `instance_id` | UUID | NOT NULL | — | No FK constraint defined |
| `block_id` | TEXT | NOT NULL | — | — |
| `ts` | TIMESTAMPTZ | NOT NULL | — | Log entry timestamp (no default — required) |
| `level` | TEXT | NOT NULL | — | `'debug'`, `'info'`, `'warn'`, `'error'` [INFERRED] |
| `message` | TEXT | NOT NULL | — | Log message |

**Indexes:**
- `idx_step_logs_instance` on `(instance_id, ts)`

---

### 17. Mermaid ER Diagram (Core)

```mermaid
erDiagram
    sequences {
        UUID id PK
        TEXT tenant_id
        TEXT namespace
        TEXT name
        JSONB definition
        INTEGER version
        BOOLEAN deprecated
        TEXT status
        TIMESTAMPTZ created_at
    }

    task_instances {
        UUID id PK
        UUID sequence_id FK
        TEXT tenant_id
        TEXT namespace
        TEXT state
        TIMESTAMPTZ next_fire_at
        SMALLINT priority
        TEXT timezone
        JSONB metadata
        JSONB context
        TEXT concurrency_key
        INTEGER max_concurrency
        TEXT idempotency_key
        UUID session_id FK
        UUID parent_instance_id FK
        JSONB budget
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    execution_tree {
        UUID id PK
        UUID instance_id FK
        TEXT block_id
        UUID parent_id FK
        TEXT block_type
        SMALLINT branch_index
        TEXT state
        TIMESTAMPTZ started_at
        TIMESTAMPTZ completed_at
    }

    block_outputs {
        UUID id PK
        UUID instance_id FK
        TEXT block_id
        JSONB output
        TEXT output_ref
        INTEGER output_size
        SMALLINT attempt
        TIMESTAMPTZ created_at
    }

    signal_inbox {
        UUID id PK
        UUID instance_id FK
        TEXT signal_type
        JSONB payload
        BOOLEAN delivered
        TIMESTAMPTZ created_at
        TIMESTAMPTZ delivered_at
    }

    externalized_state {
        UUID id PK
        UUID instance_id FK
        TEXT ref_key
        JSONB payload
        TEXT compression
        BIGINT size_bytes
        BYTEA payload_bytes
        TIMESTAMPTZ created_at
        TIMESTAMPTZ expires_at
    }

    instance_kv_state {
        UUID instance_id FK
        TEXT key
        JSONB value
        TIMESTAMPTZ updated_at
    }

    checkpoints {
        UUID id PK
        UUID instance_id FK
        JSONB checkpoint_data
        TIMESTAMPTZ created_at
    }

    audit_log {
        UUID id PK
        UUID instance_id FK
        TEXT tenant_id
        TEXT event_type
        TEXT from_state
        TEXT to_state
        TEXT block_id
        JSONB details
        TIMESTAMPTZ created_at
    }

    worker_tasks {
        UUID id PK
        UUID instance_id FK
        TEXT block_id
        TEXT handler_name
        JSONB params
        JSONB context
        SMALLINT attempt
        BIGINT timeout_ms
        TEXT state
        TEXT queue_name
        TEXT worker_id
        TIMESTAMPTZ claimed_at
        TIMESTAMPTZ heartbeat_at
        TIMESTAMPTZ completed_at
        JSONB output
        TEXT error_message
        BOOLEAN error_retryable
        TIMESTAMPTZ created_at
    }

    emit_event_dedupe {
        TEXT scope_kind PK
        TEXT scope_value PK
        TEXT dedupe_key PK
        UUID child_instance_id FK
        TIMESTAMPTZ created_at
    }

    sessions {
        UUID id PK
        TEXT tenant_id
        TEXT session_key
        JSONB data
        TEXT state
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
        TIMESTAMPTZ expires_at
    }

    cron_schedules {
        UUID id PK
        TEXT tenant_id
        TEXT namespace
        UUID sequence_id FK
        TEXT cron_expr
        TEXT timezone
        BOOLEAN enabled
        JSONB metadata
        TEXT overlap_policy
        BIGINT skipped_fires
        TIMESTAMPTZ last_triggered_at
        TIMESTAMPTZ next_fire_at
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    triggers {
        TEXT slug PK
        TEXT sequence_name
        INTEGER version
        TEXT tenant_id
        TEXT namespace
        BOOLEAN enabled
        TEXT secret
        TEXT trigger_type
        TEXT config
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    trigger_poll_state {
        TEXT slug PK_FK
        TEXT state
        TIMESTAMPTZ last_poll_at
        TEXT last_error
        INTEGER consecutive_failures
        TIMESTAMPTZ updated_at
    }

    resource_pools {
        UUID id PK
        TEXT tenant_id
        TEXT name
        TEXT strategy
        INTEGER round_robin_index
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    pool_resources {
        UUID id PK
        UUID pool_id FK
        TEXT resource_key
        TEXT name
        INTEGER weight
        BOOLEAN enabled
        INTEGER daily_cap
        INTEGER daily_usage
        DATE daily_usage_date
        DATE warmup_start
        INTEGER warmup_days
        INTEGER warmup_start_cap
        TIMESTAMPTZ created_at
    }

    sequences ||--o{ task_instances : "has instances"
    sessions ||--o{ task_instances : "groups instances"
    task_instances ||--o{ task_instances : "parent_instance_id"
    task_instances ||--o{ execution_tree : "tree nodes"
    execution_tree ||--o{ execution_tree : "parent_id"
    task_instances ||--o{ block_outputs : "block outputs"
    task_instances ||--o{ signal_inbox : "signals"
    task_instances ||--o{ externalized_state : "ext state"
    task_instances ||--o{ instance_kv_state : "kv state"
    task_instances ||--o{ checkpoints : "checkpoints"
    task_instances ||--o{ audit_log : "audit events"
    task_instances ||--o{ worker_tasks : "worker tasks"
    task_instances ||--o{ emit_event_dedupe : "child (via child_instance_id)"
    sequences ||--o{ cron_schedules : "scheduled by"
    triggers ||--|| trigger_poll_state : "poll cursor"
    resource_pools ||--o{ pool_resources : "contains"
```

---

### 18. State Machine: `task_instances.state`

The scheduler advances instances through these states. Not all transitions are explicit in the migration files — transitions are enforced in application code.

| State | Description | Terminal? |
|---|---|---|
| `scheduled` | Ready to fire; awaiting `next_fire_at` | No |
| `running` | Currently executing | No |
| `waiting` | Blocked waiting for a signal, sleep, or sub-instance | No |
| `completed` | Successfully finished | Yes |
| `failed` | Unrecoverable failure | Yes |
| `cancelled` | Explicitly cancelled | Yes |

**Evidence from migration indexes:**
- `idx_instances_fire` WHERE `state = 'scheduled'` — confirms `'scheduled'` as a valid state (M9)
- `idx_instances_concurrency` WHERE `state = 'running'` — confirms `'running'` (M10)
- `idx_task_instances_waiting_updated` WHERE `state = 'waiting'` — confirms `'waiting'` (M32)
- `audit_log.from_state`/`to_state` columns store transition states (M16)
- Default `state = 'scheduled'` (M2)

**Note:** Additional states may exist in application code. No CHECK constraint is defined on `state`, so this list is [INFERRED] from index predicates.

---

### 19. State Machine: `worker_tasks.state`

| State | Description | Terminal? |
|---|---|---|
| `pending` | Waiting for a worker to claim | No |
| `claimed` | Claimed by a worker; being executed | No |
| `completed` | Worker reported success | Yes |
| `failed` | Worker reported failure or heartbeat timeout | Yes |

**Evidence:** `idx_worker_tasks_poll` WHERE `state = 'pending'`, `idx_worker_tasks_heartbeat` WHERE `state = 'claimed'` (M12). Default `state = 'pending'`. No CHECK constraint; additional states [INFERRED].

---

### 20. Cross-Tenant Isolation Rules

Every major table has a `tenant_id TEXT NOT NULL` column used for application-level isolation.

| Table | `tenant_id` column | Isolation mechanism |
|---|---|---|
| `sequences` | yes | UNIQUE index includes `tenant_id` |
| `task_instances` | yes | Composite indexes + idempotency UNIQUE includes `tenant_id` |
| `cron_schedules` | yes | — |
| `worker_tasks` | via `instance_id` join | No direct `tenant_id` column |
| `rate_limits` | yes | UNIQUE on `(tenant_id, resource_key)` |
| `resource_pools` | yes | UNIQUE on `(tenant_id, name)` |
| `sessions` | yes | UNIQUE on `(tenant_id, session_key)` |
| `triggers` | yes | — |
| `plugins` | yes (`''` = global) | — |
| `credentials` | yes (`''` = global) | — |
| `api_keys` | yes | — |
| `circuit_breakers` | yes (PK composite) | Per-tenant breaker isolation |
| `rollback_policies` | yes | UNIQUE on `(tenant_id, sequence_name)` |
| `worker_registrations` | yes (optional) | — |
| `worker_version_pins` | yes (PK composite) | — |
| `queue_routing_rules` | yes | — |
| `queue_dispatch` | yes (PK composite) | — |
| `usage_events` | yes | — |

**RLS:** Deferred migration `039_enable_rls.sql.deferred` would add PostgreSQL Row-Level Security to most tables, but it is **not applied by default**. Application-level `tenant_id` filtering is the current isolation mechanism.

---

### 21. Idempotency & Deduplication Rules

1. **Instance creation idempotency** (M10/M30): `task_instances.(tenant_id, idempotency_key)` PARTIAL UNIQUE WHERE `idempotency_key IS NOT NULL`. A second `INSERT` with the same key returns the existing row instead of creating a duplicate. Scoped **per tenant** (M30 fixed a global-unique bug from M10).

2. **Emit-event deduplication** (M25/M26): `emit_event_dedupe.(scope_kind, scope_value, dedupe_key)` PRIMARY KEY. Two scopes:
   - `scope_kind = 'parent'`: deduplicates within a single parent instance
   - `scope_kind = 'tenant'`: deduplicates across all instances for a tenant
   On child deletion, the dedupe row cascades (M31), allowing re-emission.

3. **Worker task deduplication** (M12): `worker_tasks.(instance_id, block_id)` UNIQUE — one active task per block per instance.

4. **Session deduplication** (M17): `sessions.(tenant_id, session_key)` UNIQUE.

5. **Sequence versioning** (M1): `sequences.(tenant_id, namespace, name, version)` UNIQUE — each `(name, version)` combination is unique within a tenant+namespace.

6. **Cron overlap policy** (M46): The `overlap_policy` column on `cron_schedules` controls what happens when a cron fires while a previous instance is still running: `allow`, `skip`, `buffer_one`, `cancel_previous`.

7. **Concurrency control** (M10): `task_instances.concurrency_key` + `max_concurrency` enforce an upper bound on simultaneously running instances sharing the same key. The scheduler counts running instances via `idx_instances_concurrency` before allowing a new instance to start.

---

### 22. Cascade Deletion Map

When a `task_instances` row is deleted (e.g. retention pruning), the following rows are automatically deleted:

| Child table | FK column | Cascade behavior | Migration |
|---|---|---|---|
| `execution_tree` | `instance_id` | ON DELETE CASCADE | M34 |
| `block_outputs` | `instance_id` | ON DELETE CASCADE | M34 |
| `signal_inbox` | `instance_id` | ON DELETE CASCADE | M34 |
| `worker_tasks` | `instance_id` | ON DELETE CASCADE | M34 |
| `externalized_state` | `instance_id` | ON DELETE CASCADE | M24 |
| `instance_kv_state` | `instance_id` | ON DELETE CASCADE | M33 |
| `checkpoints` | `instance_id` | ON DELETE CASCADE | M15 |
| `audit_log` | `instance_id` | ON DELETE CASCADE | M16 |
| `emit_event_dedupe` | `child_instance_id` | ON DELETE CASCADE | M31 |
| `task_instances` (self) | `parent_instance_id` | ON DELETE SET NULL | M34 |

**Non-cascading FKs** (deletion blocked unless child is removed first):
- `task_instances.sequence_id` → `sequences(id)` (RESTRICT)
- `cron_schedules.sequence_id` → `sequences(id)` (RESTRICT)

**Cascade within child tables:**
- `pool_resources.pool_id` → `resource_pools(id)` ON DELETE CASCADE (M13)
- `trigger_poll_state.slug` → `triggers(slug)` ON DELETE CASCADE (M44)

---

### 23. Deferred Migrations

The file `039_enable_rls.sql.deferred` enables PostgreSQL Row-Level Security on 21 tables:

```
sequences, execution_tree, block_outputs, rate_limits, signal_inbox,
worker_tasks, cron_schedules, task_instances, resource_pools, pool_resources,
checkpoints, audit_log, sessions, cluster_nodes, triggers, plugins,
credentials, externalized_state, circuit_breakers, emit_event_dedupe,
instance_kv_state
```

This migration is **intentionally not applied by default**. When/if applied, tenant isolation switches from application-level filtering to database-enforced RLS policies. RLS policies themselves are not defined in this migration file — they must be provided separately.

**UI implication:** The UI must always pass `tenant_id` in queries even when RLS is active, as RLS policies will match on it. Do not assume RLS is active.

---

### 24. Down (Rollback) Migrations

Only 7 migrations have corresponding down scripts in `engine/migrations/down/`:

| Migration | Down available | Data loss on rollback |
|---|---|---|
| `026_emit_event_dedupe_scope.sql` | Yes | All `scope_kind = 'tenant'` rows lost |
| `027_block_outputs_multirow.sql` | Yes | Requires manual deduplication first |
| `034_task_instance_fk_cascade.sql` | Yes | No data loss; FK behavior reverts to RESTRICT |
| `035_telemetry.sql` | Yes | All telemetry data deleted |
| `036_sequence_status.sql` | Yes | `status` column lost from all sequences |
| `037_rollback_policies.sql` | Yes | All policies and history deleted |
| `044_trigger_poll_state.sql` | Yes | All poll cursors deleted; polling triggers restart from scratch |

Migrations **001–025, 028–033, 038–043, 045–052** have **no down migrations** — they are forward-only and cannot be automatically rolled back.

---

*Generated from migrations 001–052 plus `down/` directory. All facts are sourced directly from SQL files unless marked [INFERRED]. Open issues are tracked in the structured output metadata.*
