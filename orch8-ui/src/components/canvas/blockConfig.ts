/**
 * Per-block-type visual configuration: icon component + accent CSS class.
 * Each block type gets a distinct Lucide icon and a unique accent color.
 *
 * DESIGN_REFERENCE §dag-sequences.md §3 Block Type Taxonomy
 */
import {
  Play,          // step
  GitBranch,     // parallel
  Zap,           // race
  RefreshCw,     // loop
  List,          // for_each
  GitFork,       // router
  Shield,        // try_catch
  ExternalLink,  // sub_sequence
  Shuffle,       // a_b_split
  Lock,          // cancellation_scope
  // handler-specific icons for step sub-types
  Globe,         // http_request
  Brain,         // llm_call
  Wrench,        // tool_call
  Server,        // mcp_call
  Bot,           // agent
  Database,      // memory_store / memory_search
  HardDrive,     // blob_put / blob_get
  Users,         // human_review
  Radio,         // emit_event / send_signal
  Eye,           // query_instance
  Layers,        // set_state / get_state
  Wand2,         // transform
  CheckCircle2,  // assert
  Merge,         // merge_state
  MessageSquare, // log
  Clock,         // sleep
  XCircle,       // fail
  Cpu,           // embed
} from 'lucide-vue-next'
import type { Component, InjectionKey, Ref } from 'vue'
import type { BlockType } from '@/api/types/sequences'
import type { Json } from '@/api/types/common'

/**
 * Which field a canvas node shows as its MAIN (primary) title line. Toggled from
 * the toolbar (see CanvasToolbar / FlowCanvasView) and read by BlockNode via inject.
 *   'id'    → the block id is the title, the descriptive field is the subtitle
 *   'label' → swapped: the descriptive field (handler / sequence name / type) leads
 */
export type NodeTitleField = 'id' | 'label'
export const NODE_TITLE_FIELD: InjectionKey<Ref<NodeTitleField>> = Symbol('node-title-field')

export interface BlockVisual {
  icon: Component
  colorClass: string // Tailwind text-* and bg-*-soft
  label: string
}

// Handler name → specific icon for Step blocks
const HANDLER_ICON: Record<string, Component> = {
  http_request: Globe,
  llm_call: Brain,
  tool_call: Wrench,
  mcp_call: Server,
  agent: Bot,
  memory_store: Database,
  memory_search: Database,
  blob_put: HardDrive,
  blob_get: HardDrive,
  human_review: Users,
  emit_event: Radio,
  send_signal: Radio,
  query_instance: Eye,
  set_state: Layers,
  get_state: Layers,
  delete_state: Layers,
  transform: Wand2,
  assert: CheckCircle2,
  merge_state: Merge,
  log: MessageSquare,
  sleep: Clock,
  fail: XCircle,
  embed: Cpu,
}

/** Icon for a step block, considering handler name first. */
export function stepIcon(handler: string): Component {
  return HANDLER_ICON[handler] ?? Play
}

/** Color class for a step block's handler. */
export function stepColorClass(handler: string): string {
  const colors: Record<string, string> = {
    http_request: 'text-cyan bg-cyan-soft',
    llm_call: 'text-purple bg-purple-soft',
    tool_call: 'text-pink bg-pink-soft',
    mcp_call: 'text-teal bg-teal-soft',
    agent: 'text-accent bg-accent-soft',
    memory_store: 'text-info bg-info-soft',
    memory_search: 'text-info bg-info-soft',
    blob_put: 'text-warning bg-warning-soft',
    blob_get: 'text-warning bg-warning-soft',
    human_review: 'text-success bg-success-soft',
    emit_event: 'text-pink bg-pink-soft',
    send_signal: 'text-pink bg-pink-soft',
    transform: 'text-cyan bg-cyan-soft',
    assert: 'text-success bg-success-soft',
    fail: 'text-danger bg-danger-soft',
  }
  return colors[handler] ?? 'text-muted bg-surface-2'
}

/** Visual config for composite block types. */
export const BLOCK_VISUAL: Record<BlockType, BlockVisual> = {
  step: {
    icon: Play,
    colorClass: 'text-muted bg-surface-2',
    label: 'Step',
  },
  parallel: {
    icon: GitBranch,
    colorClass: 'text-info bg-info-soft',
    label: 'Parallel',
  },
  race: {
    icon: Zap,
    colorClass: 'text-warning bg-warning-soft',
    label: 'Race',
  },
  loop: {
    icon: RefreshCw,
    colorClass: 'text-purple bg-purple-soft',
    label: 'Loop',
  },
  for_each: {
    icon: List,
    colorClass: 'text-cyan bg-cyan-soft',
    label: 'ForEach',
  },
  router: {
    icon: GitFork,
    colorClass: 'text-accent bg-accent-soft',
    label: 'Router',
  },
  try_catch: {
    icon: Shield,
    colorClass: 'text-teal bg-teal-soft',
    label: 'TryCatch',
  },
  sub_sequence: {
    icon: ExternalLink,
    colorClass: 'text-pink bg-pink-soft',
    label: 'SubSequence',
  },
  a_b_split: {
    icon: Shuffle,
    colorClass: 'text-warning bg-warning-soft',
    label: 'ABSplit',
  },
  cancellation_scope: {
    icon: Lock,
    colorClass: 'text-danger bg-danger-soft',
    label: 'CancellationScope',
  },
}

