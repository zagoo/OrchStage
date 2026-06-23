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
  'self_modify',
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
  self_modify: 'Injects new blocks into THIS running sequence at runtime — advanced; enables agent self-modification.',
  embed: 'Computes a vector embedding for the input text.',
  fail: 'Deliberately fails this step with a message and code.',
  noop: 'Does nothing — a placeholder / no-op step.',
}

/** Business meaning for a known handler, or undefined for an unknown (custom) one. */
export function handlerDescription(handler: string): string | undefined {
  return HANDLER_DESCRIPTION[handler]
}

/**
 * SINGLE SOURCE OF TRUTH for handler parameters. One `HandlerParamDef` per param a
 * handler reads — EVERY param (required AND optional), derived field-for-field from
 * the engine handler source (orch8-engine/src/handlers/*). The starter template, the
 * complete in-editor parameter reference, the required-param check, and the value
 * validation ALL derive from this one list, so they cannot drift apart. When the
 * engine adds/changes a param, edit THIS list and everything follows.
 *
 * Flags:
 *  - `required`        : must be present and non-blank ('' / null = missing).
 *  - `requiredPresent` : the KEY must exist; any value (incl. null/'') is fine
 *                        (e.g. set_state.value, merge_state.values).
 *  - `oneOf`           : group id — at least ONE member of the group must be present
 *                        and non-blank (e.g. memory_store needs `text` OR `embedding`).
 *  - `enumValues`      : allowed string values. Validated unless `enumOpen` (advisory,
 *                        e.g. llm_call.provider falls back to openai). `allowObjectEnum`
 *                        also accepts an object value (send_signal.signal_type custom).
 *  - `min`/`max`       : integer bounds (validated). `url` : must be http(s) (validated).
 *  - `example`         : value placed in the prefill template. Omit to keep a param
 *                        OUT of the starter template but STILL listed in the reference
 *                        (used for advanced/provider-specific params). `name` may be a
 *                        nested path ('tool_dispatch.type') or array-item path
 *                        ('messages[].role') for reference + validation only.
 */
export type HandlerParamType = 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array' | 'any'

