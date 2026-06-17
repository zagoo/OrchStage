# Orch8 UI — Build Conventions (read before implementing any feature)

This file is the contract every feature module follows so the parallel-built screens
stay consistent. The **foundation is already built** — do NOT reinvent the design system,
HTTP client, stores, or routing. Compose them.

## Stack
- Vue 3 (`<script setup lang="ts">`, strict TS, **no `any`** — use `unknown` + type guards), Vite, Pinia, Vue Router 4.
- Tailwind v4 with theme tokens (see below), Lucide icons via `lucide-vue-next`, Vue Flow for the DAG canvas, Zod for schema/validation, Vitest + @vue/test-utils.

## Directory layout
```
src/
  api/            http.ts (client), errors.ts (ApiError), sse.ts, query.ts, types/common.ts
  api/<domain>.ts        ← you add: typed endpoint functions for a domain
  api/types/<domain>.ts  ← you add: request/response interfaces for a domain
  stores/<domain>.ts     ← you add (when cross-view state is needed)
  views/<Name>View.vue   ← you implement (stubs already routed)
  components/<domain>/    ← you add: domain-specific components
  components/ui/          ← shared UI kit (DO NOT duplicate; import from here)
  composables/            useAsync, usePolling (+ add domain composables)
  lib/                    validation.ts, format.ts, cn.ts
```

## HTTP client (`@/api/http`)
```ts
import { http, API_V1 } from '@/api/http'
import { asItems } from '@/api/types/common'
// callers pass FULL paths. Canonical surface is API_V1 = '/api/v1'.
export function listInstances(q: ListInstancesQuery, signal?: AbortSignal) {
  return http.get<TaskInstance[]>(`${API_V1}/instances`, { query: q, signal })
}
export function createInstance(body: CreateInstanceRequest, signal?: AbortSignal) {
  return http.post<TaskInstance>(`${API_V1}/instances`, body, { signal })
}
```
- `http.get/post/put/patch/del` parse JSON, return `T`, and **throw `ApiError`** on non-2xx (envelope auto-parsed). 204/empty → `undefined`.
- Some list endpoints return a bare array, others `{ items }` — normalise with `asItems<T>(payload)`.
- Auth headers (`X-API-Key`, `X-Tenant-Id`) are injected automatically from the connection store. Never set them yourself.
- SSE: use `openEventStream(path, handlers)` from `@/api/sse`.

## Data fetching in views
Use `useAsync` for loads, `usePolling` for live views:
```ts
const list = useAsync((signal) => listInstances(query.value, signal))
onMounted(list.run)
const poll = usePolling(list.run, { intervalMs: 5000 }) // for running-state views
```
Render states: `list.loading` → `<DataTable :loading>`/`<Skeleton>`; `list.error` → error panel with retry (`list.run`); `list.data` → content; empty → `<EmptyState>`.

## Errors, toasts, confirms (from `@/stores/ui`)
```ts
const ui = useUiStore()
try { await deleteThing(id); ui.success('Deleted', name) }
catch (e) { ui.error('Delete failed', errorMessage(e)) }   // errorMessage from @/api/errors
// destructive actions:
if (await ui.confirm({ title: 'Cancel instance?', message: '…', tone: 'danger', confirmText: 'Cancel run' })) { … }
```
Every async action MUST handle `ApiError`. Surface `err.status`/`err.code` context (e.g. 409 conflict, 422 validation → map `err.details` to field errors).

## Validation (`@/lib/validation`)
Mirror backend constraints client-side. Compose `FieldRule`s with `validateForm`:
```ts
const { errors, valid } = validateForm(form, {
  name: [required('Name'), identifier()],
  slug: [required('Slug'), slug()],
  cron: [required(), cron()],
  sequence_id: [required('Sequence'), uuid('Sequence ID')],
})
```
Patterns provided: `UUID_RE`, `SLUG_RE` (`^[a-z0-9][a-z0-9-]*$`), `IDENTIFIER_RE`, `isCronExpression`, `isValidJson`. JSON editors must validate with `jsonRule()`.

## UI kit (import from `@/components/ui/*` — full catalog)
Button, IconButton, Spinner, Badge (tones: neutral/accent/success/warning/danger/info/purple/cyan/pink/teal), StatusDot, Panel, Field, Input, Textarea, Select, SearchInput, SegmentedControl, Tabs, DataTable (generic, slots `cell-<key>`), Pagination, Modal, Drawer, Tooltip, KeyValue, CodeBlock, CopyButton, EmptyState, Skeleton, PageHeader.

Every page starts with `<PageHeader title="…" :description :icon>` and an `#actions` slot for primary buttons.

## Status → tone mapping (be consistent)
- instance/queue running → `info`; completed/active/healthy → `success`; failed/open-breaker/error → `danger`; waiting/paused/pending/half-open → `warning`; cancelled/closed/draining/neutral → `neutral`.
- Use `<Badge>` for state labels and `<StatusDot :pulse>` for live/running.

## Icons (Lucide) — use distinct, semantic glyphs
Each entity, action and state gets its own icon (the spec mandates rich, diverse Lucide usage). Examples: retry→RotateCcw, cancel→Ban, pause→Pause, resume→Play, signal→Radio, fork→GitFork, inject→SquarePlus, delete→Trash2, create→Plus, view→Eye, logs→ScrollText, download→Download, refresh→RefreshCw.

## Styling tokens (Tailwind utilities map to theme vars; switch with `[data-theme]`)
Backgrounds: `bg-bg` `bg-surface` `bg-surface-2` `bg-elevated` `bg-hover`. Borders: `border-border` `border-border-strong`. Text: `text-text` `text-muted` `text-subtle` `text-faint`. Accents: `text-accent`/`bg-accent`/`bg-accent-soft`, plus `success|warning|danger|info|purple|cyan|pink|teal` (+ `-soft`). Mono: `class="mono"`. Never hard-code hex; use tokens.

## Accessibility
WCAG 2.1 AA: every icon-only control has `aria-label` (IconButton requires `label`), focus-visible rings are global, modals/drawers use `role="dialog" aria-modal`, tables use `<th scope>`. Keyboard: Esc closes overlays.

## Tests (Vitest)
Coverage gate >80% on `lib/`, `api/`, `stores/`, `composables/`. Write `*.spec.ts` next to the unit. Test validators (valid+invalid+boundary), formatters, the http error parser, store transitions, and state-machine guards. Tests encode WHY (business intent), not just WHAT.

## Traceability
Every api function, validator, and component traces to a DESIGN_REFERENCE endpoint/rule. Reference the endpoint in a comment (`// GET /api/v1/instances — DESIGN_REFERENCE §Instances`).