/**
 * One-line business-logic summary per block type — shown in the node editor so the
 * operator understands what the selected Block Type DOES, not just its shape.
 * DESIGN_REFERENCE §dag-sequences.md §3 Block Type Taxonomy.
 */
export const BLOCK_TYPE_DESCRIPTION: Record<BlockType, string> = {
  step: 'A single unit of work — runs one handler with its parameters, then continues.',
  parallel: 'Fan-out: runs every branch concurrently and waits for ALL branches to finish.',
  race: 'Runs branches concurrently; the FIRST to resolve (or succeed) wins and the rest are cancelled.',
  loop: 'Repeats its body while the condition holds, up to max_iterations.',
  for_each: 'Runs its body once per item in a collection (each item bound to item_var).',
  router: 'Evaluates routes top-down; the first matching condition runs its branch, otherwise the default branch runs.',
  try_catch: 'Runs the try block; on error runs the catch block; the finally block always runs.',
  sub_sequence: 'Calls another named sequence as a nested sub-workflow (an opaque step here).',
  a_b_split: 'Splits instances across weighted variants for A/B experiments — one variant runs per instance.',
  cancellation_scope: 'Groups blocks so they can be cancelled together as a single unit.',
}

/** Business-logic summary for a block type. */
export function blockTypeDescription(type: BlockType): string {
  return BLOCK_TYPE_DESCRIPTION[type]
}

/** Known step handler names offered in the editor's handler picker. */
export const STEP_HANDLERS: string[] = [
  'log',
  'sleep',
  'http_request',
  'llm_call',
  'tool_call',
  'mcp_call',
  'agent',
  'email_send',
  'transform',
  'assert',
  'memory_store',
  'memory_search',
  'blob_put',
  'blob_get',
  'human_review',
  'emit_event',
  'send_signal',
  'query_instance',
  'set_state',
  'get_state',
  'delete_state',
  'merge_state',
  'embed',
  'fail',
  'noop',
]

/**
 * One-line business meaning per known step handler — shown next to the Handler
 * picker so the operator understands what the selected handler does. Unknown
 * (custom) handlers return undefined so the editor hides the note.
 */
export const HANDLER_DESCRIPTION: Record<string, string> = {
  log: 'Writes a message to the instance log — observability only, no side effects.',
  sleep: 'Pauses this instance for a fixed duration before continuing.',
  http_request: 'Makes an outbound HTTP call to an external API and captures the response.',
  llm_call: 'Calls a large language model with a prompt and returns its completion.',
  tool_call: 'Invokes a registered tool with arguments.',
  mcp_call: 'Calls a tool exposed by an MCP server.',
  agent: 'Runs an autonomous agent loop (model + tools) until it produces a result.',
  email_send: 'Sends a templated email to one or more recipients.',
  transform: 'Computes a value from an expression over the workflow context.',
  assert: 'Fails the workflow unless the given condition holds.',
  memory_store: 'Persists a value into long-term memory under a key and namespace.',
  memory_search: 'Semantically searches stored memory and returns the closest matches.',
  blob_put: 'Uploads binary/blob content to object storage under a key.',
  blob_get: 'Fetches blob content from object storage by key.',
  human_review: 'Pauses for a human decision or approval (human-in-the-loop).',
  emit_event: 'Publishes an event to the bus for other workflows to react to.',
  send_signal: 'Sends a signal (with payload) to another running instance.',
  query_instance: 'Reads status and state from another workflow instance.',
  set_state: 'Writes a key into this instance mutable state.',
  get_state: 'Reads a key from this instance state.',
  delete_state: 'Removes a key from this instance state.',
  merge_state: 'Merges an object into this instance state.',
  embed: 'Computes a vector embedding for the input text.',
  fail: 'Deliberately fails this step with a message and code.',
  noop: 'Does nothing — a placeholder / no-op step.',
}

/** Business meaning for a known handler, or undefined for an unknown (custom) one. */
export function handlerDescription(handler: string): string | undefined {
  return HANDLER_DESCRIPTION[handler]
}