export interface HandlerParamDef {
  name: string
  type: HandlerParamType
  desc: string
  required?: boolean
  requiredPresent?: boolean
  oneOf?: string
  enumValues?: readonly string[]
  enumOpen?: boolean
  allowObjectEnum?: boolean
  min?: number
  max?: number
  url?: boolean
  default?: Json
  example?: Json
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
const LLM_PROVIDERS = ['openai', 'anthropic', 'gemini', 'deepseek', 'qwen', 'perplexity', 'groq', 'together', 'mistral', 'openrouter'] as const
const MESSAGE_ROLES = ['system', 'user', 'assistant', 'tool'] as const

export const HANDLER_PARAM_SPEC: Record<string, HandlerParamDef[]> = {
  noop: [],
  log: [
    { name: 'message', type: 'any', default: 'no message', example: '', desc: 'Message echoed to the instance log (any JSON value; absent → "no message").' },
    { name: 'level', type: 'string', enumValues: ['debug', 'info', 'warn'], default: 'info', example: 'info', desc: 'Log level; any other value logs at info.' },
  ],
  sleep: [{ name: 'duration_ms', type: 'integer', min: 0, default: 100, example: 1000, desc: 'Pause duration in milliseconds (non-negative integer).' }],
  fail: [
    { name: 'message', type: 'string', default: 'forced failure', example: 'forced failure', desc: 'Error message text.' },
    { name: 'retryable', type: 'boolean', default: false, example: false, desc: 'true → retried; false → permanent failure (DLQ).' },
  ],
  http_request: [
    { name: 'url', type: 'string', required: true, url: true, example: 'https://api.example.com/v1/resource', desc: 'Endpoint URL — http(s), public host (SSRF-guarded).' },
    { name: 'method', type: 'string', enumValues: HTTP_METHODS, default: 'GET', example: 'GET', desc: 'HTTP method (unrecognized → GET).' },
    { name: 'headers', type: 'object', default: {}, example: { 'Content-Type': 'application/json', Authorization: 'Bearer <token>' }, desc: 'Request headers (string values only; Host is rejected).' },
    { name: 'body', type: 'string', default: '', example: '', desc: 'Request body STRING (sent only when non-empty, as application/json).' },
    { name: 'timeout_ms', type: 'integer', min: 0, default: 10000, example: 10000, desc: 'Request timeout in milliseconds.' },
  ],
  llm_call: [
    { name: 'provider', type: 'string', enumValues: LLM_PROVIDERS, enumOpen: true, default: 'openai', example: 'openai', desc: 'API format preset; unknown values fall back to openai (use base_url for custom).' },
    { name: 'model', type: 'string', example: 'gpt-4o', desc: 'Model id (provider/env default if omitted).' },
    { name: 'messages', type: 'array', default: [], example: [{ role: 'user', content: '' }], desc: 'Chat turns [{role, content}]; content is a string or content-block array.' },
    { name: 'messages[].role', type: 'string', enumValues: MESSAGE_ROLES, desc: 'Role of each message.' },
    { name: 'system', type: 'string', example: '', desc: 'System-prompt shorthand.' },
    { name: 'temperature', type: 'number', example: 0.7, desc: 'Sampling temperature (provider default if omitted).' },
    { name: 'max_tokens', type: 'integer', min: 1, default: 4096, example: 4096, desc: 'Max output tokens (Anthropic requires it; defaults 4096).' },
    { name: 'base_url', type: 'string', desc: 'Override the provider API base URL.' },
    { name: 'api_key', type: 'string', desc: 'API key (one-of api_key / api_key_env / provider env var).' },
    { name: 'api_key_env', type: 'string', desc: 'Env var name holding the API key (engine/secret names blocked).' },
    { name: 'top_p', type: 'number', desc: 'Nucleus sampling (both formats).' },
    { name: 'top_k', type: 'integer', desc: 'Top-k sampling (Anthropic only).' },
    { name: 'frequency_penalty', type: 'number', desc: 'OpenAI-compatible only.' },
    { name: 'presence_penalty', type: 'number', desc: 'OpenAI-compatible only.' },
    { name: 'stop', type: 'array', desc: 'Stop sequences string|array (OpenAI-compatible only).' },
    { name: 'stop_sequences', type: 'array', desc: 'Stop sequences (Anthropic only).' },
    { name: 'seed', type: 'integer', desc: 'Deterministic seed (OpenAI-compatible only).' },
    { name: 'n', type: 'integer', desc: 'Number of completions (OpenAI-compatible only).' },
    { name: 'metadata', type: 'object', desc: 'Passed through verbatim (Anthropic only).' },
    { name: 'tools', type: 'array', desc: "Tool/function defs in the provider's native schema." },
    { name: 'tool_choice', type: 'any', desc: 'Tool-selection strategy (provider-native).' },
    { name: 'response_format', type: 'object', desc: 'e.g. {"type":"json_object"} (OpenAI-compatible only).' },
    { name: 'response_schema', type: 'object', desc: 'JSON Schema; response is extracted, validated and repaired.' },
    { name: 'max_repair_attempts', type: 'integer', min: 0, max: 5, default: 2, desc: 'Schema-repair re-calls (capped at 5).' },
    { name: 'max_image_bytes', type: 'integer', min: 1, default: 20971520, desc: 'Per-image size cap, ≤ 20 MiB.' },
    { name: 'stream', type: 'boolean', default: false, desc: 'Consume the SSE stream (ignored when response_schema set).' },
    { name: 'stream_idle_timeout_secs', type: 'integer', min: 0, default: 30, desc: 'Max gap between streamed chunks.' },
    { name: 'total_timeout_secs', type: 'integer', min: 0, default: 120, desc: 'Cumulative failover timeout (0 disables).' },
    { name: 'per_provider_timeout_secs', type: 'integer', min: 0, default: 60, desc: 'Per-provider failover timeout (0 disables).' },
    { name: 'providers', type: 'array', desc: 'Failover list; each entry overlays the top-level params.' },
  ],
  tool_call: [
    { name: 'url', type: 'string', required: true, url: true, example: '', desc: 'Tool endpoint URL — http(s), SSRF-guarded.' },
    { name: 'tool_name', type: 'string', default: 'unknown', example: '', desc: 'Tool name echoed into the request envelope and output.' },
    { name: 'arguments', type: 'object', default: {}, example: {}, desc: 'Tool arguments placed in the default JSON envelope.' },
    { name: 'method', type: 'string', enumValues: ['GET', 'POST', 'PUT', 'PATCH'], default: 'POST', example: 'POST', desc: 'HTTP method (unrecognized → POST; no DELETE).' },
    { name: 'headers', type: 'object', default: {}, example: {}, desc: 'Extra headers (string values; forbidden names dropped).' },
    { name: 'timeout_ms', type: 'integer', min: 0, default: 30000, example: 30000, desc: 'Per-request timeout in milliseconds.' },
    { name: 'response_as', type: 'string', enumValues: ['artifact'], desc: 'Set "artifact" to store a 2xx/3xx body as a durable artifact.' },
    { name: 'body_artifact', type: 'object', desc: 'Artifact ref whose bytes become the request body ({key, content_type?}).' },
    { name: 'upload', type: 'object', desc: 'Upload mode {mode:"multipart", field?, filename?} (needs body_artifact).' },
  ],
  mcp_call: [
    { name: 'url', type: 'string', oneOf: 'endpoint', url: true, example: '', desc: 'MCP endpoint URL — http(s) (one-of url / server; url wins).' },
    { name: 'server', type: 'string', oneOf: 'endpoint', desc: 'Named server from context.config.mcp_servers (alternative to url).' },
    { name: 'action', type: 'string', enumValues: ['call', 'list'], default: 'call', example: 'call', desc: '"call" invokes a tool; "list" discovers tools.' },
    { name: 'tool_name', type: 'string', example: '', desc: 'Tool to invoke — required when action="call".' },
    { name: 'arguments', type: 'object', default: {}, example: {}, desc: 'Tool arguments (action="call").' },
    { name: 'headers', type: 'object', default: {}, example: {}, desc: 'Extra headers merged over server headers (string values only).' },
    { name: 'timeout_ms', type: 'integer', min: 0, default: 30000, example: 30000, desc: 'Per-request timeout in milliseconds.' },
    { name: 'protocol_version', type: 'string', default: '2025-06-18', example: '2025-06-18', desc: 'MCP protocol version advertised on initialize.' },
  ],
  agent: [
    // goal / messages are both optional (an empty conversation is allowed) — use one.
    { name: 'goal', type: 'string', example: '', desc: 'Single-turn task; the conversation seed (use this or messages).' },
    { name: 'messages', type: 'array', desc: 'Conversation seed [{role, content}] (overrides goal when non-empty).' },
    { name: 'system', type: 'string', example: '', desc: 'System prompt forwarded to each llm_call.' },
    { name: 'model', type: 'string', example: '', desc: 'Model id forwarded to llm_call.' },
    { name: 'max_iterations', type: 'integer', min: 1, max: 50, default: 6, example: 6, desc: 'Reason→act cycle cap (clamped to 1–50).' },
    { name: 'tools', type: 'array', default: [], example: [], desc: 'OpenAI tool schema; auto-discovered via MCP when omitted and dispatch type=mcp.' },
    { name: 'tool_dispatch', type: 'object', example: { type: 'http', url: '' }, desc: 'How tool calls execute: {type, url, server?, headers?}.' },
    { name: 'tool_dispatch.type', type: 'string', enumValues: ['http', 'mcp'], default: 'http', desc: 'Dispatch transport.' },
    { name: 'tool_dispatch.url', type: 'string', url: true, desc: 'Tool/MCP endpoint (required once a tool is dispatched).' },
    { name: 'auto_memory', type: 'object', desc: 'Recall-before / store-after: {recall_k, store_outcome, model, api_key|api_key_env, base_url}.' },
    { name: 'provider', type: 'string', enumValues: LLM_PROVIDERS, enumOpen: true, desc: 'Forwarded to llm_call.' },
    { name: 'providers', type: 'array', desc: 'Failover list forwarded to llm_call.' },
    { name: 'api_key', type: 'string', desc: 'Forwarded to llm_call.' },
    { name: 'api_key_env', type: 'string', desc: 'Forwarded to llm_call.' },
    { name: 'base_url', type: 'string', desc: 'Forwarded to llm_call.' },
    { name: 'temperature', type: 'number', desc: 'Forwarded to llm_call.' },
    { name: 'max_tokens', type: 'integer', min: 1, desc: 'Forwarded to llm_call.' },
    { name: 'total_timeout_secs', type: 'integer', min: 0, desc: 'Forwarded to llm_call.' },
    { name: 'per_provider_timeout_secs', type: 'integer', min: 0, desc: 'Forwarded to llm_call.' },
  ],
  // Convenience handler — NOT an engine builtin; the server forwards it leniently, so
  // these fields are not engine-validated.
  email_send: [
    { name: 'template', type: 'string', example: '', desc: 'Email template id.' },
    { name: 'to', type: 'string', example: '', desc: 'Recipient address.' },
    { name: 'cc', type: 'array', example: [], desc: 'CC addresses.' },
    { name: 'data', type: 'object', example: {}, desc: 'Template substitution data.' },
  ],
  // Pass-through: the resolved params object is returned verbatim — no fixed keys.
  transform: [],
  assert: [
    { name: 'condition', type: 'string', required: true, example: '', desc: 'Expression evaluated against context; step fails if falsy.' },
    { name: 'message', type: 'string', default: 'assertion failed', example: 'assertion failed', desc: 'Failure message.' },
  ],
  memory_store: [
    { name: 'text', type: 'string', oneOf: 'content', example: '', desc: 'Text to store and embed (one-of text / embedding).' },
    { name: 'embedding', type: 'array', oneOf: 'content', desc: 'Precomputed vector (skips the embed call).' },
    { name: 'key', type: 'string', example: '', desc: 'Memory key (defaults to a content hash of text).' },
    { name: 'metadata', type: 'object', default: {}, example: {}, desc: 'Arbitrary metadata stored on the record.' },
    { name: 'model', type: 'string', default: 'text-embedding-3-small', desc: 'Embedding model (when embedding from text).' },
    { name: 'base_url', type: 'string', default: 'https://api.openai.com/v1', desc: 'Embeddings API base URL.' },
    { name: 'api_key', type: 'string', desc: 'Embeddings API key (one-of api_key / api_key_env, when embedding from text).' },
    { name: 'api_key_env', type: 'string', desc: 'Env var name for the embeddings key.' },
    { name: 'timeout_ms', type: 'integer', min: 0, default: 30000, desc: 'Embed request timeout.' },
  ],
  memory_search: [
    { name: 'query', type: 'string', oneOf: 'query', example: '', desc: 'Search text to embed (one-of query / query_embedding).' },
    { name: 'query_embedding', type: 'array', oneOf: 'query', desc: 'Precomputed query vector (skips the embed call).' },
    { name: 'top_k', type: 'integer', min: 1, default: 5, example: 5, desc: 'Max results (floored to 1).' },
    { name: 'model', type: 'string', default: 'text-embedding-3-small', desc: 'Embedding model (when embedding the query).' },
    { name: 'base_url', type: 'string', default: 'https://api.openai.com/v1', desc: 'Embeddings API base URL.' },
    { name: 'api_key', type: 'string', desc: 'Embeddings API key (one-of api_key / api_key_env).' },
    { name: 'api_key_env', type: 'string', desc: 'Env var name for the embeddings key.' },
    { name: 'timeout_ms', type: 'integer', min: 0, default: 30000, desc: 'Embed request timeout.' },
  ],
  blob_put: [
    { name: 'text', type: 'string', oneOf: 'payload', example: '', desc: 'UTF-8 content to store (one-of text / data; text wins).' },
    { name: 'data', type: 'string', oneOf: 'payload', desc: 'Base64-encoded binary content.' },
    { name: 'content_type', type: 'string', default: 'text/plain; charset=utf-8', example: 'text/plain; charset=utf-8', desc: 'MIME type stored with the blob.' },
    { name: 'max_size_bytes', type: 'integer', min: 1, default: 26214400, example: 26214400, desc: 'Reject payloads larger than this (default 25 MiB).' },
  ],
  blob_get: [
    { name: 'ref', type: 'string', required: true, example: '', desc: 'Artifact key string, {key}, or {artifact:{key}} (owned by this instance).' },
    { name: 'encoding', type: 'string', enumValues: ['base64', 'utf8', 'text'], default: 'base64', example: 'base64', desc: 'Output encoding (utf8 and text are equivalent).' },
    { name: 'max_size_bytes', type: 'integer', min: 1, default: 26214400, example: 26214400, desc: 'Reject artifacts larger than this (default 25 MiB).' },
  ],
  human_review: [
    { name: 'review_data', type: 'any', default: null, example: null, desc: 'Data presented to the reviewer.' },
    { name: 'instructions', type: 'string', default: '', example: '', desc: 'Instructions shown to the reviewer.' },
    { name: 'reviewer', type: 'string', default: 'unassigned', example: 'unassigned', desc: 'Assigned reviewer.' },
    { name: 'notify_url', type: 'string', url: true, example: '', desc: 'Optional webhook to notify (SSRF-guarded; blank = none).' },
    { name: 'notify_headers', type: 'object', default: {}, example: {}, desc: 'Headers for the notify webhook (string values only).' },
  ],
  emit_event: [
    { name: 'trigger_slug', type: 'string', required: true, example: '', desc: 'Trigger slug of the child sequence to start.' },
    { name: 'data', type: 'any', default: {}, example: {}, desc: "Payload passed as the child instance's context data." },
    { name: 'meta', type: 'object', default: {}, example: {}, desc: 'Caller metadata (source / parent_instance_id are system-set).' },
    { name: 'dedupe_key', type: 'string', example: '', desc: 'Idempotency key — when set, a non-empty string suppresses duplicate emits.' },
    { name: 'dedupe_scope', type: 'string', enumValues: ['parent', 'tenant'], default: 'parent', example: 'parent', desc: 'Dedupe identity scope (only meaningful with dedupe_key).' },
  ],
  send_signal: [
    { name: 'instance_id', type: 'string', required: true, example: '', desc: 'Target instance UUID (same tenant, non-terminal).' },
    { name: 'signal_type', type: 'string', required: true, enumValues: ['pause', 'resume', 'cancel', 'update_context'], allowObjectEnum: true, example: 'cancel', desc: 'Signal kind; or { "custom": "name" } for a custom signal.' },
    { name: 'payload', type: 'any', default: null, example: null, desc: 'Signal payload stored verbatim.' },
  ],
  query_instance: [{ name: 'instance_id', type: 'string', required: true, example: '', desc: 'Instance UUID to read (same tenant; not-found → {found:false}).' }],
  set_state: [
    { name: 'key', type: 'string', required: true, example: '', desc: 'State key to write.' },
    { name: 'value', type: 'any', requiredPresent: true, example: '', desc: 'Value to store (any JSON, including null — the KEY must be present).' },
  ],
  get_state: [{ name: 'key', type: 'string', required: true, example: '', desc: 'State key to read (value is null if absent).' }],
  delete_state: [{ name: 'key', type: 'string', required: true, example: '', desc: 'State key to remove.' }],
  merge_state: [{ name: 'values', type: 'object', requiredPresent: true, example: {}, desc: 'Object whose entries are merged into instance state (empty object allowed).' }],
  self_modify: [
    { name: 'blocks', type: 'array', required: true, example: [{ id: 'dynamic_step', type: 'step', handler: 'log', params: { message: 'injected at runtime' } }], desc: 'Block definitions to inject into THIS running sequence (validated as BlockDefinition[]).' },
    { name: 'position', type: 'integer', min: 0, desc: '0-indexed position to insert at; omit to append at the end.' },
  ],
  embed: [
    { name: 'input', type: 'string', required: true, example: '', desc: 'Text (or array of texts) to embed.' },
    { name: 'model', type: 'string', default: 'text-embedding-3-small', example: 'text-embedding-3-small', desc: 'Embedding model.' },
    { name: 'base_url', type: 'string', default: 'https://api.openai.com/v1', desc: 'Embeddings API base URL.' },
    { name: 'api_key', type: 'string', desc: 'Embeddings API key (one-of api_key / api_key_env).' },
    { name: 'api_key_env', type: 'string', desc: 'Env var name for the embeddings key.' },
    { name: 'timeout_ms', type: 'integer', min: 0, default: 30000, desc: 'Request timeout in milliseconds.' },
  ],
}

/** True for a path that targets a nested object field or array item (reference/validation only). */
function isPathName(name: string): boolean {
  return name.includes('.') || name.includes('[]')
}

function buildHandlerTemplate(defs: HandlerParamDef[]): Json {
  const obj: Record<string, Json> = {}
  for (const d of defs) if (d.example !== undefined && !isPathName(d.name)) obj[d.name] = d.example
  return obj
}

/**
 * Starter `params` template per handler — DERIVED from HANDLER_PARAM_SPEC (every param
 * marked with an `example`). Selecting a handler prefills the Params JSON with this.
 */
export const HANDLER_PARAM_TEMPLATE: Record<string, Json> = Object.fromEntries(
  STEP_HANDLERS.map((h) => [h, buildHandlerTemplate(HANDLER_PARAM_SPEC[h] ?? [])]),
)

function isBlankParam(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
}

/**
 * The required params a step's handler is MISSING, given its params object — derived
 * from HANDLER_PARAM_SPEC (`required`, `requiredPresent`, `oneOf` groups). Returns `[]`
 * when nothing is missing. Drives the live editor hint and the save-blocking validation.
 */
export function missingHandlerParams(handler: string, params: unknown): string[] {
  const defs = HANDLER_PARAM_SPEC[handler]
  if (!defs) return []
  const obj: Record<string, unknown> =
    params != null && typeof params === 'object' && !Array.isArray(params) ? (params as Record<string, unknown>) : {}
  const missing: string[] = []
  const groups: Record<string, HandlerParamDef[]> = {}
  for (const d of defs) {
    if (isPathName(d.name)) continue
    if (d.oneOf) {
      ;(groups[d.oneOf] ??= []).push(d)
    } else if (d.required && isBlankParam(obj[d.name])) {
      missing.push(d.name)
    } else if (d.requiredPresent && !(d.name in obj)) {
      missing.push(d.name)
    }
  }
  for (const g of Object.values(groups)) {
    if (g.every((d) => isBlankParam(obj[d.name]))) missing.push(g.map((d) => d.name).join(' or '))
  }
  // mcp_call: `tool_name` is required for the default 'call' action, not for 'list'.
  if (handler === 'mcp_call' && obj.action !== 'list' && isBlankParam(obj.tool_name)) {
    missing.push('tool_name')
  }
  return missing
}

/** A `{{ … }}` template reference is resolved at runtime — skip static value checks. */
function isTemplateRef(v: unknown): boolean {
  return typeof v === 'string' && v.includes('{{')
}

/** Values at a path: scalar/nested ('a' | 'a.b') → one value; array-item ('a[].b') → one per item. */
function valuesAtPath(obj: Record<string, unknown>, path: string): unknown[] {
  if (path.includes('[].')) {
    const [arrKey, field] = path.split('[].')
    const arr = obj[arrKey]
    if (!Array.isArray(arr)) return []
    return arr.map((it) => (it != null && typeof it === 'object' ? (it as Record<string, unknown>)[field] : undefined))
  }
  if (!path.includes('.')) return [obj[path]]
  let cur: unknown = obj
  for (const p of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return [undefined]
    cur = (cur as Record<string, unknown>)[p]
  }
  return [cur]
}

/**
 * Validation messages for PRESENT param values that violate the engine's value
 * constraints (wrong enum value, out-of-range/non-integer number, malformed URL) —
 * derived from HANDLER_PARAM_SPEC. Absent/blank values are ignored (covered by
 * missingHandlerParams), `{{ … }}` template refs are skipped, and `enumOpen` enums
 * (open sets like llm_call.provider) are advisory only. Drives the live editor hint
 * and the save-blocking validation alongside missingHandlerParams.
 */
export function invalidHandlerParams(handler: string, params: unknown): string[] {
  const defs = HANDLER_PARAM_SPEC[handler]
  if (!defs) return []
  const obj: Record<string, unknown> =
    params != null && typeof params === 'object' && !Array.isArray(params) ? (params as Record<string, unknown>) : {}
  const out: string[] = []
  for (const d of defs) {
    const hasEnum = d.enumValues && !d.enumOpen
    if (!hasEnum && d.min == null && d.max == null && !d.url) continue
    for (const v of valuesAtPath(obj, d.name)) {
      if (v === undefined || v === null) continue
      if (typeof v === 'string' && v.trim() === '') continue
      if (isTemplateRef(v)) continue
      if (hasEnum) {
        const vals = d.enumValues as readonly string[]
        if (typeof v === 'object') {
          if (!d.allowObjectEnum) out.push(`${d.name} must be one of: ${vals.join(', ')}`)
        } else if (typeof v !== 'string' || !vals.includes(v)) {
          out.push(`${d.name} must be one of: ${vals.join(', ')}${d.allowObjectEnum ? ' (or {"custom":"…"})' : ''}`)
        }
      } else if (d.url) {
        if (typeof v !== 'string' || !/^https?:\/\//i.test(v)) out.push(`${d.name} must be an http(s) URL`)
      } else if (d.min != null || d.max != null) {
        if (typeof v !== 'number' || !Number.isInteger(v) || (d.min != null && v < d.min) || (d.max != null && v > d.max)) {
          const range = d.min != null && d.max != null ? `${d.min}–${d.max}` : d.min != null ? `≥ ${d.min}` : `≤ ${d.max}`
          out.push(`${d.name} must be an integer ${range}`)
        }
      }
    }
  }
  return out
}

/** One row of the complete in-editor parameter reference for a handler. */
export interface ParamRefRow {
  name: string
  required: boolean
  /** Compact type · constraint · default summary, e.g. "integer 1–50 · default 6". */
  meta: string
  desc: string
}

function paramMeta(d: HandlerParamDef): string {
  const parts: string[] = [d.type]
  if (d.enumValues) parts.push(`one of: ${d.enumValues.join(', ')}${d.allowObjectEnum ? ' (or {"custom":…})' : ''}${d.enumOpen ? ' (or custom)' : ''}`)
  if (d.url) parts.push('http(s) URL')
  if (d.min != null || d.max != null) parts.push(d.min != null && d.max != null ? `${d.min}–${d.max}` : d.min != null ? `≥ ${d.min}` : `≤ ${d.max}`)
  if (d.oneOf) parts.push(`one-of ${d.oneOf}`)
  if (d.default !== undefined) parts.push(`default ${JSON.stringify(d.default)}`)
  return parts.join(' · ')
}

/**
 * The COMPLETE parameter reference for a handler (EVERY param the engine reads, not
 * just the templated ones) — shown in the editor under the Params example so the full
 * parameter surface is always visible. Empty for unknown/custom handlers.
 */
export function handlerParamReference(handler: string): ParamRefRow[] {
  return (HANDLER_PARAM_SPEC[handler] ?? []).map((d) => ({
    name: d.name,
    required: !!d.required || !!d.requiredPresent,
    meta: paramMeta(d),
    desc: d.desc,
  }))
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