/**
 * Standard starter `params` template per handler. Selecting a handler in the
 * editor fills the Params JSON with the matching shape. Each template mirrors
 * the engine handler's actual param contract field-for-field (param NAMES, enum
 * values, nested shapes) — see orch8-engine/src/handlers/*. Required params that
 * have no safe generic default are left blank ('') so the editor's required-param
 * validation (see HANDLER_PARAM_REQUIREMENTS) prompts the operator to fill them.
 */
export const HANDLER_PARAM_TEMPLATE: Record<string, Json> = {
  // Reads no params.
  noop: {},
  // `message` echoed to the instance log; `level` ∈ debug|info|warn (others → info).
  log: { message: '', level: 'info' },
  sleep: { duration_ms: 1000 },
  // `retryable` true → step is retried; false → permanent failure.
  fail: { message: 'forced failure', retryable: false },
  // `url` REQUIRED (http/https, SSRF-guarded). `method` ∈ GET|POST|PUT|PATCH|DELETE.
  // `body` is a STRING (sent only when non-empty, as application/json). There is no
  // `query` param — put query-string params directly in the url.
  http_request: {
    url: 'https://api.example.com/v1/resource',
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ${secrets.token}' },
    body: '',
    timeout_ms: 10000,
  },
  // The prompt is the `messages` array (role ∈ system|user|assistant|tool). `provider`
  // ∈ openai|anthropic|gemini|deepseek|qwen|perplexity|groq|together|mistral|openrouter.
  llm_call: {
    provider: 'openai',
    model: 'gpt-4o',
    messages: [{ role: 'user', content: '' }],
    system: '',
    temperature: 0.7,
    max_tokens: 4096,
  },
  // `url` REQUIRED (tool endpoint, SSRF-guarded). `method` defaults to POST.
  tool_call: { url: '', tool_name: '', arguments: {}, method: 'POST', headers: {}, timeout_ms: 30000 },
  // Endpoint is `url` OR `server`; `tool_name` REQUIRED when action='call'. action ∈ call|list.
  mcp_call: { url: '', action: 'call', tool_name: '', arguments: {}, headers: {}, timeout_ms: 30000 },
  // `goal` (or a `messages` array) drives the loop; `tool_dispatch.url` is required once
  // tools are used. tool_dispatch.type ∈ http|mcp.
  agent: {
    goal: '',
    system: '',
    model: '',
    max_iterations: 6,
    tools: [],
    tool_dispatch: { type: 'http', url: '' },
  },
  // Convenience handler — NOT an engine builtin; the server forwards it leniently.
  email_send: { template: '', to: '', cc: [], data: {} },
  // Pass-through: the resolved params object is returned verbatim (use ${...} refs).
  transform: {},
  assert: { condition: '', message: 'assertion failed' },
  // one-of: `text` (embedded for you) OR a precomputed `embedding`. `key` defaults to a content hash.
  memory_store: { text: '', key: '', metadata: {} },
  // one-of: `query` (embedded for you) OR a precomputed `query_embedding`.
  memory_search: { query: '', top_k: 5 },
  // one-of: `text` (utf-8) OR `data` (base64).
  blob_put: { text: '', content_type: 'text/plain; charset=utf-8' },
  // `ref` REQUIRED — a stored artifact key (string), or { key } / { artifact: { key } }.
  // `encoding` ∈ base64|utf8.
  blob_get: { ref: '', encoding: 'base64' },
  // Review choices come from the step's `wait_for_input`, NOT from params.
  human_review: { instructions: '', reviewer: 'unassigned', review_data: null },
  // `trigger_slug` REQUIRED (the child sequence's trigger). dedupe_scope ∈ parent|tenant.
  emit_event: { trigger_slug: '', data: {} },
  // `signal_type` ∈ pause|resume|cancel|update_context, or { custom: 'name' }.
  send_signal: { instance_id: '', signal_type: 'cancel', payload: {} },
  query_instance: { instance_id: '' },
  // `key` REQUIRED; `value` REQUIRED (any JSON value, including null).
  set_state: { key: '', value: '' },
  get_state: { key: '' },
  delete_state: { key: '' },
  // `values` REQUIRED — an object merged into this instance's state.
  merge_state: { values: {} },
  embed: { input: '', model: 'text-embedding-3-small' },
}

/**
 * Required-parameter contract per builtin handler, derived from the engine handler
 * source (orch8-engine/src/handlers/*). The editor uses this to block a save when a
 * step's handler is missing params the server would reject at runtime.
 *
 *  - `required`    : keys that must be present and non-blank ('' / null = missing).
 *  - `requiredAny` : keys that must merely be PRESENT (any JSON value, incl. null/'' —
 *                    e.g. set_state.value / merge_state.values, where an empty value is
 *                    legitimate but the KEY must exist).
 *  - `oneOf`       : groups where at least ONE key must be present and non-blank
 *                    (e.g. memory_store needs `text` OR `embedding`).
 *
 * Handlers absent from this map impose no required-param check — noop, log, sleep,
 * fail, transform, llm_call, agent, human_review (and the non-builtin email_send) all
 * tolerate missing params at the server.
 */
export interface HandlerParamRequirement {
  required?: string[]
  requiredAny?: string[]
  oneOf?: string[][]
}

export const HANDLER_PARAM_REQUIREMENTS: Record<string, HandlerParamRequirement> = {
  http_request: { required: ['url'] },
  tool_call: { required: ['url'] },
  // url OR server; `tool_name` is additionally required for action='call' (in code below).
  mcp_call: { oneOf: [['url', 'server']] },
  assert: { required: ['condition'] },
  set_state: { required: ['key'], requiredAny: ['value'] },
  get_state: { required: ['key'] },
  delete_state: { required: ['key'] },
  merge_state: { requiredAny: ['values'] },
  emit_event: { required: ['trigger_slug'] },
  send_signal: { required: ['instance_id', 'signal_type'] },
  query_instance: { required: ['instance_id'] },
  embed: { required: ['input'] },
  memory_store: { oneOf: [['text', 'embedding']] },
  memory_search: { oneOf: [['query', 'query_embedding']] },
  blob_put: { oneOf: [['text', 'data']] },
  blob_get: { required: ['ref'] },
}

function isBlankParam(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
}

/**
 * The required params a step's handler is MISSING, given its params object. Returns
 * `[]` when the handler has no required params or all are satisfied. Drives both the
 * live editor hint and the save-blocking validation (treeOps.validateSequence).
 */
export function missingHandlerParams(handler: string, params: unknown): string[] {
  const req = HANDLER_PARAM_REQUIREMENTS[handler]
  if (!req) return []
  const obj: Record<string, unknown> =
    params != null && typeof params === 'object' && !Array.isArray(params)
      ? (params as Record<string, unknown>)
      : {}
  const missing: string[] = []
  for (const k of req.required ?? []) if (isBlankParam(obj[k])) missing.push(k)
  for (const k of req.requiredAny ?? []) if (!(k in obj)) missing.push(k)
  for (const group of req.oneOf ?? []) {
    if (group.every((k) => isBlankParam(obj[k]))) missing.push(group.join(' or '))
  }
  // mcp_call: `tool_name` is required for the default 'call' action, not for 'list'.
  if (handler === 'mcp_call' && obj.action !== 'list' && isBlankParam(obj.tool_name)) {
    missing.push('tool_name')
  }
  return missing
}

/**
 * Complete reference examples for the advanced step JSON sub-objects, mirroring
 * the Rust→TS interfaces (RetryPolicy / DelaySpec / SendWindow / ContextAccess /
 * HumanInputDef / EscalationDef) field-for-field, including every nested level
 * and parallel enumeration (e.g. the full `choices` / `days` arrays). These are
 * what the editor's per-field "Insert / Copy example" controls expose, so the
 * complete shape is always available exactly as defined here in source.
 */
export const STEP_JSON_FIELD_EXAMPLE: Record<string, Json> = {
  retry: { max_attempts: 3, initial_backoff: 1, max_backoff: 60, backoff_multiplier: 2 },
  delay: {
    duration: 0,
    business_days_only: false,
    jitter: 0,
    holidays: ['2026-12-25'],
    fire_at_local: '09:00',
    timezone: 'UTC',
  },
  send_window: { start_hour: 9, end_hour: 17, days: [1, 2, 3, 4, 5] },
  context_access: { data: 'all', config: false, audit: false, runtime: false },
  wait_for_input: {
    prompt: 'Approve this step?',
    timeout: 86400,
    escalation_handler: '',
    choices: [
      { label: 'Approve', value: 'approve' },
      { label: 'Reject', value: 'reject' },
    ],
    store_as: 'decision',
    allow_comment: true,
  },
  on_deadline_breach: { handler: '', params: {} },
}

/** State → CSS classes for the live-state ring around a node. */
export const NODE_STATE_RING: Record<string, string> = {
  running: 'ring-2 ring-info animate-pulse',
  waiting: 'ring-2 ring-warning',
  pending: 'ring-1 ring-border',
  completed: 'ring-2 ring-success',
  failed: 'ring-2 ring-danger',
  cancelled: 'ring-1 ring-border',
  skipped: 'ring-1 ring-border opacity-50',
}
